# Signup Session Race Condition — Post-Beta Fix Plan

## Problem

New user OTP signup intermittently redirects to `/signin` instead of `/d/signup-success` on production.

### Root Cause

A race condition between the Supabase SDK writing auth cookies to the browser and the Next.js middleware reading those cookies on the next request.

Flow:
1. User enters OTP → `AuthService.verifyOTP()` succeeds → session set in Supabase JS in-memory store
2. `supabase.auth.getSession()` returns session (reads from memory, not cookies)
3. `window.location.href = '/d/signup-success'` fires immediately
4. Middleware intercepts the navigation, calls `supabase.auth.getUser()` from **request cookies**
5. On production, the auth cookie hasn't propagated into the browser's cookie jar yet → `user` is null → middleware redirects to `/signin`

This is production-only because `localhost` commits cookie writes synchronously before the navigation request leaves. On production (Vercel + custom domain), there is a measurable window between the SDK writing the cookie and it being available in the next outgoing request.

### Why It's Intermittent

It's a race condition — outcome depends on:
- Device/browser speed
- CPU load at time of navigation
- Whether the browser batches the cookie write and navigation dispatch

---

## Chosen Fix

Use `supabase.auth.onAuthStateChange` to gate the navigation. The `SIGNED_IN` event fires **after** the Supabase SDK has finished writing all auth cookies — making it the correct signal that the session is safe to navigate with.

### Change: `frontend/components/signup/signup-form.tsx` — `handleVerifyOTP`

**Before (current):**
```ts
const result = await AuthService.verifyOTP(email, codeToVerify)
// ...
const { data: { session } } = await supabase.auth.getSession()  // reads in-memory, NOT cookie
if (!session) { setError(...); return }
// ...
window.location.href = '/d/signup-success'  // fires before cookie is in jar
```

**After:**
```ts
// 1. Set up listener BEFORE verifyOTP so SIGNED_IN is never missed
const timeout = setTimeout(() => {
    subscription.unsubscribe()
    setError('Session took too long to establish. Please try again.')
    setLoading(false)
}, 10_000)

const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        clearTimeout(timeout)
        subscription.unsubscribe()
        justVerifiedRef.current = true  // prevent checkSession effect from racing
        window.location.href = '/d/signup-success'  // fires AFTER cookies committed
    }
})

// 2. Attempt OTP verification
const result = await AuthService.verifyOTP(email, codeToVerify)
if (!result.success) {
    clearTimeout(timeout)
    subscription.unsubscribe()
    setError(result.error || 'Invalid verification code')
    setLoading(false)
    return
}

// 3. Rest of existing logic (clearOnboardingData, analytics) unchanged
//    Remove getSession() check and the direct window.location.href call
```

### Why This Works

- `SIGNED_IN` is the SDK's own signal that the session is fully committed including cookies
- The listener is set up before `verifyOTP` so the event is never missed
- `justVerifiedRef.current = true` is set inside the listener (only on confirmed success) to prevent the `checkSession` effect from racing
- The 10s timeout ensures the user gets feedback if Supabase is slow/down

### Secondary Bug (fix at same time)

`frontend/components/signup/signup-success.tsx` — the "Skip onboarding for now" button calls `supabase.auth.signOut()` then redirects to `/signin`. It should redirect to `/d` (like the `onboarding` version at `components/onboarding/signup-success.tsx`).

```ts
// Wrong (current):
onClick={async () => {
    if (!skipReady) return
    await supabase.auth.signOut()
    window.location.href = '/signin'
}}

// Fix:
onClick={() => { if (skipReady) window.location.href = '/d' }}
```

---

## Risk Assessment

| Case | Risk |
|---|---|
| Local dev | Low — no behavioral change, cookies were never the issue |
| Production | Low — strictly safer than current (navigates later, after cookies committed) |
| Supabase slowness | Low — 10s timeout guard gives user feedback and cleans up |
| Google OAuth flow | None — OAuth redirects the page away before `handleVerifyOTP` is ever called |

---

## Files to Change

1. `frontend/components/signup/signup-form.tsx` — restructure `handleVerifyOTP`
2. `frontend/components/signup/signup-success.tsx` — fix skip button signout bug

## Decision

Deferred past beta launch. Ship as-is — the bug is intermittent and recoverable (user can sign in manually). Apply fix post-launch with proper testing time.
