# Plan: Firm-Level Reminder Email Configuration

## Context

Auto-reminders currently cover due dates on Client (followUpDate, expectedCloseDate), Engagement (dueDate), and Document levels, creating `ReminderItem` entries in `UserPersonalization.reminders` and scheduling one-time Inngest `reminder.email.scheduled` events that fire at 9:00 AM UTC on the due date.

This plan extends the system with firm-level reminder configuration so admins can control:
1. **Immediate notification** on reminder creation (synchronous email at creation time)
2. **Recurring reminder emails** (async Inngest job that loops every N days starting X days before the due date)

These settings live in a new **Email Reminders** card in the Firm Settings form.

---

## Data Model Changes

### `Firm.settings` JSON shape extension (no schema migration needed)

Add a `reminderEmailConfig` key to the existing `settings: Json` blob on `Firm`:

```ts
type FirmReminderEmailConfig = {
  immediateOnCreate: boolean          // default: true
  recurring: {
    enabled: boolean                  // default: true
    frequencyDays: number             // every N days, default: 1
    startDaysBeforeDue: number        // X days before due date, default: 7
  }
}
```

Stored at `firm.settings.reminderEmailConfig`. No Prisma migration needed — `settings` is already `Json @default("{}")`.

### New Inngest event types (in `frontend/lib/inngest/types.ts`)

```ts
ReminderRecurringScheduledEvent  // name: 'reminder.recurring.scheduled'
ReminderRecurringCancelledEvent  // name: 'reminder.recurring.cancelled'
```

Payload for `reminder.recurring.scheduled`:
```ts
{
  reminderId: string
  userId: string
  firmId: string
  entityName: string
  entityKey: string
  entityValue: string
  action: string
  ctaUrl: string | null
  dueDate: string | null     // ISO — null means no due date
  frequencyDays: number
  startDaysBeforeDue: number
  nextFireAt: string         // ISO — first send time
}
```

---

## Implementation Steps

### 1. Firm Settings — API layer

**File:** `frontend/lib/actions/firms.ts` (or `frontend/lib/firm-service.ts`)

- In `updateFirm()`, read and merge `reminderEmailConfig` from the submitted settings payload into `firm.settings`.
- Expose a typed helper `getFirmReminderConfig(firmId)` that reads `firm.settings.reminderEmailConfig` and returns a typed `FirmReminderEmailConfig` with defaults.

**File:** `frontend/app/api/firm/route.ts`

- The GET response already returns `firm.settings`. No changes needed — the card will read the existing `/api/firm?slug=...` response.

### 2. Firm Settings — UI card

**File:** `frontend/components/projects/firm-settings-form.tsx`

Add a new state block and card after the existing **FEATURES** card:

```tsx
// State
const [immediateOnCreate, setImmediateOnCreate] = useState(true)
const [recurringEnabled, setRecurringEnabled] = useState(true)
const [recurringFrequencyDays, setRecurringFrequencyDays] = useState(1)
const [startDaysBeforeDue, setStartDaysBeforeDue] = useState(7)
```

Load from `settings.reminderEmailConfig` in the existing `loadBranding` `useEffect`.

Include in the `handleSave` payload as `reminderEmailConfig: { immediateOnCreate, recurring: { enabled: recurringEnabled, frequencyDays: recurringFrequencyDays, startDaysBeforeDue } }`.

Card layout (follows existing card pattern):
```
┌─ EMAIL REMINDERS ─────────────────────────────────────────────┐
│ Immediate notification on creation          [On/Off]          │
│                                                               │
│ Recurring reminder emails                   [On/Off]          │
│  (shown when recurring On)                                    │
│   Frequency: every [N] days      [1 dropdown]                 │
│   Start: [X] days before due     [7 dropdown]                 │
└───────────────────────────────────────────────────────────────┘
```

Frequency options: 1, 3, 7, 14 days.
Start options: 1, 3, 7, 14, 21, 30 days before due.

### 3. Immediate notification on reminder creation

**File:** `frontend/lib/actions/user-reminders.ts`

In `upsertFollowUpReminder()` (and when a new reminder is created), after saving the item:
1. Call `getFirmReminderConfig(params.firmId)`.
2. If `immediateOnCreate === true`, send an email immediately via `sendEmail()`.

This is a synchronous call (no Inngest), done inline inside the server action.

### 3a. Pass `internalMemo` as `note` on Client auto-reminders

**Context:** A1–A3 client lifecycle gaps (onboarding, re-engagement, on-hold) don't need new implementation — the Firm Admin can use Client Settings > Due Date fields for auto-reminders. However, the `note` field on `ReminderItem` is currently never populated for client reminders.

**Gap:** `upsertFollowUpReminder` accepts no `note` param; `internalMemo` is available at both call sites in `lib/actions/client.ts` but is never threaded through.

