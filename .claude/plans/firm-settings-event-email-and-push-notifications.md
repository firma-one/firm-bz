# Plan: Per-Event Email Notification Config + Web Push Notifications

## Context

Firma is not going to be a daily driver for firms or their clients. Today, the only "attention-grabbing" channel that reliably fires is the reminder-email system (`getFirmReminderConfig` → `sendImmediateReminderEmail`, gated by the existing **Email Reminders** card in Firm Settings → App Settings). Several important events only create **in-app** state (a `Notification` row or a raw `UserPersonalization.reminders` entry) with no email — meaning a firm admin or client who isn't in the app that day never finds out.

This plan does two things:

1. **Extends the existing `reminderEmailConfig` JSON blob** on `Firm.settings` with a new `events` map of per-event email toggles, surfaced in the existing **Email Reminders** card (App Settings section) in `firm-settings-form.tsx`. When an event's toggle is on, an email fires the moment that event occurs — reusing the exact gating/send pattern already used for reminder emails.
2. **Adds Web Push (installed-PWA-style) notifications** as a second delivery channel, fully greenfield in this codebase — manifest, service worker, subscription storage, and send pipeline all need to be built from scratch. Included per explicit request, not because it's the higher-leverage piece for external clients (see caveats below).

---

## Part A — Per-Event Email Notifications

### A.1 Events in scope

