# Engagement Invite: Immediate Join for Existing Users

## Context

Engagement-level invites currently work the same way regardless of whether the invitee already has an account. Today, `inviteMember()` (`frontend/lib/actions/invitations.ts:21-150`) always: creates/updates an `EngagementInvitation` row (status `PENDING`), silently pre-provisions a Supabase auth account if none exists (`maybeProvisionInviteeAccount`, purely so signup routes to signin later), and sends an "Accept Invitation" email with a `/invite/{token}` link. The actual `EngagementMember`/`ClientMember`/`FirmMember` rows are only created later, inside `acceptInvitation(token)`, and only once the invitee clicks the link and signs in.

This is a gap versus the intended product behavior:

- **Scenario 1 — invitee has no account yet**: current behavior is correct and should not change. They must sign up, and joining happens via the existing accept-invite flow.
- **Scenario 2 — invitee is already a registered user** (e.g. already a member of some other Engagement/Client/Firm): today they're treated identically to Scenario 1 — nothing happens until they click the email link and go through the accept flow. The requirement is that for this case, the membership rows should be inserted **immediately** when the invite is sent, a **different email** should go out (a direct link to the engagement, not an "accept invite" link), and the engagement must already appear under the Client in their dashboard even if they never open the email at all — just by signing in directly.

`computePermissions()` (`frontend/lib/user-settings-plus.ts`) already builds the dashboard's firm→client→engagement tree purely from `EngagementMember` rows (joined up through `ClientMember`/`FirmMember` for scope), so once those rows exist and the 30-minute cache is invalidated, the engagement shows up with no further action needed — this plan just needs to create those rows earlier than it currently does.

## Approach

Detect "is this email already a registered user" up front in `inviteMember()`, and branch:

- **Not registered** → today's flow, byte-for-byte unchanged.
- **Already registered** → create membership rows synchronously (reusing the exact transaction logic `acceptInvitation` already uses) and send a new "you've been added" email pointing straight at the engagement.

The membership-creation transaction currently lives inline inside `acceptInvitation()`'s engagement branch (`invitations.ts:506-614`) — extract it into a shared helper so both call sites (the existing accept-invite flow, and the new immediate-join path) run identical logic: create `EngagementMember`/`ClientMember`/`FirmMember` if missing, update JWT `app_metadata` for first-firm-join, grant Drive folder access, invalidate `userSettingsPlus` cache, fire the `project.member.added` Inngest event, and mark the invitation `JOINED`.

### New/changed files

1. **`frontend/lib/actions/auth-user-lookup.ts`** (new) — `findAuthUserIdByEmail(email): Promise<string | null>`. Same raw-SQL pattern already used in `account-provisioning.ts` and `app/actions/send-otp.ts` (`SELECT id::text FROM auth.users WHERE lower(email) = ... LIMIT 1`), extracted once so it's not duplicated a third time.