**Fix:**

1. Add `note?: string | null` to the `upsertFollowUpReminder` params type in `user-reminders.ts`.
2. Store it on the `ReminderItem` when creating (and preserve it on update).
3. In `lib/actions/client.ts`, pass `note: data.internalMemo ?? null` to both `upsertFollowUpReminder` calls (followUpDate and expectedCloseDate) — both in `createClient` and `updateClient`.

This means when a Firm Admin sets a follow-up date and has an internal memo on the client, the memo automatically becomes the reminder note, giving context in the reminders panel.

### 4. Recurring reminder Inngest job

**File:** `frontend/lib/inngest/functions.ts`

New function `sendRecurringReminderEmails`:

```
Trigger: 'reminder.recurring.scheduled'
cancelOn: 'reminder.recurring.cancelled' matching reminderId

Loop:
  sleepUntil(nextFireAt)
  step.run("send"):
    - check reminder still exists in UserPersonalization
    - check firm config still has recurring=true (re-read each iteration)
    - send email
    - compute next fire: nextFireAt += frequencyDays days
    - if dueDate && nextFireAt > dueDate: stop
    - else: send 'reminder.recurring.scheduled' with updated nextFireAt (fan-forward pattern)
```

Fan-forward pattern (re-emitting the event) avoids infinite loops and is cancellable at any step.

**Schedule trigger:** Called from `upsertFollowUpReminder()` when:
- `firm.reminderEmailConfig.recurring.enabled === true`
- A due date exists
- `today <= dueDate - startDaysBeforeDue` (otherwise start immediately)

First `nextFireAt` = `max(today, dueDate - startDaysBeforeDue)` at 9:00 AM UTC.

**File:** `frontend/lib/inngest/types.ts`

Add `ReminderRecurringScheduledEvent` and `ReminderRecurringCancelledEvent` interfaces and include them in the union export.

**File:** `frontend/lib/inngest/client.ts`

