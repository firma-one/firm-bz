# Browser (Web Push) Notifications for Reminders

## Context

Everything that surfaces in the topbar Reminders panel (`components/app/reminders-panel.tsx`) and `/d/u/reminders` today is either silent or reaches the user only by email at 09:00 UTC. A user who has Firma closed — or open but on another tab — has no way of knowing a follow-up, engagement due date, or document review is due.

Web Push is already fully built in this repo for **event** notifications (`lib/push.ts`, `public/sw.js`, `lib/hooks/use-register-push.ts`, `app/api/push/subscribe/route.ts`, `UserPersonalization.pushSubscriptions`). It is wired into `createEventNotifications()` in `lib/notify-event.ts`, so document/comment/invite events already push. **Reminders do not.** This plan closes that gap.

Goal: every reminder a user can see in the Reminders panel also reaches them as a native OS notification on the desktop, delivered even when the browser is minimised or has no Firma tab open.

## How "fires when the user first signs in for the day" is handled

Clarifying the mechanics, since this drove the design:

**Web Push does not require the user to be signed in, or to have a Firma tab open.** The subscription is bound to the browser profile/device, not the session. The push service (FCM for Chrome/Edge, Mozilla autopush for Firefox, APNs for Safari) holds the message and hands it to the browser's background process; the OS renders it. A 09:00-local push therefore lands whether the user is signed in, minimised, or hasn't touched Firma in a week — as long as the browser process is alive. If the machine is asleep or the browser is fully quit, the push service queues it (TTL) and delivers on next browser launch. So "they may not have signed in at 9am" is not a problem for the push channel itself.

What *is* a real gap: the user may have never granted permission, may be on a device with no subscription, or the push may have expired its TTL. For those, we add a second, in-app catch-up path.

So the design is **two channels sharing one per-day stamp**, so the user is notified exactly once per day:

1. **Scheduled push (away channel)** — hourly Inngest cron sends the digest push at each user's local 09:00.
2. **Sign-in catch-up (present channel)** — on the first authenticated app load of the user's local day, if the stamp for today is unset and there are due/overdue reminders, the reminders panel auto-opens with a count badge and a toast. No push is fired here; the user is looking at the screen.

Whichever fires first writes `remindersDigest.lastNotifiedDate = <YYYY-MM-DD in user local tz>` on `UserPersonalization`; the other then no-ops. A user who signs in at 07:00 gets the in-app catch-up and no 09:00 push; a user who never signs in gets the 09:00 push and sees no duplicate when they eventually open the app.

This requires a stored IANA timezone — captured silently from `Intl.DateTimeFormat().resolvedOptions().timeZone` on app load, no UI.

## How a push is routed to the right account

Worth stating precisely, because it drives Phase 0 below.

The push service never knows who the user is. **The account binding happens once, in our database, at subscribe time.**

1. `registration.pushManager.subscribe()` asks the browser's push service (FCM / Mozilla autopush / APNs) for an address. It mints an opaque endpoint URL that identifies **one browser profile on one device** — no account, no email.
2. `POST /api/push/subscribe` carries the Supabase session cookie, so the route resolves `user.id` and stores the endpoint under that user's `user_personalizations.push_subscriptions`. **This is the only moment a session is involved.**
3. `sendPushToUser(userId)` reads that user's endpoints and POSTs the encrypted payload to each. The push service just relays bytes — it cannot read the payload (encrypted with the subscription's `p256dh`/`auth`) and has no idea whose it is. VAPID only proves the sender is us.

The consequence: the subscription is bound to the **browser profile**, and it outlives the session. That is what makes delivery-while-signed-out work, and it is also the bug fixed in Phase 0.

## Phase 0 — Endpoint/account exclusivity (prerequisite)

A pre-existing defect, already affecting the event pushes shipped in `createEventNotifications`. This plan makes reminders push too, raising both the volume and the sensitivity of what leaks (notification bodies carry client names and engagement titles, visible on a lock screen).

Today `signOut()` at `frontend/lib/auth-context.tsx:146` calls only `supabase.auth.signOut()` — it never removes the push subscription. So on a shared browser, or any local multi-account testing:

- Sign out as A → A's reminders keep pushing to that browser.
- Sign in as B and enable push → the *same endpoint* is now stored under both A and B; both users' reminders land on one machine.
- **Session simply expires** and a different account is used → nothing in the sign-out path runs at all, so a client-side unsubscribe cannot help.

The fix must be server-side and self-healing, not dependent on a clean sign-out. **One endpoint belongs to exactly one user at a time.**

