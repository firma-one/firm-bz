# Plan: AI Insights & AI-Backed Business Features

## Context

The Firm Analytics page (`/insights`) already surfaces rich structured data — pipeline value, overdue engagements, unanswered comment threads, revenue at risk, weekly activity. This plan adds an AI layer on top of that data to:

1. **Translate numbers into narrative** — A brief written by Gemini summarising what's happening and what needs attention (Analytics page)
2. **Act on signals automatically** — Background AI jobs that detect situations requiring action (unanswered threads, engagement kickoff) and create reminders / content without manual work
3. **Conversational AI on Engagement Overview** — A chat panel that answers questions about the engagement using its data

**AI runtime:** Google Gemini API via AI Studio (`@google/generative-ai`). Free tier: 60 req/min, 1,500 req/day, no credit card required.

---

## API Key Setup (do once, before any phase)

1. Go to https://aistudio.google.com/
2. Click **"Get API Key"** (top-left of the Gemini API panel)
3. Click **"Create API Key"**
4. Select **"Create API key in new project"** (or pick an existing one if you have a GCP project)
5. Copy the generated key (starts with `AIzaSy...`)
6. Add it to `frontend/.env`:
   ```
   GEMINI_API_KEY=AIzaSy...
   ```
7. Also add to your Vercel environment variables (`vercel env add GEMINI_API_KEY`)

No billing enabled needed — the free tier is self-serve. You can monitor usage at https://aistudio.google.com/apikey.

---

## Phase 1 — AI Narrative Brief on Analytics Page (2 days)

### What it does

A 3–5 sentence plain-English paragraph appears at the top of `FirmBusinessInsights`. It synthesises the existing `FirmInsightsResponse` (pipeline, overdue, unanswered threads, revenue at risk, weekly stats) into actionable prose. Cached in `firm.settings.aiBrief` (`{ content: string, generatedAt: ISO string }`); refreshed when stale (>1h) or on user demand via a ↺ Refresh button.

### Files to create / modify

| File | Action |
|------|--------|
| `frontend/lib/ai/gemini-client.ts` | New — exports `getGeminiModel()` that returns a cached `GoogleGenerativeAI` model instance |
| `frontend/lib/ai/firm-brief.ts` | New — `generateFirmBrief(data: FirmInsightsResponse, currencySymbol: string): Promise<string>` — builds prompt, calls Gemini, returns trimmed text |
| `frontend/app/api/firms/[firmId]/ai-brief/route.ts` | New — `GET`: returns cached brief from `firm.settings.aiBrief` if < 60 min old; otherwise generates and persists. Auth: `can_manage`. `POST`: force-refreshes. |
| `frontend/components/dashboard/ai-firm-brief.tsx` | New — client component, fetches `/api/firms/[firmId]/ai-brief`, shows brief in a subtle card with AI badge, timestamp, and ↺ Refresh button. Skeleton on load. |
| `frontend/components/dashboard/firm-business-insights.tsx` | Modify — add `<AiFirmBrief firmId={firmId} />` as the first child |

### Prompt design (firm-brief.ts)

Uses Gemini's standard system + user message format:

```
system: You are a concise business advisor. Write 3-5 sentences summarising the most important
things this professional services firm should act on today. Be specific: name clients,
values ({currencySymbol}), days overdue. No bullet points or headers.

user: Snapshot:
- Active clients: {N}, Prospects: {N}, Revenue at risk: {val}
- Active engagements: {N}, Overdue: {N}, Closing within 30 days: {val}
- Unanswered client threads: {N}
- This week: {newClients} new clients, {newEngagements} new engagements, {closed} closed
- Top pipeline items: ...
```

`max_output_tokens: 120` — enough for 3–5 sentences. Model: `gemini-2.5-flash` (free tier eligible, fast).

### Caching strategy

Read/write via `prisma.firm.update({ data: { settings: { ...existing, aiBrief: { content, generatedAt } } } })`.
On GET: if `settings.aiBrief?.generatedAt` is within 60 minutes, return cached `content` immediately without calling the API.

---

## Phase 2 — Auto-Reminder from Unanswered Comment Threads (1 day)

### What it does