Ensure `safeInngestSend` handles the two new event names (it uses a generic string key, so this is likely no-op unless there's an allowlist).

**Cancellation:** When `markReminderDone()` or date-cleared path runs, also emit `reminder.recurring.cancelled` with the `reminderId`.

### 5. Helper: `getFirmReminderConfig`

**File:** `frontend/lib/actions/firms.ts` (new server action, or add to `firm-service.ts`)

```ts
export async function getFirmReminderConfig(firmId: string): Promise<FirmReminderEmailConfig> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
  const raw = (firm?.settings as any)?.reminderEmailConfig ?? {}
  return {
    immediateOnCreate: raw.immediateOnCreate ?? true,
    recurring: {
      enabled: raw.recurring?.enabled ?? true,
      frequencyDays: raw.recurring?.frequencyDays ?? 1,
      startDaysBeforeDue: raw.recurring?.startDaysBeforeDue ?? 7,
    },
  }
}
```

---

## Feature: Wire `kickoffDate` as an Auto-Reminder (A4)

**File:** `frontend/lib/actions/project.ts`

`kickoffDate` is stored and displayed in the engagement UI but `upsertFollowUpReminder` is never called for it. Wire it up identically to `dueDate`:

- On create/update, call `upsertFollowUpReminder` with `dateKey: 'platform.engagements.kickoffDate'`, `action: 'Engagement kickoff'`.
- Add `'platform.engagements.kickoffDate'` to `DATE_FIELD_CLEARERS` in `user-reminders.ts`.
- Pass engagement `notes` (if any) as the `note` param (same pattern as client `internalMemo`).

---

## Feature: Wire `FirmInvitation` expiry as Auto-Reminder (A7)

**File:** `frontend/lib/actions/firms.ts` (or wherever `inviteFirmMember` / `resendFirmInvitation` live)

`upsertFollowUpReminder` is already called in `inviteEngagementMember` but not for firm-level invitations. Add the same call in `inviteFirmMember` and `resendFirmInvitation` with:

- `entityKey: 'platform.firm_invitations'`
- `dateKey: 'platform.firm_invitations.expireAt'`
- `action: 'Invitation expiring'`
- `dateValue: expireAt.toISOString()`

Add a new entry in `ENTITY_RESOLVERS` for `platform.firm_invitations` (resolves invitee email + ctaUrl to the firm members settings page).
Add `'platform.firm_invitations.expireAt'` to `DATE_FIELD_CLEARERS`.

---

## Feature: Manual "Add Reminder" button — Engagement & Client detail pages (A5, A6, A10, B4)

Covers: engagement paused/closed (A5, A6), annual relationship review (A10), ad-hoc client follow-up re-schedule (B4), and any other ad-hoc case with no dedicated date field.

### UI

A small **"+ Reminder"** button on:
- Engagement detail page header/actions area
- Client detail page header/actions area

Opens a lightweight popover/sheet with:

```
┌─ Add Reminder ──────────────────────────────────────────────┐
│  Action / label    [text input, e.g. "Post-delivery review"]│
│  Due date          [date picker — optional]                  │
│  Note              [textarea — optional]                     │
│                                          [Cancel]  [Save]   │
└─────────────────────────────────────────────────────────────┘
```

- Recipient is always **self** (the logged-in user) for manual reminders — no tagging needed here; comment-reminders handle the "tag someone else" case.
- Calls `upsertFollowUpReminder` directly with `entityKey: 'platform.clients'` or `'platform.engagements'`, `dateKey: null`, `dateValue` = picked date or null.
- Complies with `FirmReminderEmailConfig` automatically (same code path).

### Files

- New small component `AddReminderPopover` in `frontend/components/projects/` — reusable across Client and Engagement detail pages.
- Engagement detail page: add button alongside existing action buttons.
- Client detail page: same.
- No new server action needed — calls existing `upsertFollowUpReminder`.

---

## Deferred (separate plan — Inngest crons)

The following gaps are observational/passive and are better handled as automated Inngest crons rather than manual reminders. Not in scope for this plan:

- **A8**: Shared document not accessed after N days → cron detects no `accessLog` entry, auto-creates reminder for engagement lead.
- **A9**: Document `activity.status` stalled at `to_do`/`in_progress` for > N days → cron auto-creates reminder.
- **B3**: Engagement invitation expired but member still not JOINED → cron post-expiry check.
- **B5**: Intake file in Staging unreviewed for > N days → cron escalation.

These belong in the AI Features / automation cron section of `docs/mvp/todo.md`.

---

## Feature: Comment-as-Reminder

### Overview

When adding a comment on a document, users can toggle it as a **Reminder** and tag a **Recipient** (a firm member). This creates a `ReminderItem` for that recipient exactly like an auto-reminder, and respects `FirmReminderEmailConfig` (immediate notification + recurring schedule).

### Data Model

**`DocCommentMessage`** — add a `settings` Json column via Prisma migration (aligns with `Firm`, `Engagement`, and other models):

```prisma
settings  Json  @default("{}")
```

Reminder state stored under `settings.reminder`:

```ts
// settings shape
{
  reminder?: {
    recipientId: string   // Supabase user ID of the tagged recipient
  }
}
```

`isReminder` is derived at runtime as `!!comment.settings?.reminder` — no separate boolean column needed.

No `dateValue` at creation time — the reminder is date-less (shows in reminders panel without a due date, recurring starts from creation date per the no-due-date rule).

**`ReminderItem`** created for the recipient:

```ts
{
  entityKey:   'platform.doc_comments'   // new entity key
  entityValue: <DocCommentMessage.id>
  action:      'Review comment'
  dateKey:     null
  dateValue:   null
  // ... standard fields
}
```

A new entry in `ENTITY_RESOLVERS` in `user-reminders.ts` resolves `platform.doc_comments` → comment content preview + ctaUrl.

### ctaUrl format

```
/d/f/{firmSlug}/c/{clientSlug}/e/{engagementSlug}/files#doc-comment:{documentId}:{commentId}
```

Uses the existing deeplink hash pattern already established in `project-insights-dashboard.tsx`.

### UI — Comment Composer (`document-doc-comments-pane.tsx`)

Extend the comment composer (currently a textarea + Send button) with:

```
┌─ Comment composer ──────────────────────────────────────────┐
│  [ textarea: "Add a comment…"                             ] │
│                                                             │
│  [ ] Mark as Reminder                                       │
│      Recipient: [dropdown — firm members]   (shown if ✓)   │
│                                             [Send]          │
└─────────────────────────────────────────────────────────────┘
```

- Recipient dropdown populated from firm members (already available in the component's context or fetched from `/api/firm?slug=...` members list).
- If `isReminder` is unchecked, `recipientId` is ignored on submit.

### API — POST comment (`doc-comments/route.ts`)

Accept additional optional fields in the request body:

```ts
{ content: string; isReminder?: boolean; recipientId?: string }
```

After creating the `DocCommentMessage`:
1. If `isReminder && recipientId`:
   - Call `upsertFollowUpReminder()` with `userId = recipientId`, `entityKey = 'platform.doc_comments'`, `entityValue = comment.id`, `action = 'Review comment'`, `dateValue = null`.
   - This call already handles immediate notification and recurring scheduling via `getFirmReminderConfig`.

### Entity resolver for `platform.doc_comments`

Add to `ENTITY_RESOLVERS` in `frontend/lib/actions/user-reminders.ts`:

```ts
'platform.doc_comments': async (id) => {
  const c = await prisma.docCommentMessage.findUnique({
    where: { id },
    select: {
      content: true,
      projectDocumentId: true,
      engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } },
    },
  })
  const firmSlug = c?.engagement?.client?.firm?.slug ?? null
  const clientSlug = c?.engagement?.client?.slug ?? null
  const engSlug = c?.engagement?.slug ?? null
  const preview = c?.content?.slice(0, 60) ?? 'Comment'
  return {
    name: preview,
    slug: null,
    firmSlug,
    ctaUrl: firmSlug && clientSlug && engSlug
      ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-comment:${c?.projectDocumentId}:${id}`
      : null,
  }
}
```

### DATE_FIELD_CLEARERS

No entry needed — date-less reminders have no DB column to clear on `markReminderDone`.

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/components/projects/firm-settings-form.tsx` | Add Email Reminders card with 4 settings fields |
| `frontend/lib/actions/user-reminders.ts` | Add `note` param to `upsertFollowUpReminder`; add `platform.doc_comments` + `platform.firm_invitations` entity resolvers; add `kickoffDate` + `firm_invitations.expireAt` to `DATE_FIELD_CLEARERS` |
| `frontend/lib/actions/client.ts` | Pass `note: data.internalMemo` to both `upsertFollowUpReminder` calls |
| `frontend/lib/actions/project.ts` | Wire `kickoffDate` to `upsertFollowUpReminder`; pass engagement notes as `note` |
| `frontend/lib/actions/firms.ts` | Add `getFirmReminderConfig` helper; merge `reminderEmailConfig` in `updateFirm`; call `upsertFollowUpReminder` in `inviteFirmMember` + `resendFirmInvitation` |
| `frontend/lib/inngest/functions.ts` | Add `sendRecurringReminderEmails` function |
| `frontend/lib/inngest/types.ts` | Add `ReminderRecurringScheduledEvent`, `ReminderRecurringCancelledEvent` |
| `frontend/app/api/inngest/route.ts` | Register `sendRecurringReminderEmails` in the serve() call |
| `frontend/prisma/schema.prisma` | Add `settings Json @default("{}")` to `DocCommentMessage` |
| `frontend/app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts` | Accept `isReminder` + `recipientId`; call `upsertFollowUpReminder` after create |
| `frontend/components/projects/document-doc-comments-pane.tsx` | Extend composer with reminder toggle + recipient dropdown |
| `frontend/components/projects/AddReminderPopover.tsx` | New component — manual reminder popover for Client + Engagement detail pages |
| Client detail page component | Add `+ Reminder` button wired to `AddReminderPopover` |
| Engagement detail page component | Add `+ Reminder` button wired to `AddReminderPopover` |

