# Plan: Fix Engagement Invitation Flow for New Users

## Context

When a firm member is invited to an engagement and they **don't yet have an account**, the current flow breaks:

1. They hit `/invite/{token}` → redirected to `/signup?next=/invite/{token}&email={email}`
2. They sign up via OTP
3. After OTP verification, Supabase redirects to `/auth/callback` **without the `next` param** — because `sendOTPWithTurnstile()` doesn't pass `redirectTo` to `signInWithOtp()`
4. `/auth/callback` falls back to `/d/onboarding` since the user has no firm yet
5. The invite token is lost — they never land back on `/invite/{token}` to join the engagement

For **existing users** (Scenario 1), the flow works because they sign in and `/invite/{token}` auto-joins them. The fix is to make new invitees look like existing users at invite time.

**Revoke/Cancel:** Already fully implemented — `revokeInvitation()` (pending) and `removeMember()` (joined) in `lib/actions/members.ts`. No additional work needed.

---

## Approach: Own Engagement Invite Flow — Pre-create auth.user with `createUser()`

When `inviteMember()` is called, if the invitee has no `auth.user` record yet, create one explicitly using the admin API. This is a first-class Supabase operation designed for exactly this scenario (admin-provisioned accounts).

```
adminClient.auth.admin.createUser({
  email,
  email_confirm: true,   // mark as confirmed so OTP sign-in works immediately
})
```

- No password set → user authenticates via OTP (same as existing users)
- No magic link generated or discarded
- We send our own invitation email with `/invite/{token}` as always
- When invitee clicks the link: `checkEmailExists()` returns `userExists: true` → signup page routes them to sign in with OTP
- OTP sign in → `/auth/callback?next=/invite/{token}` → auto-join → redirect to engagement

This is identical to Scenario 1 from the point the invitee clicks the link. Zero new UI, zero new redirect logic.

---

## Files to Modify

### 1. `frontend/lib/actions/invitations.ts` — `inviteMember()`

Add a call to a new private helper after the invitation record is saved (both create and update paths). The helper is idempotent — if the user already exists, it's a no-op.

```ts
// After saving EngagementInvitation record, before sending email:
await maybeProvisionInviteeAccount(email)
```

New private helper at bottom of file:

```ts
async function maybeProvisionInviteeAccount(email: string): Promise<void> {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM auth.users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1
    `
    if (existing.length > 0) return  // already has an account — nothing to do

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true,
    })
    if (error) {
        // Non-fatal: invite email still goes out; invitee falls back to signup flow
        logger.error('Failed to pre-provision invitee account', new Error(error.message), 'Invitations', { email })
    }
}
```

`createAdminClient` is already imported in `invitations.ts`.

---

## What Does NOT Change

- Invitation email template and `/invite/{token}` URL — unchanged
- `verifyInvitation()` and `acceptInvitation()` — unchanged
- `InviteLandingClient` redirect logic — unchanged
- `/auth/callback` — unchanged
- Signup page and `checkEmailExists()` — unchanged (already handles `userExists: true` correctly)
- Revoke/cancel flows — already exist, no changes needed

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `createUser` fails (Supabase outage, duplicate race) | Low | Non-fatal catch + log; invitee falls back to old signup → OTP → loses invite context (same bug as today, not worse) |
| Invitee already has account — duplicate call | None | Guard: check `auth.users` first, early return |
| Account created but invite never accepted (abandoned) | Low | Auth.user row exists with no firm membership — harmless; same as any user who signed up and never onboarded |
| Breaks Scenario 1 (existing users) | None | Helper returns immediately if user exists |

---

## Verification

1. Send an engagement invitation to an email with **no existing account**
2. Check Supabase `auth.users` — the email should appear with `email_confirmed_at` set
3. Click `/invite/{token}` in the email → redirected to `/signup?next=/invite/{token}&email={email}`
4. Signup page detects `userExists: true` → shows "sign in" prompt
5. Sign in via OTP → `/auth/callback` resolves `next=/invite/{token}` → auto-join → redirected to engagement files page
6. Confirm `EngagementMember`, `ClientMember`, and `FirmMember` records are created
7. Re-run with an **existing user email** — verify Scenario 1 still works unchanged