An Inngest scheduled function runs every 4 hours. It finds document comment threads where:
- The last message is from an external collaborator (`eng_ext_collaborator` / `eng_viewer`)
- The thread has been unanswered for ≥ 48 hours

For each qualifying thread with no existing auto-reminder, Gemini classifies urgency from the comment text and creates a reminder for the firm admin.

Duplicate prevention: each auto-created reminder stores `{ source: 'ai_thread_alert', threadId: docId }` in its `metadata` JSON. The function checks for an existing reminder with matching `metadata.threadId` before creating.

### Files to create / modify

| File | Action |
|------|--------|
| `frontend/lib/insights/unanswered-threads.ts` | New — extract unanswered thread detection from `route.ts` lines 374–422 into a shared `getUnansweredThreads(firmId, engagementIds): Promise<UnansweredThreadItem[]>` util |
| `frontend/lib/ai/comment-classifier.ts` | New — `classifyCommentUrgency(content: string): Promise<{ urgency: 'high' \| 'medium' \| 'low' }>` using Gemini |
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

When an engagement's status transitions to `ACTIVE` (new or updated), Gemini generates a 5–8 item markdown checklist tailored to the engagement's name and contract type. Stored in `engagement.settings.aiChecklist`. Surfaced in the engagement overview tab.

| File | Action |
|------|--------|
| `frontend/lib/ai/engagement-checklist.ts` | New — `generateEngagementChecklist(name, contractType, clientName): Promise<string[]>` |
| `frontend/lib/inngest/ai-functions.ts` | Add — `generate-engagement-checklist` function, triggered by `engagement/created` or `engagement/status-changed` events |
| `frontend/app/api/projects/[projectId]/...` | Modify — fire Inngest event when engagement goes ACTIVE |
| Engagement overview component | Modify — render checklist from `settings.aiChecklist` if present |

---

## Phase 4 — Weekly Digest Notification (1 day, future sprint)

### What it does

Every Monday at 8am (UTC, or per-firm timezone from `firm.settings.timezone`), Gemini writes a personalised weekly brief for each firm admin covering: what happened last week, top 3 priorities for the week. Delivered as an in-app notification via the existing notifications system.

| File | Action |
|------|--------|
| `frontend/lib/ai/weekly-digest.ts` | New — `generateWeeklyDigest(firmInsights, weeklyActivity): Promise<string>` |
| `frontend/lib/inngest/ai-functions.ts` | Add — `weekly-digest` function, cron `"0 8 * * 1"` |

---

## Phase 5 — Conversational AI on Engagement Overview (2 days, future sprint)

### What it does

A chat panel on the Engagement Overview tab (`analytics`) that lets firm users ask natural-language questions about the engagement. The AI has read-only access to the engagement's data (via a system prompt containing the latest `EngagementInsightsResponse`), so it can answer questions like:
- "What's overdue right now?"
- "Which deliverables are at risk?"
- "Who hasn't reviewed the latest files?"
- "Summarise the recent activity"

The chat does **not** have write access — no document creation, no sharing, no status changes. It's an analytical Q&A interface only.

### How it works

1. On panel mount, fetch the latest `EngagementInsightsResponse` (already computed by the existing `/api/projects/[projectId]/insights` route)
2. Send that data as the **system context** to Gemini, along with the user's question
3. Stream the response back token-by-token via `response.text.stream` from `@google/generative-ai`
4. The system prompt defines the AI's scope: read-only, engagement analyst role, no fabricated data

### Files to create / modify

| File | Action |
|------|--------|
| `frontend/app/api/projects/[projectId]/ai-chat/route.ts` | New — `POST`: accepts `{ messages: [...], insights: EngagementInsightsResponse }`, streams Gemini response. Auth: `canViewProject`. |
| `frontend/components/projects/engagement-ai-chat.tsx` | New — chat panel UI with message list, input, streaming display. Fetches insights on mount, sends to `/api/projects/[projectId]/ai-chat`. |
| `frontend/components/projects/engagement-insights-dashboard.tsx` | Modify — add `<EngagementAiChat />` as a collapsible sidebar or bottom panel on the Overview tab |

### Prompt design

```
system: You are an engagement analyst assistant. You have access to the following
engagement data in JSON format. Answer user questions based ONLY on this data.
Do not fabricate numbers, dates, or statuses. If the data doesn't contain the
answer, say so. Be concise and specific.

<engagement data as JSON>

user: {question}
```

