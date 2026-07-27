# HLD: Custom DNS / Client Subdomains

## Overview

Firma supports client-specific subdomains (e.g. `datasentry.firma.bz`) that rewrite to a scoped path within the main app (e.g. `/d`) while keeping the subdomain in the browser address bar.

This is implemented via Vercel rewrites — not redirects — so the URL does not change after navigation.

---

## Architecture

```
datasentry.firma.bz  →  Vercel (rewrite)  →  www.firma.bz/d
```

- DNS: CNAME in Hostinger pointing subdomain to Vercel
- Routing: Vercel rewrite rule scoped by `host` header
- No separate deployment — same Vercel project serves all subdomains

---

## Implementation Steps

### 1. Vercel — Add Domain

In the Vercel project dashboard → **Settings → Domains**, add the client subdomain (e.g. `datasentry.firma.bz`). Vercel provides a CNAME target.

### 2. Hostinger — Add DNS Record

In Hostinger → **Domains → firma.bz → DNS**:

| Type  | Name        | Value                  | TTL  |
|-------|-------------|------------------------|------|
| CNAME | datasentry  | cname.vercel-dns.com   | 3600 |

### 3. Rewrite the subdomain root to `/d`

Two things are needed here, not one — a routing-layer rewrite AND an app-code change:

**3a. Vercel rewrite rule.** There is no `vercel.json` in this repo — this rule is configured directly in the Vercel dashboard (Settings → Rewrites), not checked into git. Scope it by `host`:
```json
{
  "source": "/",
  "destination": "/d",
  "has": [{ "type": "host", "value": "datasentry.firma.bz" }]
}
```

**3b. `frontend/proxy.ts` — add the subdomain to `CLIENT_SUBDOMAINS`.** This *is* checked into git and *is* a required code change (see "What Does NOT Need Changing" below — a prior version of this doc incorrectly claimed no code change was needed):
```ts
const CLIENT_SUBDOMAINS = ['app.firma.bz', 'datasentry.firma.bz', 'keithmeyer.firma.bz', 'scarbluu.firma.bz']
```
This list gates both the `/` → `/d` rewrite and the unauthenticated → `/signin?redirect=/d` bounce for that host (`frontend/proxy.ts`, search `CLIENT_SUBDOMAINS`). A subdomain added only in Vercel/DNS but missing here will resolve and load the app shell, but won't get the subdomain-specific auth-redirect/rewrite behavior this middleware provides.

### 4. Google Cloud Console — Firma Auth App

Add to **Authorized JavaScript Origins**:
```
https://datasentry.firma.bz
```

Required because the browser is on the subdomain when the auth flow initiates.

### 5. Supabase — Auth URL Configuration

In Supabase dashboard → **Authentication → URL Configuration → Redirect URLs**, add:
```
https://datasentry.firma.bz/auth/callback
```

Required for magic link / email auth to redirect back to the correct domain. Do not change the Site URL — it stays as `https://www.firma.bz`.

> Tip: use `https://*.firma.bz/auth/callback` as a single wildcard entry to cover all future client subdomains at once.

---

## What Does NOT Need Changing

| Item | Reason |
|---|---|
| Google Cloud Console — GDrive app redirect URI | `NEXT_PUBLIC_APP_URL=https://www.firma.bz` is always set, so `getAppUrl()` always returns `www.firma.bz` regardless of the browser's current host. GDrive OAuth callback always goes to `www.firma.bz/api/connectors/google-drive/callback`. |
| Vercel environment variables | `NEXT_PUBLIC_APP_URL` stays as `www.firma.bz`; no per-client env var needed. |
| Supabase redirect URL entries per-subdomain | Covered by the existing `https://*.firma.bz/auth/callback` wildcard — no per-subdomain entry needed. |

**Correction (2026-07-27):** this section previously also listed "Next.js app code — no changes required." That was wrong on two counts, both since fixed:
- `frontend/proxy.ts`'s `CLIENT_SUBDOMAINS` array **is** a required code change per new subdomain — see step 3b above. Without it, the subdomain loads the app shell but doesn't get the `/` → `/d` auth-aware rewrite.
- Separately, `frontend/lib/auth-context.tsx`'s `signInWithGoogle`/`signInWithMicrosoft` had a latent bug where the OAuth `redirectTo` was hardcoded to `www.firma.bz` instead of the browser's actual current host, breaking Google/Microsoft sign-in with `AuthPKCECodeVerifierMissingError` on any client subdomain (the PKCE `code_verifier` cookie is host-scoped, so a mismatched redirect origin means the callback never finds it). Fixed to always use `getOAuthRedirectOrigin()` (current origin). This was unrelated to onboarding a *new* subdomain — it affected all existing client subdomains — but is documented here since it's part of the same subdomain-auth surface.

---

## Adding a New Client Subdomain

To onboard a new client subdomain:

1. Add CNAME record in Hostinger (same `cname.vercel-dns.com` target)
2. Add domain in Vercel dashboard
3. Add a rewrite rule for the host in the Vercel dashboard (Settings → Rewrites — not `vercel.json`, which doesn't exist in this repo), **and** add the subdomain to `CLIENT_SUBDOMAINS` in `frontend/proxy.ts`
4. Add the new subdomain to Google Cloud Console (Authorized JavaScript Origins, Firma Auth app) — Supabase needs no per-subdomain change, already covered by the `https://*.firma.bz/auth/callback` wildcard
5. Deploy

---

## Example: datasentry.firma.bz

| Item | Value |
|---|---|
| Subdomain | `datasentry.firma.bz` |
| Destination path | `/d` |
| Client | DataSentry |
| Google origin added | `https://datasentry.firma.bz` |
| Supabase redirect added | `https://datasentry.firma.bz` |