**0a. Steal-on-subscribe.** In `frontend/app/api/push/subscribe/route.ts`, before storing, strip the endpoint from every *other* user's array. One atomic statement via `$executeRaw` — no read-modify-write race:

```sql
UPDATE platform.user_personalizations
SET push_subscriptions = COALESCE(
  (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(push_subscriptions) elem
    WHERE elem->>'endpoint' <> $1),
  '[]'::jsonb)
WHERE user_id <> $2::uuid
  AND push_subscriptions @> jsonb_build_array(jsonb_build_object('endpoint', $1));
```

The `@>` containment operator matches a partial object inside an array element, so the `WHERE` is index-friendly and touches only affected rows.

**0b. Unsubscribe on explicit sign-out.** Call the existing `unsubscribe()` from `signOut()` in `frontend/lib/auth-context.tsx:146` before `supabase.auth.signOut()`. Two lines; the clean path.

**0c. Toggle reflects real state.** `PushNotificationToggle` (`app/(app)/d/u/notifications/push-notification-toggle.tsx`) initialises `useState(false)`, so the switch renders "off" on every page load even when the browser is subscribed. Resolve it from `pushManager.getSubscription()` in a mount effect. Needed here rather than in Phase 5, because 0a makes the toggle the supported way to re-bind a browser to a different account — it has to show the truth.

**0d. Make the toggle reachable.** `/d/u/notifications` is beta-gated — `frontend/app/(app)/d/u/layout.tsx:15` marks the tab `beta: true`, shown only when `settings.betaFeatures.dossier === true` (line 38). That page hosts the *only* control in the app that creates a push subscription, while `/d/u/reminders` (line 13) is ungated. Shipping reminder pushes without fixing this leaves most users unable to enable them.

Mount the same `PushNotificationToggle` on `/d/u/reminders` as well — same component, no duplicated logic, and it sits next to the feature it now governs. The Notifications page and its beta gate are left untouched.

### Deliberately not doing: automatic re-claim on load

An earlier draft added a `reclaim()` effect that silently re-POSTed any existing subscription on every app load, making account switching self-correcting even when the previous session merely expired. **Dropped as over-engineering.** It is the only genuinely complex piece here (new effect, new mount point, session-scoped guard), and all it buys over 0a is avoiding one manual toggle flip.

**Accepted gap:** if a session expires (or the user never signs out) and a different account is used in the same browser, the previous account keeps receiving pushes on that device until someone flips the push toggle off/on — which then re-binds the endpoint cleanly via 0a. Acceptable for local multi-account testing, and near-irrelevant in production where users rarely account-switch in one browser profile. Revisit if that stops being true.

## Scope

**In scope (desktop):**
- Per-reminder push alongside every existing scheduled reminder email.
- Daily digest push covering *all* reminder types — including the date-less ones (`Review document`, `Review comment`, `Review shared document`, `Reactivate subscription`) that have no scheduled email today.
- Firm Settings gate for reminders, matching the existing Event Notifications grid.
- Sign-in catch-up + once-per-day dedupe.

**Secondary, very low priority (mobile):** PWA install polish so Android/iOS home-screen installs receive the same pushes. Tracked as Phase 5, explicitly not blocking.

## Implementation

### Phase 1 — Data: timezone + digest stamp

Add one JSON column to `UserPersonalization` (`frontend/prisma/schema.prisma`, `platform.user_personalizations`):

```prisma
notificationPrefs Json @default("{}") @map("notification_prefs")
```

Holding `{ timezone: "Asia/Kolkata", remindersDigest: { lastNotifiedDate: "2026-09-26" } }`. A single JSON column keeps this consistent with the existing `bookmarks` / `reminders` / `pushSubscriptions` pattern and avoids a second migration when more prefs land.

Migration: `npx prisma migrate dev --name add_user_notification_prefs --create-only` (per CLAUDE.md — do **not** apply; Deepak applies via `npm run build`).

New `frontend/lib/actions/user-notification-prefs.ts`:
- `getUserNotificationPrefs(userId)` — read with defaults (`timezone: 'UTC'`).
- `setUserTimezone(tz)` — validated against `Intl.supportedValuesOf('timeZone')`, no-op if unchanged.
- `claimDailyDigest(userId, localDate): Promise<boolean>` — the dedupe primitive. Returns `true` only if it successfully moved `lastNotifiedDate` to `localDate`; both the cron and the sign-in catch-up call it and act only on `true`. Implement as a conditional `updateMany` (`where: { userId, NOT: { notificationPrefs: { path: ['remindersDigest','lastNotifiedDate'], equals: localDate } } }`) so a concurrent cron + page-load race cannot double-fire.

### Phase 2 — Timezone capture