---

## Key Reuse

- `safeInngestSend` (`frontend/lib/inngest/client.ts`) — use for all new event dispatches
- `sendEmail` (`frontend/lib/email.ts`) — use for immediate notification
- `loadItems` / `saveItems` (`frontend/lib/actions/user-reminders.ts`) — no changes needed
- Existing `markReminderDone` / `upsertFollowUpReminder` — extend in-place
- Existing card layout CSS (`fieldLabel`, `inputCls`, card wrapper classes) in `firm-settings-form.tsx`

---

## Housekeeping (do first)

- Copy this plan file to `.claude/plans/firm-reminder-email-config.md` in the project root
- Add to `docs/mvp/todo.md` under a new **Reminders** section:

  ```md
  - [ ] **Firm-Level Reminder Email Configuration** — [plan](../../.claude/plans/firm-reminder-email-config.md)
    - Immediate notification on reminder creation (sync email)
    - Recurring reminder emails via Inngest fan-forward (every N days, starting X days before due)
    - Firm Settings card to configure both
  ```

---

## Verification

1. **Firm Settings UI**: Open Firm Settings → confirm new "Email Reminders" card renders with all 4 controls. Toggle recurring on/off — confirm sub-fields show/hide. Save and reload — confirm values persist.

2. **Immediate notification**: Set `immediateOnCreate: true`, create/update a client with a follow-up date → confirm email arrives immediately.

3. **Recurring job**: With defaults (`recurring.enabled: true`, `frequencyDays: 1`, `startDaysBeforeDue: 7`), create an engagement with a due date 10 days out → verify Inngest dashboard shows `reminder.recurring.scheduled` event queued starting 7 days before due and firing daily.

4. **Cancellation**: Mark reminder done → verify both `reminder.email.cancelled` and `reminder.recurring.cancelled` are emitted; Inngest dashboard shows runs cancelled.

5. **No-due-date path**: For date-less reminders, recurring start = creation date (since `dueDate` is null, `startDaysBeforeDue` is irrelevant — start immediately and repeat).
