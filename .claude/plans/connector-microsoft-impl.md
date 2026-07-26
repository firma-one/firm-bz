# OneDrive/SharePoint Storage Support — Full Plan

> Related: [connectors-additional-providers-support.md](connectors-additional-providers-support.md) — that plan's Phase 1a/1b/1c (workspace migration, permission-grant, Inngest abstraction, enum/field renames) are **already implemented** in the current codebase (`IConnectorMigrationAdapter`, `PERSONAL`/`SHARED` enum, `connectorPermissionId`). This document is the current, actionable plan for the remaining work: closing the last abstraction gap (Phase 0) and then building OneDrive/SharePoint itself (Phases 1–6).

## Overview of phases

Reordered so the three phases flagged **Low** regression risk (1b, 2, 5) run first, right after Phase 0 — they're additive and don't touch Google Drive code paths. Phase 3 (Low-**Medium**) stays gated behind Phase 2, since site selection needs the Graph adapter to exist first. A new Phase 1a is inserted ahead of everything else in the OneDrive track: the external Azure/Microsoft Entra portal configuration that Phase 1b's OAuth code depends on to even run.

| Order | Phase | Goal | Status | Regression Risk | Impact if it breaks |
|---|---|---|---|---|---|
| 1 | **0** | Abstract document-lifecycle Drive coupling (preview, support attachments, sharing regrant) behind existing adapter interfaces — no OneDrive code yet | **✅ Done (code) — manual QA pending** | **Medium** — refactors live Google Drive code paths; risk is behavior drift, not new failure modes (see per-step risk below) | Google Drive users (100% of current base) hit broken preview, broken attachment upload/download, or broken sharing — this is the only phase that touches paths already in production use |
| 2 | **1a** | External Azure/Microsoft Entra app registration & OAuth config — manual portal work, not code | **✅ Done (2026-07-22)** — app registered, secret + local Supabase Azure provider wired; Phase 1b code not yet written so end-to-end OAuth is untested | **N/A** — no app code touched; risk is entirely in getting the Azure config right | Blocks all OneDrive OAuth connection attempts until fixed; zero impact on existing Google Drive users (isolated new infrastructure) |
| 2b | **1a-signin** | "Sign in with Microsoft" — smallest possible slice that exercises Phase 1a's Azure app registration + Supabase Azure provider end-to-end via a real browser OAuth round-trip, with zero Graph/connector code. Serves as the foundation smoke test before investing in Phase 1b/2. | Not started | **Low** — one new button + one new function mirroring `signInWithGoogle`; touches the shared sign-in page but adds a new code path rather than modifying the existing Google one | Users clicking "Continue with Microsoft" see an error; zero impact on Google/OTP sign-in, which is a separate code path |
| 3 | **1b** | Microsoft Graph OAuth code (connect flow, token storage/refresh) — consumes Phase 1a's credentials | Not started | **Low** — additive only; new routes, new env vars, no existing code path modified | None to existing users; failure only blocks new OneDrive connections from working |
| 3 (parallel) | **2** | Real adapter implementations — fill `onedrive-connector.ts`/`onedrive-adapter.ts` stubs, implement `IConnectorPermissionAdapter`/`IConnectorMigrationAdapter`/`IConnectorContentAdapter` (from Phase 0) against Microsoft Graph | Not started | **Low** — new implementation behind existing interfaces; Google Drive adapters untouched | None to existing (Google) users; OneDrive users see broken folder/file/permission operations until fixed |
| 4 | **5** | UI — enable OneDrive tab, connector icon, connect flow, file picker | Not started | **Low** — new components + a config flip (`enabled: false → true`); no shared UI components modified | OneDrive users only; worst case is a broken connect flow, not a regression for existing Google Drive users |
| 5 | **3** | SharePoint site selection (site picker, `workspaceRootSharedStorageId` wiring — schema already generic) | Not started | **Low-Medium** — reuses existing generic schema fields, but first real write path to `workspaceRootSharedStorageId` for a non-Google provider; could expose latent assumptions in that field's Google-only history | OneDrive/SharePoint users only; a misconfigured site link could point a workspace root at the wrong SharePoint site (data-exposure risk, contained to opted-in OneDrive connectors) |
| 6 | **6** | Testing — adapter/permission/migration/content test suites mirroring existing Google ones | Not started | **None** — test-only, no production code changes | None; catching gaps here prevents risk in Phases 1b-3 from reaching production undetected |

**Dependency notes:**
- Phase 1a has zero dependency on anything — it's Azure Portal work only, can start immediately.
- Phase 1a-signin depends only on Phase 1a's completed Azure config (done) and the `[auth.external.azure]` Supabase block (done). It has no dependency on Phase 1b/2/5 — deliberately the next thing to build so Phase 1a's foundation is verified working before further investment.
- Phase 1b depends on Phase 1a's credentials (`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_TENANT_ID`) to actually run/test, though the route code itself can be scaffolded in parallel.
- Phase 2 depends on Phase 0's interfaces (done) but not on live Microsoft credentials until integration testing — can be scaffolded in parallel with 1a/1b.
- Phase 5 (UI) trails Phase 1b — the "Connect" button needs a working OAuth flow to wire into, though icons/tab scaffolding can start earlier.
- Phase 3 stays gated behind Phase 2 (needs the adapter to persist a real site selection) — not reordered forward despite being close to Low risk.
- Phase 6 stays last as the cross-cutting safety net regardless of implementation order.

