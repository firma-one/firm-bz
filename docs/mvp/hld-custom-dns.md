# HLD: Custom Domains for a Firm Group

## Overview

A Firm Group (workspace) can open at its own address:

| Kind | Example | Plan (from `/pricing`) |
|---|---|---|
| Firma subdomain | `acme.firma.bz` | Pro and up ("Custom subdomain") |
| Own domain | `portal.acme.com` | Enterprise ("Custom DNS domain") |

The Group admin requests it on **Billing**, Firma checks the name is free, a System Admin sets it up on
Vercel by hand and approves it at **/system/custom-domains**. From then on:

- the domain's root opens the app, keeping the address (`proxy.ts`);
- sign-in on www hands the session over to the domain (the "sign-in hand-off");
- every email and invite link for that workspace uses the domain (`appLink`).

Plan and review history: `.claude/plans/branded-host-email-links.md`. UI mock:
`.claude/plans/custom-domains-mock.html`.

This replaces the old per-subdomain setup (a Vercel dashboard rewrite plus the hard-coded
`CLIENT_SUBDOMAINS` list in `proxy.ts`). Neither is needed any more.

---

## Architecture

```
portal.acme.com ──CNAME──▶ Vercel (project firma-bz, same deployment as www)
                               │
                               ▼
                         proxy.ts: host isn't one of Firma's own
                         (lib/custom-domains/hosts.ts) → "/" rewrites to /d?entry=auth
```

- **Data:** `platform.group_domains` (`GroupDomain`): host, kind, status
  (REQUESTED · APPROVED · REJECTED · CANCELLED · REMOVED), reachability. Partial unique indexes keep one
  live row per Group and per host. Rows are never deleted.
- **Rules:** `lib/custom-domains/domain-rules.ts` (names, reserved labels, the plan gate read from
  `PRICING_COMPARISON`), `lib/custom-domains/hosts.ts` (which hosts are Firma's own).
- **Service:** `lib/custom-domains/group-domains.ts` (server only). Actions: `lib/actions/custom-domains.ts`
  (Group admin, Billing) and `lib/actions/system-custom-domains.ts` (System Admin).
- **Reachability:** `lib/custom-domains/reachability.ts` fetches `https://<domain>/api/custom-domains/health`,
  which only this app answers with `{ service: 'firma' }`. Approve requires it. An Inngest job
  (`recheck-custom-domains-daily`, 03:00 UTC) re-checks every approved domain; one that fails is marked
  unreachable, which turns off its hand-off and email links (they fall back to www), and the Group admin
  and System Admins are emailed.
- **Links:** `lib/navigation/app-link.ts` `appLink(path, scope)` is the only builder of absolute links to
  workspace pages; `platformLink` (www) is for platform pages. A guard test enforces it.
- **Production only:** branded hosts are used only when `VERCEL_ENV === 'production'`, so local and preview
  never link to production domains (`CUSTOM_DOMAINS_IN_DEV=true` overrides for testing).

### Sign-in hand-off

Sign-in cookies belong to one host. After sign-in on www, if the person lands in a workspace with an
approved, reachable domain (`/d?entry=auth` and `/auth/callback`):

1. www asks Supabase for a one-time magic-link token (`admin.generateLink`, no email sent), stores its hash
   in `platform.sign_in_handoffs` (60-second expiry, single use) and redirects to
   `https://<domain>/auth/handoff?t=<ticket id>`.
2. The domain uses the ticket, verifies the token (`verifyOtp`), which sets its own cookie, and opens the page.

Only from Firma's own hosts, only to a workspace the person belongs to, `next` is always a path. Any failure
leaves the person on www, signed in. Signing out on either host ends the linked session on the other
(`DELETE /api/auth/linked-sessions`).

### Storage connect popups

Google Drive and OneDrive OAuth callbacks stay on www (their registered redirect URIs). The popup posts its
result to the opener's origin when that origin is an approved custom domain
(`lib/custom-domains/popup-origin.ts`), so connecting storage works from a branded address.

---

## Setting up a domain (System Admin)

`/system/custom-domains` shows the checklist for each request, with copy buttons:

**Firma subdomain** (`acme.firma.bz`)
1. Hostinger → Domains → firma.bz → DNS: `CNAME acme → cname.vercel-dns.com`
2. Vercel → project firma-bz → Settings → Domains: add `acme.firma.bz` (use the CNAME value Vercel shows, if different)
3. Google Cloud Console → Firma Auth app → Authorized JavaScript origins: `https://acme.firma.bz`
4. Supabase: nothing; `https://*.firma.bz/auth/callback` already covers it.

**Own domain** (`portal.acme.com`)
1. The customer adds `CNAME portal.acme.com → cname.vercel-dns.com` at their DNS provider (Billing shows them the record).
2. Vercel: add `portal.acme.com`.
3. Google Cloud Console: authorized origin `https://portal.acme.com`.
4. Supabase → Authentication → URL Configuration → Redirect URLs: `https://portal.acme.com/auth/callback`.

Then **Check** until it reports reachable, and **Approve**. No code change and no deploy.

### Existing subdomains

`datasentry`, `keithmeyer` and `scarbluu` `.firma.bz` predate this. They keep working (any non-Firma host
opens the app). To tie each to its workspace, use **Add for a group** on `/system/custom-domains` with the
Group's slug. `app.firma.bz` stays a neutral alias, assigned to no Group.

---

## What stays on www

| Item | Why |
|---|---|
| Google Drive and OneDrive OAuth redirect URIs | Registered with Google and Microsoft; the popup result is forwarded to the opener (above). |
| Supabase Site URL | Stays `https://www.firma.bz`. |
| Platform emails and links (support replies, waitlist, referrals, billing portal, System Admin sign-up, /system) | They belong to no workspace (`platformLink`). |
