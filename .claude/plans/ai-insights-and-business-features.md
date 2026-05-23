# Plan: AI Insights & AI-Backed Business Features

## Context

The Firm Analytics page (`/insights`) already surfaces rich structured data — pipeline value, overdue engagements, unanswered comment threads, revenue at risk, weekly activity. This plan adds an AI layer on top of that data to:

1. **Translate numbers into narrative** — A brief written by Gemma 4 summarising what's happening and what needs attention (Analytics page)
2. **Act on signals automatically** — Background AI jobs that detect situations requiring action (unanswered threads, engagement kickoff) and create reminders / content without manual work

**AI runtime:** `@huggingface/transformers` with `onnx-community/gemma-4-E2B-it-ONNX` — same pattern as `frontend/scripts/release.mjs`. No API key required; model is ~500MB, downloaded once to `~/.cache/huggingface/` and cached.

**Pipeline singleton pattern** (critical for Next.js): the `pipeline(...)` instance must be cached at module level to avoid reloading the 500MB model on every API call.

---

## Phase 1 — AI Narrative Brief on Analytics Page (2 days)

### What it does

A 3–5 sentence plain-English paragraph appears at the top of `FirmBusinessInsights`. It synthesises the existing `FirmInsightsResponse` (pipeline, overdue, unanswered threads, revenue at risk, weekly stats) into actionable prose. Cached in `firm.settings.aiBrief` (`{ content: string, generatedAt: ISO string }`); refreshed when stale (>1h) or on user demand via a ↺ Refresh button.

### Files to create / modify

| File | Action |
|------|--------|
| `frontend/lib/ai/gemma-client.ts` | New — exports a cached `getGemmaPipeline()` async function; initialises `pipeline('text-generation', 'onnx-community/gemma-4-E2B-it-ONNX')` once and returns the singleton |
| `frontend/lib/ai/firm-brief.ts` | New — `generateFirmBrief(data: FirmInsightsResponse, currencySymbol: string): Promise<string>` — loads pipeline, builds prompt, returns trimmed text |
| `frontend/app/api/firms/[firmId]/ai-brief/route.ts` | New — `GET`: returns cached brief from `firm.settings.aiBrief` if < 60 min old; otherwise generates and persists. Auth: `can_manage`. `POST`: force-refreshes. |
| `frontend/components/dashboard/ai-firm-brief.tsx` | New — client component, fetches `/api/firms/[firmId]/ai-brief`, shows brief in a subtle card with AI badge, timestamp, and ↺ Refresh button. Skeleton on load. |
| `frontend/components/dashboard/firm-business-insights.tsx` | Modify — add `<AiFirmBrief firmId={firmId} />` as the first child |

### Prompt design (firm-brief.ts)

Uses the same `<start_of_turn>user ... <end_of_turn><start_of_turn>model` chat format as `release.mjs`:

```
<start_of_turn>user
You are a concise business advisor. Write 3-5 sentences summarising the most important 
things this professional services firm should act on today. Be specific: name clients, 
values ({currencySymbol}), days overdue. No bullet points or headers.

Snapshot:
- Active clients: {N}, Prospects: {N}, Revenue at risk: {val}
- Active engagements: {N}, Overdue: {N}, Closing within 30 days: {val}
- Unanswered client threads: {N}
- This week: {newClients} new clients, {newEngagements} new engagements, {closed} closed
- Top pipeline items: ...
<end_of_turn>
<start_of_turn>model
```

`max_new_tokens: 120` — enough for 3–5 sentences.

### Caching strategy

Read/write via `prisma.firm.update({ data: { settings: { ...existing, aiBrief: { content, generatedAt } } } })`.  
On GET: if `settings.aiBrief?.generatedAt` is within 60 minutes, return cached `content` immediately without running inference.

---

## Phase 2 — Auto-Reminder from Unanswered Comment Threads (1 day)

### What it does

An Inngest scheduled function runs every 4 hours. It finds document comment threads where:
- The last message is from an external collaborator (`eng_ext_collaborator` / `eng_viewer`)
- The thread has been unanswered for ≥ 48 hours

For each qualifying thread with no existing auto-reminder, Gemma classifies urgency from the comment text and creates a reminder for the firm admin.

Duplicate prevention: each auto-created reminder stores `{ source: 'ai_thread_alert', threadId: docId }` in its `metadata` JSON. The function checks for an existing reminder with matching `metadata.threadId` before creating.

### Files to create / modify

| File | Action |
|------|--------|
| `frontend/lib/insights/unanswered-threads.ts` | New — extract unanswered thread detection from `route.ts` lines 374–422 into a shared `getUnansweredThreads(firmId, engagementIds): Promise<UnansweredThreadItem[]>` util |
| `frontend/lib/ai/comment-classifier.ts` | New — `classifyCommentUrgency(content: string): Promise<{ urgency: 'high' \| 'medium' \| 'low' }>` using Gemma pipeline |
| `frontend/lib/inngest/ai-functions.ts` | New — Inngest function `auto-reminder-unanswered-threads`, cron `"0 */4 * * *"` |
| `frontend/lib/inngest/client.ts` | Modify — register new Inngest function |
| `frontend/app/api/firms/[firmId]/insights/route.ts` | Modify — replace inline unanswered-thread logic with call to `getUnansweredThreads()` |

