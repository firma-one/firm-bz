# Plan: Move "Choose Your Workspace" from /d/onboarding to /d/f/

## Context

The onboarding page at `/d/onboarding` serves two distinct audiences:
1. **New users** who need to go through the full 4-step onboarding (Initialize Workspace → Subscribe → Connect Drive → Finalize).
2. **Returning users who already completed onboarding** but are joining an additional organization — they see a "Choose your workspace" screen (Step 0).

Case 2 is the bug: a user who is already a member of one or more firms lands at `/d/onboarding` just to pick a workspace. The URL implies they're onboarding, but they're not. The OnboardingBar sidebar also shows steps they've already completed without a clear "Completed" status.

**Additional bug (EV/non-admin invited users):** An invited External Viewer (or any non-admin) who already has their own sandbox firm lands at `/d/onboarding` because `resolveDefaultFirmLandingPath` finds their sandbox as the default firm, sees incomplete onboarding, and routes them there — even though they have no business completing that onboarding. The role check in `resolveDefaultFirmLandingPath` only fires when the *default* firm is the invited firm; if `isDefault` was never set on the invited membership (user already had a default), the wrong firm wins.

The fix: Route the workspace-picker (Step 0) to `/d/f/` — a currently empty route that would inherit the AppSidebar (firm switcher, nav items) rather than the OnboardingBar. The AppSidebar is the correct chrome for a post-onboarding user picking a firm.

---

## Scope of Change

### What Step 0 Is (the "Choose your workspace" screen)

**Triggered when:** `step === 0` in `onboarding/page.tsx` — specifically when:
- `onboarding.isComplete === true` on the user's existing firm, AND
- The domain-options API returns additional orgs the user can join

**Current behavior:** Renders inside `/d/onboarding` with the OnboardingBar sidebar.

**Desired behavior:** Renders at `/d/f/` with the AppSidebar (main nav, firm switcher).

### Sidebar behavior at `/d/f/`

Sidebar decision in `d-layout-client.tsx`:
```typescript
const showOnboardingSidebar = pathname === '/d/onboarding' || pathname?.startsWith('/d/onboarding/')
```
`/d/f/` does NOT match → gets `<AppSidebar>` automatically. No layout changes needed.

---

## Implementation Plan

### Files to Modify

#### 1. New file: `app/(app)/d/f/page.tsx`
- Server component (or thin client wrapper)
- Calls the domain-options logic (currently in `/api/onboarding/domain-options`) to get already-member firms + joinable firms
- Renders the workspace card grid extracted from `onboarding/page.tsx` step 0 JSX
- On "Continue" on a firm card → redirect to `/d/f/{slug}`
- On "Create new Firm workspace" → redirect to `/d/onboarding`

#### 2. `lib/actions/firms.ts` — `resolveDefaultFirmLandingPath()`
- **Add case A (non-admin with any firm membership):** Before the existing `isFirmAdmin` check, collect ALL firms the user belongs to. If any exist and user is non-admin on the default firm → return `/d/f/` so they can pick the right workspace. This fixes the EV bug where their sandbox is `isDefault` but they were invited to a different firm.
- **Add case B (admin, onboarding complete, multi-firm or joinable domain orgs):** When onboarding is complete AND user has >1 firm or joinable domain orgs → return `/d/f/` instead of jumping straight to the default slug.
- Currently case B falls through to `/d/f/{slug}` of the default firm — the new branch sits before that.
- Case A sits before the existing `isFirmAdmin` branch — it supersedes the current non-admin short-circuit of returning `/d/f/{slug}` directly, replacing it with `/d/f/` when the user has multiple firms to choose from (single non-admin firm still goes directly to `/d/f/{slug}`).
- Function location: ~lines 163–191; called in 4 places (auth callback, d/layout, d/page, billing page)

#### 3. `app/(app)/d/onboarding/page.tsx` — Step 0 removal
- Remove the step 0 branch (`step === 0` renders "Choose your workspace")
- Ensure `initialStep` calculation never produces 0 for new users (it shouldn't — step 0 was only for returning users)
- Update `resolvePostOnboardingPath()` / `handleFinish()` to go directly to `/d/f/{slug}` without the step 0 detour

#### 4. `app/api/onboarding/domain-options/route.ts`
- Expose the domain-options query as a reusable server action so `app/(app)/d/f/page.tsx` can call it without an HTTP round-trip

---

## Impact Analysis

### Medium — why non-trivial:

1. **`resolveDefaultFirmLandingPath()` called in 4 places** — new branch must not break new-user or non-admin flows
2. **Domain-options check is async/client-side today** — must move to a server action for the new server-rendered `/d/f/` page
3. **Step 0 removal from `/d/onboarding`** — must not affect step 1–4 new-user flow
4. **Join-by-domain redirect** — users who click "Request access to join" currently stay in the onboarding page; need to redirect to `/d/f/` or `/d/f/{slug}` after joining

### Low-risk:
- `/d/f/` inherits AppSidebar automatically — no layout changes
- Workspace card UI is self-contained and extractable
- OnboardingBar is irrelevant here (not shown at `/d/f/`)

---

## Verification

1. New user (no firms) → still lands at `/d/onboarding` step 1
2. Returning user, single firm, onboarding complete → goes directly to `/d/f/{slug}` (no change)
3. Returning user, multiple firms or joinable domain orgs → now lands at `/d/f/` with AppSidebar
4. Click "Continue" on a firm card → redirects to `/d/f/{slug}`
5. Click "Create a new Firm workspace" → redirects to `/d/onboarding`
6. Non-admin with single firm membership → goes directly to `/d/f/{slug}` (no picker needed)
7. Non-admin with multiple firm memberships (e.g. has sandbox + was invited to another) → lands at `/d/f/` to pick
8. EV invited by firm admin, first ever sign-in (no prior firm) → single membership → goes directly to `/d/f/{slug}`
9. EV invited by firm admin, already had sandbox firm → multiple memberships → lands at `/d/f/` to pick
10. Firm admin, single firm, onboarding incomplete → still lands at `/d/onboarding` ✓
11. Firm admin, single firm, onboarding complete → goes directly to `/d/f/{slug}` ✓
