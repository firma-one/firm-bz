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

### 3. vercel.json — Add Rewrite Rule

```json
"rewrites": [
  {
    "source": "/",
    "destination": "/d",
    "has": [{ "type": "host", "value": "datasentry.firma.bz" }]
  }
]
```

- `source: "/"` — matches the root of the subdomain
- `destination: "/d"` — internal path served (same Vercel project, so external URLs are not needed)
- `has: host` — scopes the rule to only this subdomain; other traffic is unaffected

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
| Next.js app code | No code changes required; rewrite is handled entirely at the Vercel routing layer. |

---

## Adding a New Client Subdomain

To onboard a new client subdomain:

1. Add CNAME record in Hostinger (same `cname.vercel-dns.com` target)
2. Add domain in Vercel dashboard
3. Add a new rewrite rule in `vercel.json` scoped to the new host
4. Add the new subdomain to Google Cloud Console (JS origins) and Supabase redirect URLs
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