### Rate limit note

The free tier (1,500 req/day) supports roughly 150–300 conversational exchanges per day across all users. If this sees heavy use, switch to `gemini-2.5-pro` with paid tier ($0.10–0.35/1M tokens).

---

## Technical Prerequisites

1. **Install `@google/generative-ai`** — `npm install @google/generative-ai` in `frontend/`
2. **Set `GEMINI_API_KEY`** — in `frontend/.env` for local dev, in Vercel env vars for production
3. **Model choice** — start with `gemini-2.5-flash` (free). Notable: `gemini-2.5-flash-8b` is even cheaper/faster if the brief quality is sufficient
4. **No GPU / no local model** — all inference happens on Google's servers

---

## Critical Files (reference during implementation)

| Purpose | Path |
|---------|------|
| Gemini client singleton pattern | `frontend/lib/ai/gemini-client.ts` (to create) |
| Firm insights API (unanswered thread detection to extract) | `frontend/app/api/firms/[firmId]/insights/route.ts:374-422` |
| FirmInsightsResponse type | `frontend/app/api/firms/[firmId]/insights/route.ts:87` |
| FirmBusinessInsights component | `frontend/components/dashboard/firm-business-insights.tsx` |
| Engagement insights (for conversational AI context) | `frontend/app/api/projects/[projectId]/insights/route.ts` |
| EngagementInsightsResponse type | `frontend/app/api/projects/[projectId]/insights/route.ts:255-283` |
| Engagement insights dashboard component | `frontend/components/projects/engagement-insights-dashboard.tsx` |
| Inngest functions (register here) | `frontend/lib/inngest/functions.ts` |
| User reminders actions | `frontend/lib/actions/user-reminders.ts` |
| Insights page layout | `frontend/app/(app)/d/f/[slug]/insights/page.tsx` |

---

## docs/mvp/todo.md update (do as first step of implementation)

Add under a new `## AI Features` section:

```markdown
## AI Features

- [ ] **AI Firm Brief** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Gemini 2.5 Flash narrates the analytics snapshot in 3–5 sentences
  - Cached in `firm.settings.aiBrief`; refreshed hourly or on demand
  - Appears at top of the Insights page in `FirmBusinessInsights`

- [ ] **Auto-Reminder: Unanswered Comment Threads** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Inngest cron every 4h; threads unanswered > 48h → AI-classified reminder created for firm admin
  - Duplicate prevention via `metadata.source = 'ai_thread_alert'`

- [ ] **Engagement Kickoff Checklist** — [plan](.claude/plans/sorted-splashing-pine.md)
  - On engagement → ACTIVE: Gemini generates a 5–8 item checklist stored in `engagement.settings.aiChecklist`

- [ ] **Weekly Digest Notification** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Monday 8am Inngest cron: Gemini-written brief for firm admins, delivered in-app

- [ ] **Conversational AI on Engagement Overview** — [plan](.claude/plans/sorted-splashing-pine.md)
  - Chat panel on the Overview tab answers questions about engagement data
  - Gemini streams responses based on live EngagementInsightsResponse context
  - Read-only analyst role: no mutations
```

---

## Verification

**Phase 1 (AI Brief):**
- Load `/d/f/[slug]/insights` — brief card renders with skeleton then Gemini-generated text
- Click ↺ Refresh — new brief generated within ~2s (API), timestamp updates
- Check DB: `firm.settings.aiBrief.content` and `.generatedAt` persisted
- Reload within 60 min: no new API call (served from `settings.aiBrief`)

**Phase 2 (Auto-Reminder):**
- Trigger Inngest function via Dev Server UI at `localhost:8288`
- Seed: a `DocCommentMessage` from an `eng_ext_collaborator`, `createdAt` 3 days ago, no firm reply
- Verify reminder created with `labelStyle` matching urgency and `metadata.source === 'ai_thread_alert'`
- Re-trigger: no duplicate reminder created

**Phase 5 (Conversational AI):**
- Open Engagement Overview tab — chat panel renders
- Ask "What's overdue?" — response references real due dates from engagement data
- Ask "Create a document called X" — response declines (no write access)
- Stream shows tokens progressively, not a single delayed response
