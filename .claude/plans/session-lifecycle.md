# Session lifecycle: no sign-out on deploy, real sign-out on security events

Decided 2026-11-03 with Deepak.

## Problem
- `proxy.ts` signed everyone out after every production build (a build-timestamp cookie,
  `lib/deployment-version.ts`, added 2026-02-10 in the RBAC commit "to rebuild cache with new code").
  The cache in question (`UserSettingsPlus`) is in memory per server with a 30-minute expiry, so a new
  deployment starts with it empty anyway: the sign-out protected nothing.
- That sign-out used Supabase's default `global` scope, so one page load after a deploy also logged the
  user out on every other device. The Sign out buttons were global too.
- `auth-context.tsx` sends any `/d` tab to `/signin` when the browser client reports SIGNED_OUT, so
  global revocations surfaced on other devices as abrupt logouts with no visible cause.
- Five server paths called `admin.auth.admin.signOut(userId)`. That API takes a user's JWT, not a user
  id, so every call failed silently: nobody was ever signed out by them.
- Nothing recorded unexpected sign-outs, so their frequency is unknown.

## Decisions
- **Releases never sign anyone out.** Tabs left open across a deploy get a "New version available —
  Reload" prompt instead (Vercel Skew Protection needs the Pro plan).
- **No `AUTH_EPOCH` env var.** Forced sign-outs use session deletion: rows in `auth.sessions`
  (refresh tokens cascade). It is immediate, covers API calls as well as pages, and needs no redeploy.
  Access tokens keep working until they expire (≤ 1 hour); every request already checks membership.
- **Sign out** ends this browser only (`scope: 'local'`). **Sign out of all devices** on the Profile
  page ends all of the caller's sessions.
- **Security events end sessions:** removal from a firm, account hard reset.
  **Not** removal from one engagement, a role change, or maintenance (platform or workspace
  migration): access is checked per request, and maintenance already redirects.
- **/system → Sessions → Sign out everyone** (except the admin running it), with a confirm step. It
  reports how many sessions ended, which also proves the production DB role may delete from
  `auth.sessions` (never exercised in production before).
- Unexpected SIGNED_OUT events (not from a Sign out click) are reported to Sentry as warnings.

## Work
1. `lib/auth/sessions.ts` (server-only): `endUserSessions(userId)`, `endAllSessions({ exceptUserId })`.
2. Replace the five `admin.signOut(userId)` calls: firm removal → `endUserSessions`; engagement
   removal, role change, platform and workspace maintenance → removed. Maintenance copy updated.
3. `proxy.ts`: drop the deployment-version check and its cookie; delete `lib/deployment-version.ts`.
4. `auth-context.tsx`: local sign-out; `signOutEverywhere()`; Sentry warning on unexpected SIGNED_OUT.
5. Profile: "Signed-in devices" section with Sign out of all devices (`/api/account/sessions`).
6. `/system`: Sessions card + `POST /api/system/sessions` (system admin only).
7. Version prompt: `/api/version` + a client hook comparing the page's build with the server's.
8. Tests for the helpers, routes and the proxy; typecheck; check in the browser.

## Open / later
- Inactivity timeout (sign out after N days unused): not in this round.