New client component `frontend/components/app/timezone-sync.tsx`, mounted once in `frontend/app/(app)/layout.tsx`. On mount, reads the browser timezone and posts it to a new `POST /api/user/timezone` route, which calls `setUserTimezone`. Guarded by a `sessionStorage` flag so it fires once per tab session, not per navigation. Renders nothing.

### Phase 3 — Firm Settings gate

Add a `reminders` key to `FirmEventNotificationConfig` and `EVENT_NOTIFICATION_DEFAULTS` in `frontend/lib/actions/firms.ts:532-589`, defaulting to `{ email: true, inApp: true }` (email `true` preserves today's behaviour — reminder emails already send). Mirror the same in `frontend/components/projects/firm-settings-form.tsx:76-95` (`EventKey` union, defaults, and a new `EVENT_NOTIFICATION_ROWS` entry labelled **"Reminders due"**).

Per the existing convention documented in `lib/notify-event.ts`, **push rides the `inApp` flag** — there is no separate push column in the grid.

Multi-firm resolution (reminders are user-scoped, the grid is firm-scoped):
- **Per-reminder push** — gate on the firm that owns the reminder's entity, resolved via `resolveEntity()` in `lib/reminders/entity-registry.ts`.
- **Daily digest** — build the digest from only those reminders whose owning firm has `events.reminders.inApp === true`. If that leaves nothing, send nothing.
- Reminders with no resolvable firm (manual self-reminders on a deleted entity) fall back to allowed.

### Phase 4 — Delivery

**4a. Per-reminder push.** In `frontend/lib/inngest/functions.ts`, add a `sendPushToUser` call next to the existing `sendEmail` in each of:
- `sendReminderEmail` (line ~1323)
- `sendRecurringReminderEmails` (line ~1578)
- `sendDeliverableDueReminder` (line ~1666)

and in `sendImmediateReminderEmail` in `frontend/lib/actions/user-reminders.ts:327`. Each gated on the firm's `events.reminders.inApp`, reusing the existing `ctaUrl` and `entityName` already on the event payload. Use `tag: \`reminder:${reminderId}\`` so a re-fire replaces rather than stacks the OS notification.

**4b. Daily digest cron.** New Inngest function `sendDailyReminderDigest` in `frontend/lib/inngest/functions.ts`, `{ cron: "0 * * * *" }` (hourly):

1. Compute which IANA timezones are currently at local hour 9.
2. `findMany` on `UserPersonalization` for users in those timezones with a non-empty `pushSubscriptions` array.
3. For each, reuse the existing due/overdue logic — extract the window + label computation out of `getUserReminders()` in `lib/actions/user-reminders.ts` into an exported `computeDueReminders(userId)` helper so the cron and the panel cannot drift apart. Do **not** reimplement the date maths.
4. Apply the Phase-3 firm gate; drop `hiddenAt !== null` items.
5. `claimDailyDigest()` — skip if `false`.
6. `sendPushToUser` with a grouped payload: 1 item → that reminder's title and `ctaUrl`; >1 → `"3 reminders need attention"` with the overdue count in the body and `ctaUrl: '/d/u/reminders'`. Fixed `tag: 'reminder-digest'`.

**4c. Sign-in catch-up.** New server action `checkDailyReminderDigest()` called from the existing reminders fetch in `components/app/reminders-panel.tsx`. If `claimDailyDigest()` returns `true` and there are due/overdue items, the panel opens itself once with a toast. Purely in-app — no push.

**4d. Service worker.** `frontend/public/sw.js` needs no change: it already handles `title` / `body` / `ctaUrl` / `tag`. Optionally add `requireInteraction: true` for the digest so an away-from-desk user still sees it on return — worth doing, one line.

### Phase 5 — Mobile (secondary, very low priority, non-blocking)

Android Chrome already receives these pushes with no further work once installed to the home screen. iOS Safari requires the PWA be added to the Home Screen before `Notification.requestPermission()` is even available.

- Export real 192×192 and 512×512 icons and resolve the two `TODO`s in `frontend/app/manifest.ts` — iOS install prompts and notification icons render poorly without them.
- Add `"purpose": "maskable"` variants.
- In `PushNotificationToggle` (`app/(app)/d/u/notifications/push-notification-toggle.tsx`), detect iOS Safari without `navigator.standalone` and show "Add Firma to your Home Screen to enable notifications" instead of a dead switch.
- (The toggle's `useState(false)` reset-on-load bug is handled in Phase 0c, not here.)

## Files touched

| File | Change |
|---|---|
| `frontend/app/api/push/subscribe/route.ts` | Phase 0a — steal endpoint from other users on subscribe |
| `frontend/lib/auth-context.tsx` | Phase 0b — `unsubscribe()` before `signOut()` |
| `frontend/app/(app)/d/u/notifications/push-notification-toggle.tsx` | Phase 0c — real subscription state on mount |
| `frontend/app/(app)/d/u/reminders/page.tsx` | Phase 0d — mount `PushNotificationToggle` (ungated surface) |
| `frontend/prisma/schema.prisma` + new migration | `notificationPrefs` Json on `UserPersonalization` |
| `frontend/lib/actions/user-notification-prefs.ts` | **new** — prefs read/write, `claimDailyDigest` |
| `frontend/components/app/timezone-sync.tsx` | **new** — silent tz capture |
| `frontend/app/api/user/timezone/route.ts` | **new** |
| `frontend/app/(app)/layout.tsx` | mount `TimezoneSync` |
| `frontend/lib/actions/firms.ts` | `reminders` event key + default |
| `frontend/components/projects/firm-settings-form.tsx` | grid row + types |
| `frontend/lib/actions/user-reminders.ts` | export `computeDueReminders`; push in `sendImmediateReminderEmail`; `checkDailyReminderDigest` |
| `frontend/lib/inngest/functions.ts` | push in 3 existing fns; **new** `sendDailyReminderDigest` cron |
| `frontend/app/api/inngest/route.ts` | register the new function |
| `frontend/components/app/reminders-panel.tsx` | sign-in catch-up |
| `frontend/public/sw.js` | `requireInteraction` for digest |
| `frontend/app/manifest.ts` + icons | Phase 5 only |

Reused as-is, no changes: `lib/push.ts`, `lib/hooks/use-register-push.ts`, `lib/reminders/entity-registry.ts`, `lib/notify-event.ts`.

## Out of scope

- `frontend/lib/reminder-storage.ts` and the `Reminder`/`DueDateInfo` types in `lib/types.ts` are a dead localStorage implementation with no importers. Left untouched per the no-deletion-until-sign-off rule.
- The bell/notifications UI stays behind its `betaFeatures` gate; the reminders panel is not gated, and this plan does not change either.
- Snooze / per-reminder mute.

## Verification

1. `npm run build` (applies the migration).
2. Confirm `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` are set locally — without them `ensureVapidConfigured()` silently returns and nothing sends.
3. Enable push from the toggle on `/d/u/reminders`, accept the browser prompt. Verify a row landed in `user_personalizations.push_subscriptions`. Reload — the switch must still read "on" (Phase 0c).
3b. **Account exclusivity (Phase 0a):** with A subscribed, sign in as B in the same browser and flip the push toggle on. Verify the endpoint now appears in B's `push_subscriptions` and is **gone** from A's. Then sign out explicitly as B and confirm the row is cleared (Phase 0b).
4. Verify `notification_prefs.timezone` is populated after one app load.
5. **Per-reminder:** set a client follow-up date for tomorrow → Inngest dev server (`npx inngest-cli dev`) shows `reminder.email.scheduled`; trigger the run manually → OS notification appears with the client name and a working CTA.
6. **Digest:** invoke `sendDailyReminderDigest` from the Inngest dev UI with the local clock at 09:00 (or temporarily widen the hour match) → one grouped notification; a second invocation in the same local day sends nothing (dedupe holds).
7. **Minimised-browser requirement:** minimise the browser entirely, close all Firma tabs, re-trigger → the notification still renders. This is the acceptance test for the core ask.
8. **Catch-up:** clear `remindersDigest.lastNotifiedDate`, revoke push permission, load the app → reminders panel auto-opens with the toast, no push.
9. **Gate:** turn "Reminders due" → In-app off in Firm Settings → neither channel fires for that firm's reminders.
10. Unit tests for `claimDailyDigest` (concurrent claim → exactly one `true`) and `computeDueReminders` (overdue, due-today, date-less, hidden). Slots into the existing "Unit Tests → Reminder system" item in `docs/mvp/todo.md`.

## Risks

- **Double-notify on timezone change** — a user flying east could cross local 09:00 twice. The date-string stamp absorbs this; only a same-day tz change backwards could re-fire, and one extra notification is an acceptable failure mode.
- **Hourly cron cost** — 24 runs/day, each a single indexed query. Negligible, and it matches the existing `purgeDeletedEngagements` pattern.
- **Stale binding after a silent session expiry** — see "Deliberately not doing" above. Previous account keeps receiving on that browser until the push toggle is flipped. Known and accepted.
- **Firm gate on a personal surface** — a user in two firms where one has reminders off gets a partial digest. Documented above; if it proves confusing, the fix is a user-level override on `notificationPrefs`, which Phase 1's schema already accommodates without a migration.