2. **`frontend/lib/actions/engagement-membership.ts`** (new):
   - `joinEngagementForUser(userId, userEmail, invite)` — the extracted transaction + side effects currently inline in `acceptInvitation` (`invitations.ts:506-614`): create membership rows if missing, mark invitation `JOINED`, JWT update, Drive grant, Inngest event, cache invalidation. Returns `{ redirectUrl, newEngagementMemberCreated }`.
   - `provisionAndNotifyExistingUser(existingUserId, normalizedEmail, invite, projectOrg)` — calls `joinEngagementForUser`, then sends the new "added directly" email. On email-send failure: log only, do **not** flip invitation status to `ERROR` (unlike Scenario 1's error handling) — the membership already exists regardless of whether the notification email lands.

3. **`frontend/lib/email-templates/added-to-engagement.ts`** (new) — `renderAddedToEngagementEmail({ firmName, engagementName, clientName, engagementUrl })`, built on the same `base.ts` helpers (`renderEmail`, `ctaButton`, `escHtml`) as `invite.ts`. Copy reflects "you've already been added — here's the link", CTA "Go to Engagement →", no 7-day-expiry footer. `engagementUrl` is built from the same `projectOrg` query `inviteMember` already fetches: `${NEXT_PUBLIC_APP_URL}/d/f/{firmSlug}/c/{clientSlug}/e/{engagementSlug}/files`.

4. **`frontend/lib/actions/invitations.ts`** (edit):
   - `inviteMember()`: call `findAuthUserIdByEmail(normalizedEmail)` once, up front. Both the "existing invitation" branch and the "create new invitation" branch fork on this result — the registered-user side calls `provisionAndNotifyExistingUser(...)` instead of `maybeProvisionInviteeAccount` + `renderInviteEmail`, and skips `upsertFollowUpReminder` (nothing pending to remind about once already `JOINED`). The unregistered-user side of both branches is **left completely untouched** — same lines, just moved under an `else`.
   - `acceptInvitation()`'s engagement branch (`invitations.ts:471-619`) is slimmed to: fetch invite, run the existing `JOINED`/expiry/email-match guards unchanged, then call `joinEngagementForUser(user.id, user.email, invite)` and return its result. Pure lift-and-shift, no behavior change for Scenario 1.

5. **`frontend/lib/actions/account-provisioning.ts`** (optional) — have `maybeProvisionInviteeAccount` call `findAuthUserIdByEmail` internally instead of its own copy of the raw SQL. Not required for correctness, just removes a duplicate query.

### Decision: keep the invitation record, immediately mark it JOINED (not PENDING, not skipped)

For Scenario 2, the `EngagementInvitation` row is still created (or updated, on resend) — just written straight to `status: JOINED, joinedAt: now()` in the same transaction that creates the membership rows, instead of ever passing through `PENDING`. It is **not** skipped entirely.

Why not skip the invitation record and just insert the member row directly:
- `getProjectMembers` (`members.ts:33-40`) only queries invitations with `status: { in: [PENDING, ACCEPTED, ERROR] }` for the "pending" list — `JOINED` is already excluded, so this achieves the same "no PENDING shown" UI outcome as skipping the record entirely, with no extra filtering logic needed.
- Several existing flows assume every invited member has a corresponding `EngagementInvitation` row: `resendInvitation`'s "already joined" guard, `removeMember`'s handling of `JOINED` invitations (sets `SUPERSEDED` on removal), the `@@unique([engagementId, email])` constraint that prevents re-inviting the same email while a row exists, and the audit trail of who invited whom and when. Skipping the row would require special-casing all of these for "member with no invitation history" — more risk than reuse.
- It lets Scenario 2 reuse the exact same `joinEngagementForUser` transaction as the real accept-flow (which also flips an existing invitation to `JOINED`) instead of adding a second, divergent "insert member with no invitation" code path.

Net effect: the invitation is created and resolved to `JOINED` atomically with the membership rows — a PENDING state is never observably written or shown.

### Idempotency / safety

- Double-invite protection is already in place: `inviteMember`'s top-of-function guard throws if `existing.status === JOINED`, so a repeat call after Scenario 2 has already joined someone is correctly rejected.
- `resendInvitation` and `verifyInvitation` already short-circuit on `status === 'JOINED'` (return redirect info without re-running any join logic) — confirmed by reading both; **no changes needed** in either.
- `InviteLandingClient` (`components/invite/invite-landing-client.tsx:49-55`) already redirects immediately when `invitation.status === 'JOINED'`, without calling `acceptInvitationAction` — so if a Scenario-2 invitee (or anyone) later opens the old `/invite/{token}` link, it just 302s them to the engagement. No changes needed there either.
- Keep the membership transaction's existing `findFirst`-then-`create` pattern as-is (matches current style) — the only new race is a genuine double-submit of `inviteMember` itself, which is low-traffic (an admin inviting one person) and already bounded by the `EngagementInvitation` unique constraint on `[engagementId, email]`. Not worth adding upsert/retry complexity for this change.

### What does NOT change

- Scenario 1 (unregistered invitee) flow — signup, OTP, `/auth/callback`, `checkEmailExists`, `maybeProvisionInviteeAccount`'s existing use.
- `revokeInvitation`, `removeMember`, `updateMemberPersona` in `frontend/lib/actions/members.ts`.
- `getProjectMembers` (`members.ts:21-40`) — already filters "pending invitations" to `PENDING`/`ACCEPTED`/`ERROR`, so a Scenario-2 invite (immediately `JOINED`) correctly disappears from the pending list and shows up as a full member right away instead. This is a visible, desired UX side effect worth confirming visually.
- `verifyInvitation`, `InviteLandingClient`, `/auth/callback`, email base layout (`email-templates/base.ts`).

## Regression Risk

**Low.** The riskiest part is refactoring `acceptInvitation`'s engagement branch to call the new shared `joinEngagementForUser` helper instead of inline code — this is the one place Scenario 1 touches the change. Mitigated by making that extraction a pure lift-and-shift (no logic changes), and manually re-testing the full Scenario 1 path (new user signup → invite accept → firm/client/engagement member rows created, JWT `active_firm_id` set on first firm join, Drive folder grant, Inngest event fired) after the refactor.

Everything else is additive (new files, a new branch gated on `existingAuthUserId`) and does not touch existing code paths.

## Effort Estimate

Roughly **half a day to a day** of implementation:
- New `auth-user-lookup.ts` helper: trivial (~10 min).
- Extracting `joinEngagementForUser` out of `acceptInvitation` + rewiring `acceptInvitation` to use it: ~1 hour, needs careful lift-and-shift + manual re-test of Scenario 1.
- New email template: ~30 min.
- `inviteMember()` restructuring (branch on `existingAuthUserId`, wire up `provisionAndNotifyExistingUser`): ~1 hour.
- Manual QA of both scenarios end-to-end (new-user invite, existing-user invite, resend, revoke, remove-member, re-visiting an old invite link after Scenario 2 join): ~1-2 hours.
- Prisma migration: **none needed** — no schema changes, this is pure application logic using existing tables.

## Verification

1. **Scenario 1 (unchanged)**: invite an email with no account → confirm `auth.users` gets a pre-provisioned row → click `/invite/{token}` → redirected to signup, detects `userExists: true` → OTP sign-in → `/auth/callback?next=/invite/{token}` → auto-join → `EngagementMember`/`ClientMember`/`FirmMember` created → lands on engagement files page.
2. **Scenario 2 (new)**: invite an email that already has an account (e.g. already a member of a different engagement) → confirm `EngagementMember`/`ClientMember`/`FirmMember` rows are created **immediately**, without any click → confirm the `EngagementInvitation` is `JOINED` right away → confirm the email received is the new "Go to Engagement" template with a direct URL, not an accept-invite link → sign in as that user directly (not via the email link) and confirm the new engagement already appears under its Client in the dashboard.
3. Confirm `getProjectMembers` shows the Scenario-2 invitee as a full member immediately (not in the "pending invitations" list).
4. Confirm revoke/remove/resend still work correctly for both a still-pending Scenario-1 invite and a Scenario-2 invite that's already `JOINED` (resend on a `JOINED` row should still throw "already joined", unchanged).
5. Re-open the original `/invite/{token}` link for a Scenario-2 invite after the fact — confirm it just redirects to the engagement with no errors.