### Inngest function logic

```
1. Fetch all firm IDs from DB (active firms only)
2. For each firm:
   a. Fetch active engagement IDs
   b. Call getUnansweredThreads(firmId, engagementIds)
   c. Filter: lastMessageAt < now - 48h
   d. For each thread:
      - Query existing reminders where metadata->>'threadId' = thread.threadId
      - If none found:
        · Call classifyCommentUrgency(thread.lastMessage)
        · Create reminder via createReminder() from user-reminders.ts
          title: "Unanswered thread in [engagement] — [document]"
          labelStyle: high→'red', medium→'orange', low→'amber'
          dueDate: tomorrow
          metadata: { source: 'ai_thread_alert', threadId, engagementId }
```

---

## Phase 3 — Engagement Kickoff Checklist (1 day, next sprint)

### What it does

When an engagement's status transitions to `ACTIVE` (new or updated), Gemma generates a 5–8 item markdown checklist tailored to the engagement's name and contract type. Stored in `engagement.settings.aiChecklist`. Surfaced in the engagement overview tab.

| File | Action |
|------|--------|
| `frontend/lib/ai/engagement-checklist.ts` | New — `generateEngagementChecklist(name, contractType, clientName): Promise<string[]>` |
| `frontend/lib/inngest/ai-functions.ts` | Add — `generate-engagement-checklist` function, triggered by `engagement/created` or `engagement/status-changed` events |
| `frontend/app/api/projects/[projectId]/...` | Modify — fire Inngest event when engagement goes ACTIVE |
| Engagement overview component | Modify — render checklist from `settings.aiChecklist` if present |

---

## Phase 4 — Weekly Digest Notification (1 day, future sprint)

### What it does

Every Monday at 8am (UTC, or per-firm timezone from `firm.settings.timezone`), Gemma writes a personalised weekly brief for each firm admin covering: what happened last week, top 3 priorities for the week. Delivered as an in-app notification via the existing notifications system.

| File | Action |
|------|--------|
| `frontend/lib/ai/weekly-digest.ts` | New — `generateWeeklyDigest(firmInsights, weeklyActivity): Promise<string>` |
| `frontend/lib/inngest/ai-functions.ts` | Add — `weekly-digest` function, cron `"0 8 * * 1"` |

---

## Technical Prerequisites

1. **Confirm `@huggingface/transformers` version** — already in `package.json` (used by `release.mjs`); verify `^3.x` is installed in `frontend/`
2. **Singleton pipeline in Next.js** — module-level `let _pipeline: Pipeline | null = null` pattern; critical to prevent re-downloading per invocation
3. **No new env vars needed** — model is open-weights, no API key

---

## Critical Files (reference during implementation)

| Purpose | Path |
|---------|------|
| HuggingFace / Gemma pattern to replicate | `frontend/scripts/release.mjs` |
| Firm insights API (unanswered thread detection to extract) | `frontend/app/api/firms/[firmId]/insights/route.ts:374-422` |
| FirmInsightsResponse type | `frontend/app/api/firms/[firmId]/insights/route.ts:87` |
| FirmBusinessInsights component | `frontend/components/dashboard/firm-business-insights.tsx` |
| Inngest functions (register here) | `frontend/lib/inngest/functions.ts` |
| User reminders actions | `frontend/lib/actions/user-reminders.ts` |
| Insights page layout | `frontend/app/(app)/d/f/[slug]/insights/page.tsx` |

---

## docs/mvp/todo.md update (do as first step of implementation)

Add under a new `## AI Features` section:

```markdown
## AI Features

- [ ] **AI Firm Brief** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Gemma 4 (HuggingFace transformers) narrates the analytics snapshot in 3–5 sentences
  - Cached in `firm.settings.aiBrief`; refreshed hourly or on demand
  - Appears at top of the Insights page in `FirmBusinessInsights`

- [ ] **Auto-Reminder: Unanswered Comment Threads** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Inngest cron every 4h; threads unanswered > 48h → AI-classified reminder created for firm admin
  - Duplicate prevention via `metadata.source = 'ai_thread_alert'`

- [ ] **Engagement Kickoff Checklist** — [plan](.claude/plans/sorted-splashing-pine.md)
  - On engagement → ACTIVE: Gemma generates a 5–8 item checklist stored in `engagement.settings.aiChecklist`

- [ ] **Weekly Digest Notification** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Monday 8am Inngest cron: Gemma-written brief for firm admins, delivered in-app
```

---

## Verification

**Phase 1 (AI Brief):**
- Load `/d/f/[slug]/insights` — brief card renders with skeleton then Gemma-generated text
- Click ↺ Refresh — new brief generated within ~10s (local inference), timestamp updates
- Check DB: `firm.settings.aiBrief.content` and `.generatedAt` persisted
- Reload within 60 min: no new inference (served from `settings.aiBrief`)

**Phase 2 (Auto-Reminder):**
- Trigger Inngest function via Dev Server UI at `localhost:8288`
- Seed: a `DocCommentMessage` from an `eng_ext_collaborator`, `createdAt` 3 days ago, no firm reply
- Verify reminder created with `labelStyle` matching urgency and `metadata.source === 'ai_thread_alert'`
- Re-trigger: no duplicate reminder created