| # | Event | Recipients | Current state |
|---|---|---|---|
| 1 | **New document intake** (EC/EV uploads a file for review) | All Engagement Admins (`eng_admin`) + Engagement Members (`eng_member`) — i.e. internal staff | In-app reminder only, created directly against `UserPersonalization.reminders` — [`index-file-intake/route.ts:135-164`](../../frontend/app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts#L135-L164). No email. |
| 2 | **Document/Deliverable status changed** (`to_do → in_progress → in_review → approved`, any direction) | All Engagement Members (see A.2 for exact role scope) | Only an audit-log write — [`sharing/activity/route.ts:164-172`](../../frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts#L164-L172). No notification, no email. |
| 3 | **Document rejected / changes requested** (EV moves `in_review → in_progress`) | The document's assignee(s) / uploader | Same route as #2 — this is one specific transition within the same handler, not a separate mechanism. |
| 4 | **New comment from an external client** (EC/EV posts a comment) | Internal engagement staff (`eng_admin` + `eng_member`) | [`doc-comments/route.ts:133-236`](../../frontend/app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts#L133-L236) creates the comment; only an explicit `recipientId`-tagged "reminder" comment notifies anyone today, and only in-app via `upsertFollowUpReminder`. A plain comment from an external client notifies no one. |
| 5 | **Engagement invite accepted** | All Engagement Admins | No hook exists. Membership becomes `JOINED` in [`engagement-membership.ts:52-63,96-99`](../../frontend/lib/actions/engagement-membership.ts#L52-L99); `project.member.added` fires only if a new member row was created ([`engagement-membership.ts:177-187`](../../frontend/lib/actions/engagement-membership.ts#L177-L187)), and its only consumer today ([`grant-permissions-for-new-member`](../../frontend/lib/inngest/functions.ts) at `functions.ts:972`) just grants storage permissions — no notification. |
| 6 | **Deliverable/document overdue** (past `dueDate`, not yet `approved`) | Assignee(s) + Engagement Admins | Not overdue-specific today — `sendDeliverableDueReminder` ([`functions.ts:1666-1729`](../../frontend/lib/inngest/functions.ts#L1666-L1729)) only fires **advance** reminders at 24h/1h *before* the due date, with `channels: { inApp: true, email: false }` currently hardcoded — no window fires *after* the date passes. |

**Not in scope for this plan** (flagged during research, deliberately excluded):
- True `@mention` text parsing in comments — doesn't exist today (recipient tagging is an explicit dropdown, not `@name` parsing in `content`). Building it is a separate, non-trivial NLP-adjacent task; out of scope here. The existing `mentionEmailOnCreate` toggle (already in the UI, unconsumed — see A.4) will be wired to the *existing* explicit-tag mechanism, not true `@mention` parsing.

### A.2 Role-scoping decision: "Engagement Members" is not internal-only by convention

Research finding: the existing "Engagement Members" tab and its backing query ([`members.ts:27-30`](../../frontend/lib/actions/members.ts#L27-L30)) list **all four roles** (`eng_admin`, `eng_member`, `eng_ext_collaborator`, `eng_viewer`) as one flat list — the UI label does not imply "internal staff only."

For this plan, **"notify all Engagement Members" means internal staff** (`eng_admin` + `eng_member`) for events #1, #2, #4, #5, #6 — matching the intake reminder's existing filter (`role: { in: ['eng_admin', 'eng_member'] }`) — because these are firm-facing operational events. External roles (EC/EV) are excluded from status-change and intake emails; they already get their own "shared document" reminder emails via a separate existing path ([`sharing/route.ts:593-634`](../../frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts#L593-L634)).

Event #3 (rejected) is scoped narrower — just the document's assignee(s)/uploader, not the whole engagement — since it's actionable by one person.

### A.3 Data model — extend `reminderEmailConfig`, no migration needed

`Firm.settings` is already `Json @default("{}")` — no Prisma migration required. Add an `events` key alongside the existing fields:

```ts
// frontend/lib/actions/firms.ts — extend FirmReminderEmailConfig
type FirmReminderEmailConfig = {
  immediateOnCreate: boolean
  recurring: { enabled: boolean; frequencyDays: number; startDaysBeforeDue: number }
  mentionEmailOnCreate: boolean
  events: {
    // Each event independently toggles the Email channel and the In-App channel.
    // In-app is not free today — see A.4a: several of these events currently
    // ALWAYS write an in-app reminder/notification with no way to turn it off.
    // This grid becomes the single on/off control for both channels going forward.
    newDocumentIntake:        { email: boolean; inApp: boolean } // default: { email: true,  inApp: true }
    statusChanged:            { email: boolean; inApp: boolean } // default: { email: false, inApp: true } — higher volume, email opt-in
    documentRejected:         { email: boolean; inApp: boolean } // default: { email: true,  inApp: true }
    externalClientComment:    { email: boolean; inApp: boolean } // default: { email: true,  inApp: true }
    engagementInviteAccepted: { email: boolean; inApp: boolean } // default: { email: false, inApp: true }
    deliverableOverdue:       { email: boolean; inApp: boolean } // default: { email: true,  inApp: true }
  }
}
```

Stored at `firm.settings.reminderEmailConfig.events`. Update `getFirmReminderConfig()` in `frontend/lib/actions/firms.ts:542-` to default every `events.<key>.{email,inApp}` when absent (same pattern already used for `immediateOnCreate ?? true`).

### A.4 UI — extend the existing "Email Reminders" card with an Event grid

**File:** `frontend/components/projects/firm-settings-form.tsx`

The card at lines 694-744 (App Settings section, opened via `openSection === 'appsettings'`) already has the `immediateOnCreate` / `recurringEnabled` / `mentionEmailOnCreate` switches and saves through the same `handleSave` → `updateFirm(..., { reminderEmailConfig })` call (lines 365-373). Extend it with a new **"Event Notifications"** grid, one row per event with two independent switches:

```
┌─ Email Reminders ─────────────────────────────────────────────────────┐
│  [existing: Immediate notification, Recurring emails,                 │
│   Email on @mention]                                                  │
│  ─────────────────────────────────────────────────────────────────    │
│  Event Notifications                                                  │
│                                                                        │
│   Event                          │ Notify by Email │ In-App Notif.    │
│   ────────────────────────────── │ ─────────────── │ ───────────────  │
│   New document intake             │     [On]        │     [On]        │
│   Status changed (doc/deliverable)│     [Off]        │     [On]        │
│   Document rejected               │     [On]        │     [On]        │
│   Client comment posted           │     [On]        │     [On]        │
│   Engagement invite accepted      │     [Off]        │     [On]        │
│   Deliverable overdue             │     [On]        │     [On]        │
└──────────────────────────────────────────────────────────────────────┘
```

Implementation:
- Represent state as a single object, not 12 separate `useState` calls: `const [eventConfig, setEventConfig] = useState<Record<EventKey, {email: boolean; inApp: boolean}>>(...)`, keyed by the 6 event keys above.
- A small reusable row component (`EventNotificationRow`) rendering the event label + two `Switch`es, calling `setEventConfig(prev => ({ ...prev, [key]: { ...prev[key], email: v } }))` (or `inApp`) and `setAppDirty(true)`.
- Load from `rc.events` in the existing settings-load `useEffect` (mirrors lines 203-208), defaulting per-event per the table above.
- Include `events: eventConfig` inside the `reminderEmailConfig` object in `handleSave` (line 365-373).
- On narrow viewports, collapse the two-switch grid to a stacked label+switch pair per channel per event (same responsive treatment as other settings tables in the app, if one exists — otherwise a simple `flex-col` stack under 640px).

No new card/section — this fits inside App Settings, as an expansion of the existing Email Reminders card.

### A.4a Important: In-App is not currently optional for these events — this plan makes it so

Research finding: for 4 of the 6 events, an in-app side effect **already fires unconditionally today** (there is no existing toggle to suppress it):
- New document intake → always writes `UserPersonalization.reminders` ([`index-file-intake/route.ts:151-163`](../../frontend/app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts#L151-L163))
- Document/deliverable status changed → currently **no** in-app notification exists at all (audit-log only) — so `inApp` here is net-new, not a toggle on existing behavior
- Deliverable overdue (advance windows) → always writes a `Notification` row ([`functions.ts:1666-1729`](../../frontend/lib/inngest/functions.ts#L1666-L1729))
- External client comment / invite accepted → no in-app notification exists today either — net-new

So implementing the `inApp` column means: for the two events that already have unconditional in-app writes (intake, deliverable due-window), **wrap the existing write in the new `config.events.<key>.inApp` check** so admins can now turn it off; for the four events with no in-app notification today, add one (a new `Notification` row, following the `sharing/accept/route.ts:110-136` pattern), gated by the same flag from day one.

### A.5 Send-side implementation — copy the existing gate pattern exactly

**Reference implementation to copy** — `sendImmediateReminderEmail` in `frontend/lib/actions/user-reminders.ts:327-355`:
1. `getFirmReminderConfig(firmId)`
2. Early-return if the specific flag is `false`
3. Dynamically import `createAdminClient`, `sendEmail`, and a per-event template render function
4. Resolve recipient email via `admin.auth.admin.getUserById(userId)`
5. Build absolute `ctaUrl` (`${NEXT_PUBLIC_APP_URL}${relativePath}`)
6. Render `{ subject, html }` and call `sendEmail`
7. Wrap in try/catch that only logs — never throws back to the caller

Every new hook below checks **both** channels independently — `config.events.<key>.email` gates the `sendEmail` call, `config.events.<key>.inApp` gates the `Notification`/reminder write — using the shape above.

#### A.5.1 New document intake

**File:** `frontend/app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts`, inside the `leads.map(...)` block at lines 151-163 (which currently unconditionally writes `UserPersonalization.reminders`).

Wrap the existing reminder-write in `if (config.events.newDocumentIntake.inApp)`. Add, per lead, `if (config.events.newDocumentIntake.email)` → resolve email + send `renderDocumentIntakeEmail({ fileName, ctaUrl })`. New template file: `frontend/lib/email-templates/document-intake.ts`.

#### A.5.2 Document/Deliverable status changed + Document rejected

**File:** `frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts`, immediately after the `audit(...)` call at line 172.

```ts
const config = await getFirmReminderConfig(fileInfo.organizationId)
const isRejection = oldStatus === 'in_review' && status === 'in_progress'
const eventCfg = isRejection ? config.events.documentRejected : config.events.statusChanged
// isRejection → recipients = assignee(s)/uploader only
// otherwise    → recipients = eng_admin + eng_member
if (eventCfg.inApp) { /* create Notification row(s), dedupeKey per document+status */ }
if (eventCfg.email) { /* sendEmail per recipient via renderDocumentStatusChangedEmail(...) */ }
```

Fire-and-forget (`Promise.resolve().then(...)`, matching the existing descendant-sync pattern in the same file at lines 102-162) so the PATCH response isn't delayed by email sends. New template: `frontend/lib/email-templates/document-status-changed.ts` (parameterized by old/new status + rejection flag for subject/copy variation).

#### A.5.3 New comment from external client

**File:** `frontend/app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts`, after `prisma.docCommentMessage.create` (lines 168-188).

Check the commenting member's role (already resolved earlier in the handler for the reminder-tagging logic); if external (`eng_ext_collaborator`/`eng_viewer`), gate a new `Notification` row on `config.events.externalClientComment.inApp` and an email on `config.events.externalClientComment.email`, notifying `eng_admin` + `eng_member` for that engagement (reuses the same `EngagementMember` query pattern as intake). New template: `frontend/lib/email-templates/client-comment.ts`.

#### A.5.4 Engagement invite accepted

**File:** `frontend/lib/actions/engagement-membership.ts`, inside `joinEngagementForUser`, after the `project.member.added` event send at lines 177-187 (only when `newEngagementMemberCreated` is true — matches "accepted," not "already a member, re-synced").

Query `eng_admin` members for the engagement; gate a new `Notification` row on `config.events.engagementInviteAccepted.inApp` and an email on `config.events.engagementInviteAccepted.email`. New template: `frontend/lib/email-templates/invite-accepted.ts`.

*(Alternative considered: hook this into the `project.member.added` Inngest consumer at `functions.ts:972` instead of inline. Inline is simpler and avoids adding a second consumer to an event with existing side effects; revisit if this needs to be async/retryable.)*

#### A.5.5 Deliverable overdue

**File:** `frontend/lib/inngest/functions.ts`, extend `sendDeliverableDueReminder` (lines 1666-1729) with a third fire window: in addition to the existing 24h-before and 1h-before sends, add a check *after* `dueDate` has passed (e.g. fire once at `dueDate + 24h` if `status !== 'approved'`). The existing `channels: { inApp: true, email: false }` becomes `channels: { inApp: config.events.deliverableOverdue.inApp, email: config.events.deliverableOverdue.email }` — meaning the in-app write itself becomes conditional for the first time here too. Recipients: existing `memberUserIds` (assignees) plus `eng_admin` for the engagement.

This reuses the existing event-driven function rather than adding a new cron, per the research finding that no "scan for overdue" cron currently exists and none is needed — the due-date event is already scheduled per-deliverable.

### A.6 Files to modify (Part A)

| File | Change |
|---|---|
| `frontend/lib/actions/firms.ts` | Extend `FirmReminderEmailConfig` type + `getFirmReminderConfig()` defaults with `events.<key>.{email,inApp}` |
| `frontend/components/projects/firm-settings-form.tsx` | Add Event Notifications grid (6 rows × Email/In-App switches) to the existing Email Reminders card; extend load + save payload |
| `frontend/app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` | Gate existing in-app reminder write on `events.newDocumentIntake.inApp`; add email on `.email` |
| `frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts` | Add in-app `Notification` + email for status-changed / rejected, each gated independently |
| `frontend/app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts` | Add in-app `Notification` + email when an external member comments, each gated independently |
| `frontend/lib/actions/engagement-membership.ts` | Add in-app `Notification` + email to `eng_admin` after successful join, each gated independently |
| `frontend/lib/inngest/functions.ts` | Extend `sendDeliverableDueReminder` with an overdue fire window; make its existing in-app write conditional too |
| `frontend/lib/email-templates/document-intake.ts` (new) | Template |
| `frontend/lib/email-templates/document-status-changed.ts` (new) | Template |
| `frontend/lib/email-templates/client-comment.ts` (new) | Template |
| `frontend/lib/email-templates/invite-accepted.ts` (new) | Template |

---

## Part B — Web Push (PWA-style) Notifications

### Caveat — read before building

This is **fully greenfield**: no manifest, no service worker, no push subscription storage, no `web-push`/`next-pwa` dependency exists anywhere in the codebase today. It is not "wire up an existing pattern" work like Part A — it's new infrastructure. Two adoption caveats worth weighing before investing here:

- **iOS Safari only supports Web Push if the app is installed to the home screen** (iOS 16.4+). External clients are very unlikely to install Firma as a PWA; this channel is realistically **internal-staff-only** in practice, not a client-attention-grabber.
- Push subscriptions are **per-device**, not per-user — a user with 3 browsers/devices needs 3 subscriptions, and stale/revoked subscriptions need pruning (failed sends return 404/410 from the push service).

Given that, Part B should be scoped as "give internal staff a faster in-app-adjacent alert," not as a replacement or equivalent for the email channel serving external clients.

### B.1 Infrastructure to build

1. **VAPID keypair** — generate once (`web-push generate-vapid-keys` or `web-push.generateVAPIDKeys()`), store as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars (public key also exposed to the client as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
2. **Web app manifest** — new `frontend/app/manifest.ts` (Next.js App Router convention) declaring `name`, `icons`, `start_url`, `display: "standalone"`.
3. **Service worker** — new `frontend/public/sw.js` (or via `next-pwa` if we want asset caching bundled in, but a hand-rolled SW is enough for push-only — no offline-caching requirement here). Handles `push` event (show notification) and `notificationclick` (focus/open the relevant `ctaUrl`).
4. **Client-side registration** — a small hook (`useRegisterPush` or similar) that:
   - Registers the service worker on app load (behind a feature check, not a login-page prompt)
   - Triggers `Notification.requestPermission()` from a **deliberate user action** (e.g. a toggle in the existing user-level Notifications/Personalization settings), not automatically — browsers throttle/block auto-prompts
   - On permission granted, calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` and POSTs the resulting `PushSubscription` to a new API route
5. **Subscription storage** — extend `UserPersonalization` (`prisma/schema.prisma:736-747`, currently `bookmarks`/`reminders` Json fields) with a new field:
   ```prisma
   pushSubscriptions Json @default("[]")
   ```
   Array of `{ endpoint, keys: { p256dh, auth }, createdAt }`. Requires a Prisma migration (`--create-only`, per project convention).
6. **Subscribe/unsubscribe API** — `frontend/app/api/push/subscribe/route.ts` (POST to add, DELETE to remove by endpoint).
7. **Send pipeline** — server-side `frontend/lib/push.ts` wrapping the `web-push` npm package (Node-only — confirmed safe, no `edge` runtime routes exist in this repo, so no conflict), with a `sendPushToUser(userId, { title, body, ctaUrl })` helper that loads all subscriptions for that user and sends to each, pruning any that come back 404/410.

### B.2 Integration point — extend `Notification`, don't parallel it

Research finding: the `Notification` Prisma model already has `channels Json @default("{}")` and `emailSentAt DateTime?` — fields that look like they were designed for exactly this multi-channel future. Add a matching `pushSentAt DateTime?` column (migration) and treat `channels: { inApp, email, push }` as the real shape going forward.

Wire `sendPushToUser` into the same call sites Part A already touches (every place a `Notification` row or immediate email is created), gated by:
- `config.events.<key>.inApp` from Part A — push rides on the **In-App** column of the grid, not a third column (don't add a third switch; a native OS push notification is a delivery mechanism for the in-app notification, not a separate decision the admin needs to make), **and**
- The recipient having at least one stored `pushSubscriptions` entry (silently no-op otherwise)

This means Part B has almost no new "which event fires what" logic — it rides on the exact same trigger points as Part A, just adds a second dispatch call (`sendPushToUser` alongside `sendEmail`) at each of the 6 hook sites in A.5.

### B.3 Files to modify/add (Part B)

| File | Change |
|---|---|
| `frontend/app/manifest.ts` (new) | Web app manifest |
| `frontend/public/sw.js` (new) | Service worker: `push` + `notificationclick` handlers |
| `frontend/public/icons/*` (new) | App icons referenced by manifest (192/512px) |
| `frontend/lib/push.ts` (new) | `web-push` wrapper, `sendPushToUser()`, subscription pruning |
| `frontend/app/api/push/subscribe/route.ts` (new) | POST/DELETE subscription endpoint |
| `frontend/hooks/use-register-push.ts` (new) | Client-side SW registration + permission prompt + subscribe call |
| `frontend/components/...` (personalization/notifications settings UI) | Add a "Enable push notifications" toggle, calling the hook above |
| `frontend/prisma/schema.prisma` | Add `pushSubscriptions Json @default("[]")` to `UserPersonalization`; add `pushSentAt DateTime?` to `Notification` |
| `package.json` | Add `web-push` dependency |
| The 6 hook sites from A.5 | Add `sendPushToUser(...)` call alongside each `sendEmail(...)` call |

### B.4 Sequencing recommendation

Build Part A first and ship it — it's low-risk, reuses proven infra, and covers the primary "grab external client's attention" need via email. Build Part B as a follow-on once Part A's hook points exist, since B rides on those same call sites rather than introducing new ones.

---

## Prisma Migrations Required

Per project convention (`CLAUDE.md`), create with `--create-only`, do not apply directly:

```bash
npx prisma migrate dev --name add_push_subscriptions_and_push_sent_at --create-only
```
Covers: `UserPersonalization.pushSubscriptions`, `Notification.pushSentAt`. (Part A needs **no migration** — it only extends the existing `Firm.settings` JSON blob.)

---

## Verification

**Part A:**
1. Toggle each event's Email and In-App switches independently in Firm Settings → App Settings → Event Notifications grid → save → reload → confirm persistence (all 12 booleans round-trip correctly).
2. For each event with **Email on**: trigger the event (upload as EC, change a document's status, request changes as EV, comment as EC, accept an engagement invite, let a deliverable's due date pass) → confirm the expected recipient(s) receive an email and the copy/CTA link is correct.
3. For each event with **Email off**: repeat the trigger → confirm no email sends (check SMTP logs / `sendEmail` no-op path).
4. For each event with **In-App on**: confirm a `Notification` row (or reminder item, for intake) is created for the expected recipient(s).
5. For each event with **In-App off**: repeat the trigger → confirm no `Notification`/reminder row is created. This is a behavior change for New Document Intake and Deliverable Overdue (advance windows), which fire unconditionally today — verify admins can now genuinely silence them.
6. Confirm the two channels are independent: e.g. Email on + In-App off should still send the email with no in-app row, and vice versa.

**Part B:**
1. Install the app to home screen (or enable via browser prompt on desktop Chrome) → grant notification permission → confirm a `PushSubscription` row is stored.
2. Trigger one of the 6 events with push implicitly enabled → confirm a native OS notification appears, and clicking it opens the correct `ctaUrl`.
3. Revoke permission / uninstall → trigger an event again → confirm the stale subscription is pruned after a failed send (404/410) rather than erroring the whole dispatch.

---

## Housekeeping

- This plan file: `.claude/plans/firm-settings-event-email-and-push-notifications.md`
- Reference added to `docs/mvp/todo.md` under a new **Notifications** section.
