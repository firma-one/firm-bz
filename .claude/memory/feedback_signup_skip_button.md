---
name: Signup skip button sign-out bug
description: The "Skip onboarding" button on signup success signed the user out — reported 3+ times before root cause was found
type: feedback
---

When diagnosing unexpected sign-outs or "kicked to signin" reports after signup success, check buttons that call `supabase.auth.signOut()` first — even if the user says they didn't click anything.

**Why:** The "Skip onboarding for now" button on the signup success screen called `supabase.auth.signOut()`. It could be triggered by auto-focus + stray Enter keypress from OTP submission. The user reported being "kicked out to sign in" 3+ times before the root cause was found.

**How to apply:** When a user reports unexpected sign-outs on any auth flow, immediately grep for `signOut` calls in visible UI components before investigating effects, middleware, or session logic. Buttons near OTP inputs should have a brief activation delay (`skipReady` pattern) to absorb stray keypresses from form submission.
