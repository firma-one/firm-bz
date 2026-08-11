# Plan: Hidden `/d/g` Route for Manual Multi-Group Testing

## Problem

User B is invited by User A (firm admin) into User A's firm as an engagement member.
On acceptance, B gets:
- `EngagementMember` (role e.g. `eng_member`)
- `ClientMember`
- `FirmMember` with `role: 'firm_member'` (never `firm_admin`) — `frontend/lib/actions/invitations.ts:533-553`

B has no UI path to start their own independent Firm today:
- `/d/onboarding` redirects any non-`firm_admin` member straight to their existing firm workspace (`frontend/app/(app)/d/onboarding/page.tsx:838-847`), skipping the create-firm wizard entirely.
- The "New Firm" button on `/d` (`FirmsView` → `AddFirmModal`) calls `createFirm()` (`frontend/lib/actions/firms.ts:241`), which calls `requireNonSandboxFirmCreationAccess` → `canCreateNonSandboxFirm` → `getEligibleGroups` (`frontend/lib/billing/firm-creation-gate.ts:21-59`). That requires the user to already be `firm_admin` in some group — B is not, so B sees "You have consumed the entitlements on your plan... Upgrade to add more," which is misleading (B was never blocked by a cap; B just isn't an admin anywhere).
- The **sandbox firm creation logic** (`findOrCreateSandboxShellFirm` in `frontend/app/api/onboarding/create-sandbox/route.ts:26-70`) has no admin-elsewhere gate — it creates a brand-new `Group` (named `"${firstName}'s Firm Group"`) with the user as `GROUP_ADMIN`, then a sandbox `Firm` with the user as `firm_admin`. This is the right mechanism, just not exposed outside the full onboarding wizard.

Data model already supports this: `FirmMember` is unique on `[userId, firmId]`, not per-user — a user can hold membership rows in many firms/groups at once (`frontend/prisma/schema.prisma:485-503`).

## Scope for this pass

**Not building the end-user UI choice yet.** This is purely a hidden, unlinked testing route so Deepak can manually create a second independent firm group for the same account and verify multi-group behavior (billing isolation, membership isolation, firm switching, etc.) before deciding how/whether to expose this to real engagement-only members later.

- No button, menu item, or link anywhere in the app points to this route.
- No changes to `AddFirmModal`, `firm-creation-gate.ts`, or the `/d/onboarding` redirect in this pass — existing behavior for real users is untouched.
- Route only usable by manually typing the URL while signed in.

## Change

### New page: `frontend/app/(app)/d/g/page.tsx`

Uses a `/d/g/` namespace (parallel to the existing `/d/f/{slug}` firm-workspace namespace) so that `g` reads as "group." This is a deliberate first step toward a future where `/d/f/...` nests under `/d/g/{groupSlugOrId}/f/...` — not building that nesting now, just reserving the URL shape so this route doesn't collide with it later.

Mirrors the existing `/d/f` workspace-picker page (`frontend/app/(app)/d/f/page.tsx`) but at the **group** level instead of the firm level:

- Authenticated client page, same pattern as `/d/f/page.tsx` (client-side Supabase session check, redirect to `/signin` if none).
- **List current firm group(s):** call `getUserFirms()` (already returns `groupId`/`groupName` per firm — `frontend/lib/actions/firms.ts:18-28,40`) and derive the distinct set of groups by `groupId` (one card per unique group, showing `groupName`, and optionally the firm(s)/count within it). No new server action needed — pure client-side dedupe of data already fetched elsewhere in the app.
- Render each group as a card, styled consistently with the `/d/f` firm cards (reuse the same card visual language: icon, name, "Continue" affordance) — clicking a group could route to `/d/f` filtered to that group, or simply into its primary/default firm; keep this simple since it's a testing tool, not a polished nested nav yet.
- **"Add Firm Group" button** (equivalent to `/d/f`'s "Add Firm" button, but not gated on `isAdminOnAnyFirm` — the whole point is to let a non-admin engagement-only user create their own first group). Opens a small inline form/modal: group/firm display name input + "Create" button.
- On submit, calls `POST /api/onboarding/create-sandbox` directly (existing route, unmodified) with `{ sandboxFirmName }` — this already:
  - Creates a new `Group` + sandbox `Firm`, user becomes `firm_admin`/`GROUP_ADMIN` of it, independent of any existing membership.
  - Sets it as the user's default firm and flips `active_firm_id`/`active_persona` JWT metadata to the new firm (existing behavior of that route — acceptable for a test tool; the old firm membership is untouched in the DB, just no longer the JWT default).
  - Seeds sample clients/engagements.
- On success, refresh the group list in place (new group card appears) and/or redirect to `/d/f/{firmSlug}` for the new firm.
- No new API endpoint needed — reuses `/api/onboarding/create-sandbox` and `getUserFirms()` as-is.

### Verification (manual, by Deepak)

1. Sign in as a user who already has a `firm_member` (non-admin) membership in some firm (e.g. via an accepted engagement invite).
2. Navigate directly to `/d/g` (not linked anywhere).
3. Confirm the existing group (containing the inviting firm) is listed as a card.
4. Click "Add Firm Group" → submit a name → confirm a new `Group` + `Firm` row is created, user is `firm_admin` on the new firm, and the original `FirmMember` row in the inviting firm is untouched.
5. Confirm `/d/g` now lists both groups, and `/d/f` still lists both underlying firms via `FirmList`.
6. Confirm switching between the two firms (existing firm switcher) works and billing/entitlements are scoped per-group correctly.

## Explicitly deferred to a later pass

- Exposing this as a real UI choice ("Continue with current firm" vs. "Create your own Firm") for actual engagement-only invitees.
- Fixing the misleading "entitlements consumed" copy in `AddFirmModal`/`firm-creation-gate.ts` for non-admin users.
- Changing the `/d/onboarding` redirect behavior for non-owners.
