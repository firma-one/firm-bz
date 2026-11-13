# Custom domains for a Firm Group

Status: built 2026-11-13 (mock and Option C approved by Deepak); not committed. Docs: docs/mvp/hld-custom-dns.md.

## Goal

A Firm Group's admin requests a branded address for the workspace. Firma checks it is free, a System
Admin maps it on Vercel by hand and approves it in `/system`. From then on the app lands on that
workspace there, and every email link for that workspace uses it. The plan tier on `/pricing` decides
who may request one.

This replaces the hard-coded `CLIENT_SUBDOMAINS` list in `proxy.ts`, and fixes emails sending people
from their branded host to `www.firma.bz`, where they are signed out (cookies belong to one host).

## What exists today

- Live hosts on Vercel (`firma-bz`): `www.firma.bz`, `firma.bz` → www, `preview.firma.bz` (dev),
  `app.firma.bz` (neutral, stays as is), `datasentry`, `keithmeyer`, `scarbluu` `.firma.bz`.
- `proxy.ts` rewrites `/` to `/d` for the hard-coded list. No host is tied to a Group. The manual steps
  are in `docs/mvp/hld-custom-dns.md`.
- Plans belong to the Group (`Subscription.groupId`, `Subscription.plan`). `config/pricing.ts`
  `PRICING_COMPARISON` already has "Custom subdomain" (Pro, Business, Enterprise) and
  "Custom DNS domain" (Enterprise).
- Email links get their host from `NEXT_PUBLIC_APP_URL` in `buildAbsoluteUrl` (`lib/notify-event.ts`),
  inline in `lib/reminders/reminder-service.ts:339` and `lib/inngest/functions.ts` (~1464, ~1733,
  ~1914), and invite links in `invitations.ts`, `firm-members.ts`, `client-members.ts`,
  `engagement-membership.ts:294`.

## Design

### Two kinds of address

| Kind | Example | Plan (from `/pricing`) | Manual steps for the System Admin |
|---|---|---|---|
| Subdomain | `acme.firma.bz` | Pro and up ("Custom subdomain") | Hostinger CNAME, Vercel domain, Google OAuth origin |
| Own domain | `portal.acme.com` | Enterprise ("Custom DNS domain") | Customer adds the CNAME; Vercel domain, Google OAuth origin, Supabase redirect URL |

The gate reads `PRICING_COMPARISON` by feature name, so `/pricing` stays the one source. Gating follows
`ENFORCE_BILLING_GATES` like the other plan limits: with gates off, anyone may request; the System Admin
still approves.

### Data: `GroupDomain` (new table, one migration, `--create-only`)

`id, groupId, host (unique, lowercase), kind SUBDOMAIN | CUSTOM,
status REQUESTED | APPROVED | REJECTED | REMOVED, requestedBy, requestedAt, reviewedBy, reviewedAt,
reviewNote`. At most one REQUESTED or APPROVED row per Group (partial unique index). Rejected and
removed rows stay as history.

### Requesting (Group admin, `GROUP_ADMIN` only)

1. Enter a subdomain label (`acme`) or, on Enterprise, a full host.
2. **Check availability** as they type: valid DNS label, not reserved (`www`, `app`, `preview`, `api`,
   `admin`, `mail`, `help`, `docs`, `status`, `blog`, `support`, `auth`, …), not held by another
   Group's REQUESTED or APPROVED row, not an existing Vercel host.
3. **Request**: a REQUESTED row; System Admins get an email and a count on `/system`.
4. While waiting: "Requested · waiting for approval", with Cancel. After a decision the Group admin gets
   an email; Rejected shows the admin's note and allows a new request.
5. Approved: shows the address, with Remove (which takes effect at once and frees the name).

### Approving (`/system/custom-domains`, new page)

A list of requests: group, address, kind, plan, who asked, when. Each pending one shows the manual
checklist for its kind (copy-ready CNAME values), then **Approve** or **Reject** with a note. A System
Admin can also add an approved address for a Group directly, which is how the three existing
subdomains get assigned after deploy. No data migration.

### Routing (`proxy.ts`), dynamic

- On any host that isn't a main host (`www`, apex, `preview`, localhost, `*.vercel.app`), `/` goes to
  `/d?entry=auth`, which already resolves the person's workspace on the server. No database lookup in
  the proxy, so no cache to keep in step.
- Remove the `CLIENT_SUBDOMAINS` list. The three existing subdomains keep working before and after they
  are assigned.

### Email links

`appLink(path, { groupId | firmId | engagementId })` in `lib/navigation/app-link.ts`, server only.
It returns the Group's approved host, else `NEXT_PUBLIC_APP_URL`, and uses the branded host only when
`VERCEL_ENV === 'production'`. Every builder above switches to it; `buildAbsoluteUrl` and the inline
copies go. Platform links stay on www: support replies, system-admin sign-up, waitlist and referrals,
the billing portal, the Google Drive OAuth callback.

### Sign-in

One session per host, as today. People sign in on their workspace's address and every link brings them
back there. A shared `.firma.bz` cookie isn't needed, and couldn't cover own domains anyway.

## Sign-in hand-off (Option C): impact review, 2026-11-13

Proposed: after sign-in on `www`, if the person lands in a workspace with an approved domain, the
server hands the session over to that domain with a one-time ticket, and the browser continues there.

### How sign-in works today (the hook points)

- Email code: `use-sign-in-flow.ts` → `window.location.href = '/d?entry=auth'` → `(landing)/page.tsx`
  runs `resolveDefaultFirmLandingPath` on the server and redirects into the firm.
