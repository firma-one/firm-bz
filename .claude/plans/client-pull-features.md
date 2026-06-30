# Client Pull Features

**Context:** The app is currently built fCMO-first — great for operations/admin, but the end-client's only pull is a document inbox + kanban + in-app nudges. This plan adds three targeted add-ons to give clients a reason to return proactively, without touching core fCMO workflows. See [`docs/mvp/todo.md`](../../docs/mvp/todo.md) for the broader roadmap context.

---

## Feature 1: Shared Action Items / Open Items Tracker

**Problem:** Client doesn't know what's needed from them without an out-of-band email or call. Items stall silently.

**What it does:** A simple shared checklist between fCMO and client. fCMO creates items (e.g. "Provide May payroll data", "Sign the MSA"), optionally assigns to a client member and sets a due date. Client checks them off. Both sides see real-time state.

**Visibility:** Tab added to engagement workspace, visible to all engagement members (internal + external). Read-write for eng_admin/eng_member/eng_project_lead who can create/edit/delete; external personas (eng_ext_collaborator, eng_viewer) can only check off items assigned to them.

### Schema

```prisma
model EngagementActionItem {
  id            String   @id @default(cuid())
  engagementId  String
  engagement    Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  title         String
  dueDate       DateTime?
  completedAt   DateTime?
  completedBy   String?  // userId
  createdBy     String   // userId
  assignedTo    String?  // userId (optional)
  orderIndex    Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Files to create/modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `EngagementActionItem` model + relation on `Engagement` |
| `prisma/migrations/` | `npx prisma migrate dev --name add_engagement_action_items --create-only` |
| `app/api/projects/[projectId]/action-items/route.ts` | GET (list), POST (create) |
| `app/api/projects/[projectId]/action-items/[itemId]/route.ts` | PATCH (update/complete), DELETE |
| `components/projects/engagement-action-items-tab.tsx` | New tab component — checklist UI with inline add, checkbox, assignee chip, due date badge |
| `components/projects/engagement-workspace.tsx` | Add `action-items` tab; gate create/delete on `canViewInternalTabs`; show to all personas |

### Notifications

On item creation with an assigned external user → create in-app notification:
- type: `ACTION_ITEM_ASSIGNED`
- ctaUrl: deeplink to engagement `?tab=action-items`
- channels: `{ inApp: true, email: false }` initially

---

## Feature 2: Deliverables Timeline (Client Progress View)

**Problem:** Clients think in deliverables ("what did I pay for this month?"), not documents. The kanban shows documents; clients want to see progress against outcomes.

**What it does:** A read-only timeline view on the engagement workspace showing deliverables (shared documents with a due date) grouped by month/status. fCMO sets `dueDate` on shared documents (already supported in schema). Timeline is client-readable: shows status (To Do → In Review → Done/Finalized) and due dates at a glance.

**Visibility:** Visible to all engagement members. No new write surface needed — fCMO sets due dates via the existing document action menu.

### What already exists

- `EngagementDocument.dueDate` — field already in schema
- `DocumentDueDateItem` interface — already in `app/api/projects/[projectId]/insights/route.ts`
- Activity status (to_do, in_progress, in_review, done) — already in `lib/sharing-settings.ts`
- Shares tab surfaces shared documents — same data set

### Files to create/modify

| File | Change |
|------|--------|
| `app/api/projects/[projectId]/timeline/route.ts` | GET — fetch shared documents with dueDate + activity status, grouped by month. Reuse `DocumentDueDateItem` type. Respect `restrictToSharedOnly` for external personas. |
| `components/projects/engagement-timeline-tab.tsx` | New tab — group shared documents by month, show status badge + due date + finalization indicator. Read-only for all. |
| `components/projects/engagement-workspace.tsx` | Add `timeline` tab visible to all (internal + external) |

**No schema changes needed.**

---

## Feature 3: Weekly Email Digest (Activate Existing Email Infrastructure)

**Problem:** Clients who don't log in don't feel the fCMO's value. The notification system has `email: false` everywhere — the infrastructure (Inngest, email templates, Resend) is already wired.

**What it does:** A Monday morning email digest sent to all external engagement members (EC + EV) summarizing the past week: documents moved to Done/Finalized, items pending their review, open action items assigned to them. fCMO can toggle it per engagement.

### What already exists

- Inngest client + fan-forward pattern — `lib/inngest/functions.ts`
- Reminder email template pattern — `lib/email-templates/reminder.ts`
- `sendReminderEmail` Inngest function as reference implementation
- Firm-level email config (from/reply-to) — already in Firm Settings

### Files to create/modify

| File | Change |
|------|--------|
| `lib/inngest/types.ts` | Add `engagement.digest.weekly` event type |
| `lib/inngest/functions.ts` | Add `sendWeeklyClientDigest` function — cron `0 9 * * 1` (Mon 9am UTC); queries engagements with `digestEnabled`; for each, fetches last 7 days of share activity + open action items assigned to external users; fans out one email per external member |
| `lib/email-templates/engagement-digest.ts` | New template — sections: "Completed this week" (finalized docs), "Pending your review" (in_review docs), "Open items for you" (unchecked action items); reuse branding from reminder template |
| `prisma/schema.prisma` | Add `digestEnabled Boolean @default(false)` to `Engagement.settings` JSON (no migration needed — JSON field) |
| `components/projects/engagement-settings-form.tsx` | Add "Weekly client digest" toggle (Engagement Lead+ only) |

### Digest content logic

```
Last 7 days:
- Shared docs where activity.status moved to 'done' or finalizedAt is set → "Completed"
- Shared docs where activity.status = 'in_review' → "Pending your review"
- EngagementActionItems where assignedTo = recipient.userId AND completedAt IS NULL → "Open items"
```

---

## Implementation Order

1. **Action Items** (Feature 1) — new schema + simple CRUD; highest client-facing value
2. **Weekly Digest** (Feature 3) — activate email channel; reaches non-active clients immediately
3. **Timeline** (Feature 2) — no schema changes; pure presentation layer; lowest risk

---

## Verification

- Action items: Create item as fCMO → external user sees it in tab → external user checks it off → fCMO sees completion
- Digest: Toggle `digestEnabled` on engagement → trigger Inngest function manually → verify email rendered with correct sections per recipient
- Timeline: Set `dueDate` on 2–3 shared documents in different activity states → verify timeline groups correctly by month, respects `restrictToSharedOnly` for external viewer