Each phase gets its own detailed plan (like Phase 0's) once the prior phase lands, since later phases depend on interface shapes Phase 0 finalizes and on real Graph API behavior not yet validated against this codebase.

### Phase 1a — External Azure/Microsoft Entra OAuth Configuration (manual, portal-based)

**Type:** Manual work in the Azure Portal / Microsoft Entra admin center (entra.microsoft.com) — not code. This is the user's own action; Claude cannot execute it. Produces the credentials Phase 1b's code needs.

**Regression risk:** N/A (no existing code touched). **Impact if misconfigured:** blocks all OneDrive OAuth connection attempts; zero impact on existing Google Drive users since this is entirely new, isolated infrastructure.

**Steps:**

1. **Prerequisite check** — no paid Azure subscription required. Microsoft Entra ID Free is bundled with any Azure or Microsoft 365 account and is sufficient for app registration + OAuth. Needs the **Application Developer** role in some tenant (a free default directory works).

   **Gotcha — personal Microsoft accounts have no directory by default.** A plain personal account (outlook.com/hotmail/live, never used to sign up for Azure or M365) has nothing to register an app against yet. Navigating to "Manage Microsoft Entra ID" from a personal-account settings surface (e.g. account.microsoft.com) errors out because there's no tenant behind it — Azure doesn't auto-provision a directory from that path.

   **Fix — create a free Azure account to auto-provision a directory:**
   - Go to [azure.com/free](https://azure.com/free) and sign up using the personal Microsoft account, or a different Microsoft account if this one keeps hitting issues (a new outlook.com account works fine — no existing history required).
   - No paid subscription needed to use Entra ID Free; Azure may ask for a card for identity verification only.
   - This provisions an Azure tenant with a default Entra ID directory, and makes the signing-in account its Global Administrator.
   - Once this completes, entra.microsoft.com → App registrations → New registration will work, since a directory now exists to register into.
   - If the personal account continues to fail (e.g. flagged, region-restricted, or stuck in a bad state), repeat this step fresh with a different Microsoft account — the app registration itself isn't tied to any specific personal account, only to whichever directory/tenant ends up hosting it.

   **Cosmetic error to expect and ignore — "Interaction required" / AADSTS16000 on the Entra Overview page.** After clicking "Manage Microsoft Entra ID" → View, the tenant Overview page may show a popup: `AADSTS16000: User account '{EUII Hidden}' from identity provider 'live.com' does not exist in tenant 'Microsoft Services' and cannot access the application '...' (ADIbizaUX) in that tenant.` This is the portal's "My feed" widget silently trying to reach an unrelated Microsoft-internal tenant ("Microsoft Services") for news/feed content — it has nothing to do with your actual tenant, which is already working (Tenant ID, Users, License = Microsoft Entra ID Free all render fine underneath the dialog). Click **Ignore** and proceed to Manage → App registrations → New registration.

2. **Register the app** — entra.microsoft.com → Entra ID → App registrations → New registration.
   - Name it (e.g. "Pockett — OneDrive/SharePoint").
   - **Supported account types: select "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts"** — the only option that lets both work/school (SharePoint-capable) and personal OneDrive accounts sign in.
   - Register. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

3. **Configure the redirect URI** — Authentication → Add a platform → **Web** (not SPA, not Mobile/Desktop — Web is correct for a Next.js server-side confidential-client auth-code flow, matching the existing Google OAuth pattern at `app/api/connectors/google-drive/callback/route.ts`).
   - Add `https://<your-domain>/api/connectors/onedrive/callback` (and a `localhost` equivalent for local dev), matching Phase 1b's planned route.

4. **Generate a client secret** — Certificates & secrets → Client secrets → New client secret.
   - Expiry ≤12 months (Microsoft's max is 24; shorter is recommended).
   - **Copy the secret's Value immediately** — shown only once. (Not the "Secret ID," which is just a management identifier.)
   - This becomes `MICROSOFT_CLIENT_SECRET`.

5. **Scope decision — "Sign in with Microsoft" is now in scope alongside the storage connector.** This changes what a single app registration must support and is worth getting right before configuring API permissions.

   **The problem:** requesting broad scopes (`Files.ReadWrite.All`, `Sites.ReadWrite.All`) on every Microsoft OAuth redirect — including a login button — would show users a scary, over-permissioned consent screen just to sign in, and risks tripping tenant admin-consent blocks for users who only want to log in, not connect storage.

   **The fix — one app registration, two separate authorize requests with different scope sets.** OAuth scopes are requested per authorize-URL call, not fixed to the app registration; "API permissions" in Entra ID is the *superset* of scopes the app is allowed to ever request, not what every login must ask for. So:
   - **Sign-in flow** (`app/api/auth/microsoft/{route,callback}.ts` or equivalent, new in this phase) requests only `openid profile email User.Read` — an identity-only consent screen, same weight as "Continue with Google" today.
   - **Connect OneDrive/SharePoint flow** (Phase 1b's existing planned route) requests `Files.ReadWrite.All Sites.ReadWrite.All offline_access` — shown only when a user deliberately clicks "Connect OneDrive" inside the already-authenticated app, never at login.
   - Both flows share the same `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`; only the `scope` query param differs between the two authorize URLs.
   - This mirrors the existing Google pattern in this codebase, which uses **separate client IDs** (`GOOGLE_CLIENT_ID` for Supabase sign-in vs `GOOGLE_DRIVE_CLIENT_ID` for the Drive connector) to achieve the same scope separation — Microsoft's approach differs (one app, two scope sets) because Supabase's Azure provider needs its own client ID/secret pair configured in Supabase Auth settings regardless of how many Entra app registrations exist, so reuse is simpler here than mirroring Google's two-client-ID split exactly.

   **New work this adds to the plan (not previously scoped):**
   - Supabase Auth: enable and configure `[auth.external.azure]` in `frontend/supabase/config.toml` (currently absent — only `[auth.external.google]` exists) with `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` and scope `openid profile email User.Read`.
   - Sign-in UI: add a "Continue with Microsoft" button to `frontend/app/(app)/signin/signin-view.tsx`, alongside the existing Google button, calling `supabase.auth.signInWithOAuth({ provider: 'azure', ... })`.
   - **Confirmed via GoTrue source (`supabase/auth` `internal/api/provider/azure.go`):** Supabase's `azure` provider scope is controlled entirely client-side per `signInWithOAuth` call — it defaults to `openid` only if `options.scopes` is omitted, and never reads/injects the Azure app registration's configured Graph API permissions. Safe to share one app registration with the connector. **The sign-in button's code must explicitly pass `options: { scopes: 'email profile openid' }`** (email is required — Supabase Auth needs a valid email and does not request it by default) and must NOT include `Files.ReadWrite.All`/`Sites.ReadWrite.All` in that call. `frontend/supabase/config.toml`'s `[auth.external.azure]` block has no scope setting of its own — scope is entirely a client-call concern, not a config-file concern.
   - This sign-in work is a distinct code change from Phase 1b's OneDrive connector OAuth code; track it as its own step/PR rather than bundling into Phase 1b, since it touches the shared sign-in page rather than being purely additive/isolated like the rest of Phase 1b.

6. **Configure API permissions (delegated Microsoft Graph scopes)** — API permissions → Add a permission → Microsoft Graph → Delegated permissions. This is the full superset available to the app; individual authorize requests (per step 5) will only ask for the subset relevant to that flow:
   - `openid`, `profile`, `email` — standard OIDC
   - `User.Read` — basic profile
   - `offline_access` — required to receive a refresh token
   - `Files.ReadWrite.All` — OneDrive file access (broader than `Files.ReadWrite`, matches Google Drive's `drive.file`/`drive.appdata` breadth)
   - `Sites.ReadWrite.All` — SharePoint site access
   - None of these delegated permissions require tenant-admin consent per Microsoft's permission table, but many customer tenants enforce admin consent anyway via risk-based step-up consent policies — build for that (see step 8).
   - **Decision point:** `Sites.ReadWrite.All` is broad (flagged prominently on the consent screen) versus `Sites.Selected`, which is least-privilege but requires an additional per-site grant call (`POST /sites/{siteId}/permissions`) after consent, meaning Phase 3 would need to build that grant step too. Recommend starting with `Sites.ReadWrite.All` for a simpler Phase 3; revisit `Sites.Selected` later if customers push back on the broad scope.

7. **Note the OAuth endpoints for Phase 1b's code:**
   - Authorize: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
   - Token: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
   - Use the `common` tenant segment (not `organizations` or `consumers`) for sign-in, since the app is registered for both personal and work/school accounts.

8. **Plan for the admin-consent flow (multi-tenant SaaS specifics)** — each customer firm has its own Microsoft 365 tenant, separate from Pockett's. For firm-level (not just individual-user) onboarding, Phase 1b's code should support the explicit admin-consent endpoint:
   `https://login.microsoftonline.com/{tenant}/v2.0/adminconsent?client_id=...&scope=...&redirect_uri=...&state=...`
   using `organizations` or the specific customer tenant ID (never `common` — personal accounts can't grant admin consent). This mirrors a "Connect your organization" step a firm's IT admin clicks through once.

9. **Publisher verification (recommended, not strictly required to function)** — unverified multi-tenant apps show an "unverified publisher" warning on the consent screen, and tenants with risk-based step-up consent may block self-service consent entirely for unverified apps requesting broad scopes like `Sites.ReadWrite.All`. Verification is free: enroll in the Microsoft AI Cloud Partner Program (a Partner Global Account), register the app under a work/school account, use a non-`onmicrosoft.com` publisher domain. Recommended before onboarding real customer firms, since it directly affects whether firm admins trust/complete the consent flow.

10. **Capture and store credentials as env vars** (consumed by Phase 1b):
    - `MICROSOFT_CLIENT_ID` — Application (client) ID from step 2
    - `MICROSOFT_CLIENT_SECRET` — secret Value from step 4
    - `MICROSOFT_TENANT_ID` — Directory (tenant) ID from step 2 (used for admin-consent flows; sign-in itself uses `common`)
    - Add to `.env`/`env.example` alongside the existing `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` pattern in `lib/config.ts`.

11. **Understand refresh token behavior for later phases** — v2.0 refresh tokens have a 90-day sliding lifetime (each use rotates in a new one, resetting the clock for active connections). A customer firm's connection left unused for ~90 days needs re-consent. Phase 1b/2's token-refresh code should handle `invalid_grant`/`interaction_required` errors by marking the connector `EXPIRED` and prompting reconnection — the same pattern already used for Google Drive in `google-drive-connector.ts`'s `refreshAccessToken`.

**Costs:** Free. App registration and Graph API calls incur no Azure charges under Entra ID Free. Costs only apply if other Azure resources are separately provisioned (not needed here) or Entra ID P1/P2 governance features are added later (not required for OAuth).

**Files/docs to update once done:**
- `frontend/env.example` / `env.production.example` — add `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` placeholders
- This plan file — mark Phase 1a done, record the actual client ID/tenant ID (not the secret) for reference, note which scope choice (`Sites.ReadWrite.All` vs `Sites.Selected`) was made

**Verification:**
- App registration's Overview page shows the correct Application (client) ID and Directory (tenant) ID
- Redirect URI is registered under a **Web** platform, exact match to the planned callback route
- All permissions listed under API permissions with expected consent status
- Manually test the authorize URL in a browser (placeholder redirect) to confirm the Microsoft consent screen renders and lists the requested scopes correctly, for both a personal Microsoft account and a work/school account

---

## Phase 1a — Actual results (done 2026-07-22)

**App registration:**
- Name: **Firma Connect**
- Application (client) ID: `58e93077-c3c2-426d-ac6d-96be7b877c61`
- Directory (tenant) ID: `6e837b68-c5f0-4bb1-a1ff-5a739da980d0` ("Default Directory")
- Supported account types: **Any Entra ID Tenant + Personal Microsoft accounts** (multitenant + personal), as planned
- Client secret: description "Firma Connect - OneDrive", **expires 2028-07-21 (24 months — longer than the plan's ≤12-month recommendation; user's explicit choice)**. Rotate before this date or Phase 1b's OAuth flows break with `invalid_client`.
- Redirect URIs registered (Web platform):
  - `http://localhost:3000/api/connectors/onedrive/callback` (local dev)
  - `https://www.firma.bz/api/connectors/onedrive/callback` (production)
  - `http://localhost:54321/auth/v1/callback` (local Supabase Auth callback — see gotcha below)
  - *(Still needed before Phase 1b ships: a production Supabase Auth callback URI, e.g. `https://<project>.supabase.co/auth/v1/callback`, once the "Sign in with Microsoft" button is built.)*
- API permissions granted (all Delegated, Microsoft Graph): `openid`, `profile`, `email`, `User.Read`, `offline_access`, `Files.ReadWrite.All`, `Sites.ReadWrite.All`. Scope choice made: **`Sites.ReadWrite.All`** (not `Sites.Selected`), per the plan's simpler-Phase-3 recommendation.
- Credentials stored in `frontend/.env` (git-ignored) as `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`; placeholders added to `env.example` and `env.production.example`.

**Scope change from original plan — "Sign in with Microsoft" added:** partway through this phase, the user decided Microsoft sign-in should ride on the same app registration as the OneDrive/SharePoint connector (see the new step 5 above, "Scope decision"). This was **not** in the original Phase 1a/1b scope and adds real Phase 1b-adjacent work not yet built:
- `frontend/supabase/config.toml` now has an `[auth.external.azure]` block (added this phase, previously absent — only `[auth.external.google]` existed).
- Still needed in code (Phase 1b or a dedicated sub-step): the actual "Continue with Microsoft" button in `frontend/app/(app)/signin/signin-view.tsx`, calling `supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email profile openid' } })`. **Must not** pass the Graph file/site scopes in this call — confirmed via GoTrue source that Supabase never mixes in the Azure app registration's configured Graph permissions automatically, so the sign-in consent screen stays narrow as long as the client call itself stays narrow.

**Gotchas encountered and resolved this session (documented here so they aren't rediscovered from scratch):**

1. **Personal Microsoft accounts have no directory by default.** Navigating "Manage Microsoft Entra ID" from a personal-account context can error because there's no tenant yet. Fixed by completing a *full* signup at [azure.com/free](https://azure.com/free) (not just clicking into an ambient/default tenant view) — this properly provisions an Azure tenant + default Entra ID directory and makes the account its Global Administrator. Card details are required for identity verification even on the free tier; no charge occurs unless you separately provision paid resources.
   - The Azure signup form's "Company name" field was required even under "For personal use" — worked around by entering a placeholder value (a real name string like "Self-employed"; literal "NA" was rejected by validation).

2. **Cosmetic "Interaction required" / `AADSTS16000` popup on the Entra Overview page** — text like `User account '...' from identity provider 'live.com' does not exist in tenant 'Microsoft Services' and cannot access the application '...' (ADIbizaUX)`. This is the portal's own "My feed" widget failing to reach an unrelated Microsoft-internal tenant; it's unrelated to your actual tenant/directory, which works fine underneath. **Click Ignore** and proceed — don't try to "fix" this by re-authenticating, which just re-triggers the same broken internal call. (If it appears blocking a real action like "New registration" itself rather than as a dismissable popup, that's a different, real problem — see gotcha 1's fix.)

3. **Azure Web redirect URIs reject bare loopback IPs.** Azure Portal's URI validation only accepts `https://` or the literal hostname `localhost` — `http://127.0.0.1:...` is rejected with "Must start with 'HTTPS' or 'http://localhost'". Since Supabase's local auth callback defaults to `127.0.0.1` in some configs, `frontend/supabase/config.toml`'s `[auth.external.azure].redirect_uri` was explicitly set to `http://localhost:54321/auth/v1/callback` (not `127.0.0.1`) to satisfy this — Google's redirect URI in the same file is untouched and still uses `127.0.0.1`, since Google's validation doesn't have this restriction. `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`) also needed no change — it's a separate concern (app→Supabase API calls), not sent to Azure for validation.

4. **MFA "security defaults" prompt** — the tenant has Microsoft's baseline "security defaults" policy enabled (visible under Entra ID → Properties, green checkmark), which will prompt the signed-in user to register MFA (Microsoft Authenticator app recommended) at some point. This was skipped/deferred during this session after hitting an unspecified setup error; it does not block app registration, API permissions, or client secret creation, but should be revisited before this account is relied on long-term as the tenant's Global Administrator.

**Files/docs updated in this phase:**
- `frontend/env.example`, `frontend/env.production.example`, root `env.example`, root `env.production.example` — added `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_TENANT_ID` placeholders
- `frontend/.env` — actual local credentials added (git-ignored)
- `frontend/supabase/config.toml` — new `[auth.external.azure]` block added
- This plan file

### Phase 1a-signin — "Sign in with Microsoft" (foundation smoke test)

**Why this comes before Phase 1b/2:** Phase 1a's Azure app registration and Supabase `[auth.external.azure]` config are configured but never exercised by a real browser OAuth round-trip. This phase is the smallest possible slice that proves the foundation actually works — one button, one function, reusing 100% of Supabase's existing OAuth machinery — before investing in Phase 1b's Graph token-storage/refresh code or Phase 2's adapter implementations.

**Pattern to mirror:** `signInWithGoogle` in `frontend/lib/auth-context.tsx:90-115` and the "Continue with Google" button in `frontend/app/(app)/signin/signin-view.tsx:287-315`. Google's flow is gated behind email verification first (not a standalone one-click button) — decide whether Microsoft follows the same UX gate or is offered as an independent option; simplest is to mirror Google exactly for consistency.

**Code changes:**
1. **`frontend/lib/auth-context.tsx`** — add `signInWithMicrosoft(email?: string, next?: string): Promise<void>` alongside `signInWithGoogle`, following the identical `baseUrl`/`callbackUrl` localhost-vs-prod logic, but:
   ```typescript
   const { error } = await supabase.auth.signInWithOAuth({
     provider: 'azure',
     options: {
       redirectTo: callbackUrl,
       scopes: 'email profile openid',  // NOT Files.ReadWrite.All / Sites.ReadWrite.All — see Phase 1a step 5
       queryParams: email ? { login_hint: email } : undefined,
     },
   })
   ```
   Add `signInWithMicrosoft` to the `AuthContextType` interface and the context `value` object.
2. **`frontend/app/(app)/signin/use-sign-in-flow.ts`** — extend `handleEmailSubmit`'s `method` union from `'google' | 'otp'` to `'google' | 'microsoft' | 'otp'` (or add a parallel `handleMicrosoftSubmit`, matching however `handleEmailSubmit` is structured); add a `microsoftLoading` state mirroring `googleLoading`.
3. **`frontend/app/(app)/signin/signin-view.tsx`** — add a second outlined button below/beside "Continue with Google" using the same `OUTLINE_SECONDARY` class, a Microsoft logo SVG (4-color squares, not Google's colored "G"), and `{microsoftLoading ? 'Signing in…' : 'Continue with Microsoft'}`.
4. **`/auth/callback` route** — check whether it's Google-specific or provider-agnostic (Supabase's callback handler is typically generic across providers via `exchangeCodeForSession`); if provider-agnostic, no change needed here.
5. **Production Supabase redirect URI** — Phase 1a's Azure app registration still needs a production Supabase Auth callback URI added (e.g. `https://<project>.supabase.co/auth/v1/callback`) before this works outside local dev — noted as still-needed in Phase 1a's actual-results section above.

**Verification:**
- Local: click "Continue with Microsoft" on `/signin`, confirm the Microsoft consent screen shows only `email`/`profile`/`openid` scopes (not the broad Graph file/site scopes), complete sign-in with a personal Microsoft account, confirm redirect to `/auth/callback` and a working session — same end state as Google sign-in.
- Confirm a new Supabase `auth.users` row is created with `email` populated correctly (this was the specific risk flagged in Phase 1a step 5 — Supabase requires email and doesn't request it by default).
- Test with both a personal Microsoft account and a work/school account, matching the multitenant app registration.
- Confirm existing Google/OTP sign-in still works unmodified (regression check).

**Status: ✅ Done (2026-07-23, code + local manual test).**

- Implemented exactly as scoped: `signInWithMicrosoft` in `auth-context.tsx`, `microsoft` branch (explicit `else if`, avoiding the OTP-fallthrough risk flagged in the pre-implementation regression review) in `use-sign-in-flow.ts`, sibling button in `signin-view.tsx`. `tsc --noEmit` clean across the whole project — zero type errors, confirming the `AuthContextType`/`method` union changes have no ripple elsewhere.
- **Local manual test passed**, using `deepak@firmaone.com` (a Global Administrator on the "Default Directory" tenant from Phase 1a). Consent screen showed exactly two permission groups — "View your basic profile" and "Maintain access to data you have given it access to" (the `offline_access` refresh-token permission, explicitly described as granting no additional access) — confirming `Files.ReadWrite.All`/`Sites.ReadWrite.All` are correctly excluded from the sign-in scope request. Completed OAuth round-trip, redirected through `/auth/callback`, landed in a working authenticated session.
- **One retry needed**: first attempt hit `error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired` — caused by pausing on the consent screen too long (reviewing/discussing it) before clicking Accept, not a bug. Supabase's OAuth `state` token has a short TTL; a prompt retry succeeded immediately. **Note for future testing**: don't linger on the Microsoft consent screen mid-flow.
- **Admin-consent checkbox confirmed tenant/role-gated, not shown to most real users**: researched and confirmed via Microsoft Learn — "Consent on behalf of your organization" only renders for users holding Privileged Role Administrator (or higher, e.g. Global Administrator) in a work/school tenant; it never appears for non-admin work/school users or personal Microsoft accounts (personal accounts hold no tenant role at all). It appeared in testing only because the test account is the tenant's Global Admin — expected, not a design issue.
- **Not yet tested**: work/school account sign-in (only personal-tenant-admin account tested so far), and the production Supabase redirect URI is still not registered in Azure (still open, noted above) — production sign-in won't work until that's added.
- **Not yet verified**: whether the new Supabase `auth.users` row has `email` populated correctly — recommend checking Supabase Studio (`http://127.0.0.1:54323`) before considering this fully closed.

**Regression risk:** Low — new function/button additions; the only shared-surface edit is `signin-view.tsx`'s JSX (adding a sibling button, not modifying Google's), and `use-sign-in-flow.ts`'s `method` type widening (existing `'google'`/`'otp'` branches untouched).

### Phase 1b — Microsoft Graph OAuth code
- New env vars: `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (+ tenant config)
- New routes mirroring `app/api/connectors/google-drive/{route,callback}.ts` → `app/api/connectors/onedrive/{route,callback}.ts`
- OAuth against Microsoft identity platform (`login.microsoftonline.com/.../oauth2/v2.0/{authorize,token}`), scopes `Files.ReadWrite.All Sites.ReadWrite.All offline_access`
- Reuse existing `Connector` model + existing AES-256-GCM token encryption (already provider-agnostic)
- **Risk/impact**: Low regression risk — entirely new routes and env vars, zero existing code path touched. Blast radius is capped at the new OAuth flow itself; a bug here blocks OneDrive connection attempts but cannot affect Google Drive users or any other part of the app.

### Phase 2 — Real adapter implementations (fill the stubs)
- `onedrive-adapter.ts`: implement `IConnectorStorageAdapter` against Microsoft Graph API (`/me/drive`, `/sites/{site-id}/drive` for SharePoint) — list/create folders, upload (simple + resumable session for large files), download, delete
- `onedrive-connector.ts`: implement `IConnectorInstance` — token refresh, `storeConnection`, `getAccessToken`
- Permission adapter: implement `IConnectorPermissionAdapter` (including Phase 0's new `grantFilePermission`/`listFilePermissions`/`deleteFile`) using Graph `/permissions` and `/invite` endpoints
- Content adapter: implement Phase 0's new `IConnectorContentAdapter` against Graph (`createUploadSession`, `?format=pdf` content conversion, etc.)
- Migration adapter: Graph supports server-side move (`PATCH` with new `parentReference`), so `IConnectorMigrationAdapter` is fully implementable
- **Risk/impact**: Low regression risk to existing users — these are new files/methods replacing `NOT_IMPLEMENTED` stubs, and `registry.ts` already branches by connector type so Google Drive dispatch is untouched. Primary risk is scoped entirely to OneDrive-connected firms: an incorrect Graph mapping (e.g. permission role translation, folder-move semantics) could silently grant wrong access levels or lose files during a workspace migration for those firms specifically.

### Phase 5 — UI
- Flip `enabled: false → true` for OneDrive in `registry.ts` connector meta
- Add `onedrive-icon.tsx` / `sharepoint-icon.tsx` components
- Build `onedrive-connector-tab.tsx` (mirrors `google-drive-connector-tab.tsx`)
- File picker: Graph has no drop-in JS picker like Google's; likely build a lightweight folder browser or use OneDrive Picker SDK
- **Risk/impact**: Low regression risk — new components plus one config flip; `connectors/page.tsx`'s tab list is already data-driven per the prior abstraction phase, so enabling OneDrive shouldn't require touching the Google Drive tab's rendering path. Impact of a bug is a broken OneDrive connect/picker UI, visible only to users who click into the OneDrive tab.

### Phase 3 — SharePoint site selection
- SharePoint isn't just "OneDrive for teams" — needs a site-picker step (Graph `/sites?search=`) analogous to Google's Shared Drive picker in `google-drive-workspace-root.tsx`
- Store chosen site id in the already-generic `workspaceRootSharedStorageId`/`workspaceRootSharedStorageName` fields (no schema change needed)
- **Risk/impact**: Low-Medium regression risk — no schema migration, but this is the first non-Google write path into fields that have only ever held Google Shared Drive ids in production. Any implicit Google-only assumption left in code that reads those fields (UI labels, `workspaceRootLocation` derivation logic) would surface here first. Impact is contained to OneDrive/SharePoint-connected firms; a wrong site selection risks pointing document sync at the wrong SharePoint site (potential cross-site data exposure within that firm's own tenant, not cross-firm).

### Phase 6 — Testing
- Mirror existing adapter test suites (`google-drive-adapter.test.ts` pattern) for OneDrive
- Migration/permission/content adapter tests
- **Risk/impact**: No regression risk — test-only changes, no production code paths modified. This phase's value is risk *reduction*: it's the safety net that should catch Phase 2/3 defects before they reach a real OneDrive-connected firm.

---

# Phase 0: Abstract Document-Lifecycle Drive Coupling

## Context

Before OneDrive/SharePoint storage can be added, every code path that touches Drive must go through the provider adapter abstraction — otherwise OneDrive support would only cover folder structure (Pockett) and miss real user-facing features. An audit found three areas that bypass the abstraction:

1. **Document preview** — raw Drive fetches for metadata, shortcut/stub resolution, and PDF export
2. **Support ticket attachments** — raw Drive fetches for upload/resumable-upload/delete/download
3. **Sharing regrant** — raw `GoogleDriveConnector` calls for per-file permission grant/list/revoke, PDF export, and content overwrite

A fourth area, **activity/badge computation** (`driveactivity.query`, risk/stale/sensitive badges), is **explicitly deferred** — Microsoft Graph has no 1:1 equivalent API, and abstracting it now would be speculative. It stays hardcoded to `GoogleDriveConnector` and is out of scope here.

This phase does **not** implement OneDrive/Graph logic. It only extends the interfaces and refactors the Google side to route through them, so a future OneDrive adapter can implement the same surface. Google Drive behavior must remain byte-for-byte identical after this refactor — it is a pure abstraction pass, not a feature change.

## Decisions

- **Role vocabulary rename**: `IConnectorPermissionAdapter`'s `'reader' | 'writer' | 'commenter'` → generic `'viewer' | 'editor' | 'commenter'`. Blast radius is small — confirmed via grep, only 3 real call sites:
  - `lib/grant-engagement-drive-folder-access.ts:47`
  - `lib/inngest/functions.ts:1046`
  - `lib/connectors/adapters/google-drive-permission-adapter.ts:13-14` (pass-through wrapper, maps generic role → Drive's `role` string for `GoogleDriveConnector.grantFolderPermission`)
  - Plus the interface declaration (`types.ts:116`) and `GoogleDriveConnector.grantFolderPermission`/`downgradeFolderUserPermissionToReader` signatures (`google-drive-connector.ts:3178`, `:3230`).
- **Activity/badges**: out of scope, untouched.
- **Google-only quirks with no Graph equivalent** (`.gdoc`/`.gsheet`/`.gslides` stub-file resolution, Drive shortcut `targetId` indirection): kept entirely inside the Google adapter implementation, invisible to the interface. The interface exposes only the *outcome* (resolved renderable content), not the resolution mechanism.

## New interface surface

Add to `frontend/lib/connectors/types.ts`. Two additions to `IConnectorPermissionAdapter` (per-file, not per-folder, permission ops — the existing methods are folder-oriented) and a new `IConnectorContentAdapter` for content mutation/export operations that don't belong on the folder-structure-oriented `IConnectorStorageAdapter`.

```typescript
// --- IConnectorPermissionAdapter additions ---
// Generic role vocabulary (renamed from Drive-specific 'reader'|'writer'|'commenter')
export type ConnectorRole = 'viewer' | 'editor' | 'commenter'

grantFolderPermission(connectionId: string, folderId: string, email: string, role: ConnectorRole): Promise<string | null>  // signature updated in place
downgradeFolderUserPermissionToReader(...) // unchanged signature, consider renaming to downgradeFolderUserPermissionToViewer in same pass since it's role-vocabulary-adjacent

grantFilePermission(connectionId: string, fileId: string, email: string, role: ConnectorRole, opts?: { notify?: boolean }): Promise<string | null>
listFilePermissions(connectionId: string, fileId: string): Promise<Array<{ id: string; email: string | null; role: ConnectorRole }>>
deleteFile(connectionId: string, fileId: string, opts?: { permanent?: boolean }): Promise<void>  // supersedes trashFile; permanent:true = hard delete (support attachments), false/omitted = trash (existing trashFile behavior)

// --- New: IConnectorContentAdapter (file-content lifecycle, separate from folder-structure-oriented IConnectorStorageAdapter) ---
export interface IConnectorContentAdapter {
  /** Create a new file with binary content in a folder, returning its id. Supersedes writeFileBinary for callers that need the id back. */
  createFile(connectionId: string, folderId: string, fileName: string, content: Buffer, mimeType: string): Promise<{ id: string }>

  /** Overwrite an existing file's content in place. */
  overwriteFileContent(connectionId: string, fileId: string, content: Buffer, mimeType?: string): Promise<void>

  /** Begin a resumable/chunked upload session for large files. Returns an opaque session handle + upload URL. */
  createUploadSession(connectionId: string, folderId: string, fileName: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; sessionId: string }>

  /**
   * Get renderable content for a file: either its native bytes or a PDF export.
   * Hides all provider-specific resolution (Drive shortcuts, .gdoc/.gsheet stubs, Workspace-mimetype export links,
   * copy-convert-export dance) behind one call. Google-only quirks live entirely inside the Google implementation.
   */
  getRenderableContent(connectionId: string, fileId: string, format: 'native' | 'pdf'): Promise<{ stream: ReadableStream | Buffer; mimeType: string; fileName: string; size?: number }>

  /**
   * Toggle copy/download restriction on a file, if the provider supports it.
   * No-op (resolve silently) for providers without an equivalent concept.
   */
  setCopyRestricted(connectionId: string, fileId: string, restricted: boolean): Promise<void>
}
```

**Design notes:**
- `getRenderableContent` unifies today's two divergent conversion paths (preview route's `exportLinks`/`exportFileToPdf` → PDF, and support download's `downloadFile` → Office-format export) into one method with a `format` parameter. The Google implementation internally still branches on Workspace mimetypes; callers no longer need to know that.
- `createUploadSession` models Drive's resumable-upload flow abstractly enough to also fit Graph's `createUploadSession` (PUT chunks) later, without committing to identical wire semantics now.
- `deleteFile` replaces `trashFile` in the permission adapter with an explicit `permanent` flag, covering both today's soft-delete (existing engagement document trash) and hard-delete (support attachments) call sites. `trashFile` callers migrate to `deleteFile(..., { permanent: false })`.
- `IConnectorContentAdapter` is deliberately separate from `IConnectorPermissionAdapter` and `IConnectorStorageAdapter` — content mutation/export is a distinct concern from folder structure and sharing. Registry gets a new `getContentAdapter(connectionId)` accessor, following the exact pattern of `getPermissionAdapter`/`getStorageAdapter` in `lib/connectors/registry.ts`.
- The regrant route's "share PDF only" branch (creates a sibling PDF file, grants permission on it) is **not** re-architected in this phase — it's refactored to call `createFile` + `grantFilePermission` instead of raw Drive calls, but the sibling-file *pattern* itself is preserved as-is to keep behavior identical. Revisiting whether Graph's direct `?format=pdf` conversion makes the sibling-file pattern unnecessary is future OneDrive-phase work, not this phase.

## Migration sequence

Refactor in increasing order of regression risk, each as its own PR gated by the listed verification:

### Step 1 — Interface + registry additions (no behavior change) — ✅ Done
- Add `ConnectorRole`, `grantFilePermission`, `listFilePermissions`, `deleteFile` to `IConnectorPermissionAdapter` in `types.ts`
- Add new `IConnectorContentAdapter` to `types.ts`
- Add `getContentAdapter(connectionId)` to `registry.ts`
- Implement all new methods in `google-drive-permission-adapter.ts` (permission additions) and a new `google-drive-content-adapter.ts` (content adapter) — both as thin wrappers delegating to existing `GoogleDriveConnector` methods (`grantFilePermission` → `google-drive-connector.ts:3271`, `listFilePermissions` → `:3089`, `exportFileToPdf` → `:3983`, `overwriteFileContent` → `:4130`, `uploadNewFile` → `:4078`, `getResumableUploadUrl` → `:963`)
- Rename role vocabulary at the 3 call sites identified above + interface + `GoogleDriveConnector` signatures
- No route/UI changes yet. Verify: `tsc --noEmit`, existing `google-drive-permission-adapter.test.ts` pattern extended with new method tests.
- **Regression risk: None** — purely additive interface/adapter code, no existing call site's runtime behavior changed (only the 3 role-string call sites were touched, and those are type-level renames with identical semantics). Verified via `tsc --noEmit` (clean) and full test suite (54/54 passing, 7 new).
- **Impact if it breaks**: None — nothing yet reads these new methods; a defect here would only surface as a type error or unit test failure, not a runtime issue for any user.

### Step 2 — Support ticket attachments — ✅ Done (code)
- `upload-attachment/route.ts`: replace raw `POST .../files` + `PATCH .../upload/...` with `contentAdapter.createFile(...)`
- `prepare-upload/route.ts`: replace `googleDriveConnector.getResumableUploadUrl` with `contentAdapter.createUploadSession(...)`
- `attachments/[driveFileId]/delete/route.ts`: replace raw `DELETE` with `permissionAdapter.deleteFile(connectorId, id, { permanent: true })`
- `attachments/[driveFileId]/download/route.ts`: replace `googleDriveConnector.downloadFile` with `contentAdapter.getRenderableContent(connectorId, id, 'native')`
- Leave `driveFileId` naming in `CustomerRequest.attachments` JSON and the `[driveFileId]` route segment as-is — it's a JSON column (no schema migration needed) and a route param name; renaming is cosmetic and not required for OneDrive to work. Note it as a known naming inconsistency, don't fix it in this phase.
- Verify: upload/delete/download a support ticket attachment end-to-end in the running app; confirm stored `driveFileId` still resolves.
- **Regression risk: Low** — narrow, non-critical-path feature (internal support ticketing, not client-facing document workflows); small number of call sites, each swapping one raw fetch for one adapter call with an equivalent existing `GoogleDriveConnector` method underneath (no new logic introduced).
- **Impact if it breaks**: Support agents/users can't attach or retrieve files on a ticket. Annoying but does not touch engagement documents, client data, or sharing — fully isolated to the support subsystem.

### Step 3 — Document preview — ✅ Done (code)
- Replace all raw fetches in `preview/route.ts` with `contentAdapter.getRenderableContent(connectorId, resolvedId, format)`, where `format` is `'pdf'` for the existing PDF-preview path and `'native'` for raw download
- Google's implementation of `getRenderableContent` internally keeps the shortcut-resolution and `.gdoc`/`.gsheet` stub-detection logic exactly as it exists today in the route — just moved into `google-drive-content-adapter.ts` (or kept in `GoogleDriveConnector` and called from the adapter) rather than inline in the route handler
- Verify: preview a native Google Doc, a Google Sheet, an uploaded Office file, a shortcut, and a `.gdoc` stub file — all five cases must render identically to current behavior
- **Regression risk: Medium** — user-facing and frequently used (every document preview goes through this route); the route currently branches on five distinct cases (native Workspace doc, uploaded Office file needing PDF conversion, Drive shortcut, `.gdoc`/`.gsheet` stub, already-PDF), all of which must be preserved exactly when moved behind `getRenderableContent`. Highest chance of an edge case slipping through of any step except Step 4.
- **Impact if it breaks**: Every user in the app loses the ability to preview one or more document types inline — a highly visible, daily-use feature. Files remain safely stored in Drive (no data loss), but the app becomes noticeably degraded until fixed.

### Step 4 — Sharing regrant — ✅ Done (code)
- `sharing/regrant/route.ts`: replace direct `GoogleDriveConnector.getInstance()` calls with adapter calls:
  - `drive.revokePermission` → `permissionAdapter.revokePermission`
  - `drive.exportFileToPdf` → `contentAdapter.getRenderableContent(..., 'pdf')`
  - `drive.overwriteFileContent` → `contentAdapter.overwriteFileContent`
  - `drive.getFileMetadata` → `permissionAdapter.getFileMetadata` (already returns `ConnectorFileMetadata` — confirm no field the route needs is missing; extend `ConnectorFileMetadata` if so)
  - `drive.uploadNewFile` → `contentAdapter.createFile`
  - `drive.grantFilePermission` → `permissionAdapter.grantFilePermission`
  - `drive.listFilePermissions` → `permissionAdapter.listFilePermissions`
  - `patchFileProperties`/`copyRequiresWriterPermission` → `permissionAdapter.setCopyRestricted` (Google implementation maps to the existing Drive property call; behavior unchanged)
- The Drive-specific notification UX (`sendNotificationEmail`, `emailMessage`, the hardcoded "Google Drive requires a one-time email verification" message at regrant route ~L150) stays as Google-specific copy/params inside the Google permission adapter implementation — not exposed on the interface. Update the user-facing message only if it becomes provider-conditional later; leave as-is now.
- Verify: full regrant flow for both "share original" and "share PDF only" branches, confirm permission emails still send, confirm revoke still works, confirm copy-restriction toggle still applies.
- **Regression risk: Highest of the four steps** — touches live permission grants directly; 8 distinct Drive calls are being swapped in one route, including the copy-restriction toggle and the "share PDF only" branch's create-sibling-file-then-grant sequence, so there's more surface for a subtle behavioral mismatch than any other step.
- **Impact if it breaks**: The most severe of the four — a defect here could over-grant access (a security/confidentiality incident: an external collaborator or guest sees a file they shouldn't) or under-grant/fail-silently (a client-facing share appears to succeed but the recipient can't actually open the file, undermining trust in the sharing feature). Because this is the highest-impact step, it should be the last one shipped and get the most thorough manual verification pass before merge.

## Files touched (representative, not exhaustive per step)

- `frontend/lib/connectors/types.ts` — interface additions
- `frontend/lib/connectors/registry.ts` — `getContentAdapter` accessor
- `frontend/lib/connectors/adapters/google-drive-permission-adapter.ts` — new method implementations
- `frontend/lib/connectors/adapters/google-drive-content-adapter.ts` — new file
- `frontend/lib/grant-engagement-drive-folder-access.ts`, `frontend/lib/inngest/functions.ts` — role-name-only edits (call sites already use the adapter)
- `frontend/app/api/support/requests/[ticketNumber]/upload-attachment/route.ts`
- `frontend/app/api/support/attachments/prepare-upload/route.ts`
- `frontend/app/api/support/requests/[ticketNumber]/attachments/[driveFileId]/{delete,download}/route.ts`
- `frontend/app/api/projects/[projectId]/documents/[documentId]/preview/route.ts`
- `frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/regrant/route.ts`

## Implementation deviations from the original interface sketch

Two additions emerged during implementation that weren't in the original design and are worth recording:

- **`ConnectorContentError`** (new exported class in `types.ts`) — `IConnectorContentAdapter` methods throw this with a `code: 'not_found' | 'forbidden' | 'unsupported'` so route handlers can map failures to specific HTTP responses without inspecting provider-specific error shapes. Needed once it became clear the preview route's granular 404/403/"unsupported" responses had to be preserved exactly.
- **`getPreviewableContent`** (new method on `IConnectorContentAdapter`, separate from `getRenderableContent`) — the preview route's format selection isn't a literal "give me native or give me PDF" choice; it dynamically picks raw-bytes-passthrough (PDF/image) vs PDF-conversion (Office/Workspace docs) based on mimetype, on top of resolving shortcuts/stubs first. Reusing `getRenderableContent(format: 'pdf')` for this would have overloaded what `'pdf'` means (Step 4's regrant flow uses it to mean "always force-convert," a different intent). Kept as a separate method so each interface method's contract stays literal.

## Verification (end-to-end, after all 4 steps)

1. `tsc --noEmit` clean after each step — ✅ verified, clean throughout
2. Existing tests: `frontend/lib/connectors/registry.test.ts`, `google-drive-adapter.test.ts`, `google-drive-permission-adapter.test.ts`, `google-drive-content-adapter.test.ts` — ✅ 85/85 passing (extended with new-method coverage per step)
3. **Manual pass in the running app — not yet done, recommended before merge:** support attachment upload/download/delete, document preview across all format branches (native doc, sheet, office file, shortcut, `.gdoc` stub), full sharing regrant flow including PDF-only sharing and watermarking
4. Confirm no remaining direct `googleapis.com` fetches or `GoogleDriveConnector.getInstance()` calls in the four target route files — ✅ verified via grep, zero matches in all four routes; badges/activity code in `google-drive-connector.ts` remains untouched as intended