- Google or Microsoft: `/auth/callback` exchanges the code, then runs `resolveDefaultFirmLandingPath`.
- Both already resolve the landing workspace on the server, so the hand-off is one branch in each,
  with no extra client logic.

### Hand-off design, hardened

1. Only from a main host (`www` or apex) to an approved domain. Never branded to branded, never on the
   target host itself: no loops, no ping-pong for people in two branded workspaces.
2. Only when the landing is a single workspace. The workspace picker (two or more workspaces) stays on www.
3. The server calls `admin.generateLink({ type: 'magiclink' })` (no email is sent; the app already uses
   `generateLink` in `lib/actions/system-admin-signup.ts`), keeps its `hashed_token` in a
   `SignInHandoff` row (random id, 60-second expiry, single use) and redirects to
   `https://<domain>/auth/handoff?t=<id>&next=<path>`. The Supabase token itself never appears in a URL,
   history or logs.
4. `/auth/handoff` deletes the row, calls `verifyOtp({ token_hash, type: 'magiclink' })` on that host,
   which sets that host's cookie, and redirects to `next` (a path only). `Referrer-Policy: no-referrer`.
5. Best effort: any failure (Supabase error, expired or used ticket, domain unreachable) continues on
   `www`, where the person is still signed in. A hand-off can never stop someone signing in.

### Impact by area

**Sign-in**
- Added time, branded workspaces only: about 0.4–0.8 s (`generateLink` and a ticket insert on www, a
  redirect to a new origin with fresh DNS and TLS, ticket lookup and `verifyOtp` on the target).
- First visit to a domain on a device: the browser has no cached JS or CSS for that origin and downloads
  the app bundle once from Vercel's CDN. Later sign-ins hit the cache.
- Supabase calls per sign-in go from 1 to 3. Supabase limits token verifications per IP (configurable
  in the dashboard); an office behind one IP signing in together uses two per person. Not a concern at
  today's scale; watch it for large firms.
- Unchanged for workspaces without a domain, for multi-workspace people, and for sign-in on the branded
  host directly (no hand-off needed there).

**In-app navigation**
- No change. Links are paths and the client router never leaves the host.
- The proxy needs no database lookup: on a branded host, `/` goes to `/d?entry=auth`, which already
  resolves the workspace. The hard-coded list becomes "any host that isn't main", so the proxy stays
  as fast as today (it already calls Supabase `getUser` and up to two internal fetches per `/d` request).
- Switching to another workspace while on `acme.firma.bz` stays on that host, showing a different
  workspace under Acme's address. Cosmetic, not a performance issue; scoping a host to its workspace
  is listed under Later.

**Email links**
- Signed in on the branded host (everyone the hand-off moved there): the link opens directly. Same speed
  as today, and better than today's jump to www, which signs branded users out.
- Not signed in there (a new device, or a multi-workspace person who stayed on www): one sign-in on that
  host, once per device. Sessions then persist.
- Google sign-in on an own domain needs that domain in Google Cloud Console and in Supabase's redirect
  URLs. A missed step breaks Google sign-in there, so it is on the approval checklist.

**Sessions and sign-out**
- Each hand-off adds a second session (one per host). The `www` one stays alive so the Drive connect
  flow and workspaces without a domain keep working.
- Sign-out on either host should end both. The ticket records the originating session, so the server
  can delete both `auth.sessions` rows (`lib/auth/sessions.ts`, not `admin.signOut`).
- "Sign out everyone" and removal from a firm already delete every row for the user, so they still work.

**Stability risks and guards**
- **Approved before DNS or SSL is ready** would send every member to a dead page right after sign-in.
  Guard: Approve stays disabled until a live check reaches `https://<domain>/api/health` and gets this
  deployment's id. A daily job re-checks approved domains; a failing one is marked unhealthy, which turns
  off its hand-off and email links (falling back to www) and tells System Admins.
- **Ticket replay or interception:** single use, 60 seconds, random id, no Supabase token in the URL.
- **Open redirect:** only to approved domains of a workspace the person belongs to; `next` must be a path.
- **Supabase Auth outage:** sign-in already depends on it; the hand-off falls back to www.

**Found while checking (exists today, not caused by C)**
- Connecting Google Drive from a branded host probably fails. The OAuth callback is fixed to `www`
  (Drive's registered redirect URI) and its popup posts the result to its own origin (`www`), which a
  parent window on another origin can't receive (`app/api/connectors/google-drive/callback/route.ts`,
  `popupHtml`). Not verified live. To be fixed in this project: pass the opener's origin through
  `state` (the state already has an `openerOrigin` field) and post to it if it's an approved domain.

## Order of work

1. Mock: the request card and `/system/custom-domains` (HTML, before any code).
2. Schema and migration, availability check, request, cancel and remove actions, plan gate.
3. `/system/custom-domains`: approve, reject, add directly; emails both ways.
4. Proxy lookup and cache; remove the hard-coded list.
5. `appLink` and switching every email builder.
6. Update `docs/mvp/hld-custom-dns.md`.

## Tests

Availability rules; plan gate by tier; only `GROUP_ADMIN` may request (guard test); only System Admins
approve; one live request per Group; proxy rewrite for approved, unknown and main hosts; `appLink`
branded, fallback and non-production; a guard that nothing else builds `NEXT_PUBLIC_APP_URL` + path.

## Later (not this round)

- Add the Vercel domain automatically through the Vercel API after approval.
- Check the customer's DNS automatically before Approve.
- A branded host shows only its own workspace (today it shows all of the person's workspaces).
