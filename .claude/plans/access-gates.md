# Mandatory access gates — server actions, API routes, UI

**Status:** plan only, 2026-10-15. No code changes yet.

**Question (Deepak):** "Can UI components not have a base component in the library, such that it
makes the ACCESS control a mandatory attribute so components never are used without knowing who
can see it & who cannot?"

**Short answer:** yes, but the mandatory attribute has to start on the server.
- Hiding a button is a convenience, not access control.
- Every gap fixed in this branch had the UI hiding the control correctly while the endpoint behind
  it checked nothing. Examples: `inviteMember`, `updateMemberPersona`, `removeMember`, the wiki
  actions, the client connector actions.
- A required prop on UI components would have caught none of them.

So the plan makes an access rule mandatory in three places, in this order:
1. **Every server action and API route** declares who may call it. A test fails the build when one
   doesn't.
2. **Every UI control that changes something** declares which action it triggers, using the same
   key the server enforces. TypeScript makes the prop required, so the UI cannot drift from the
   server.
3. **Pages and tabs** read visibility from one capability context instead of hand-passed
   `canManage` booleans (23 call sites today).

**Not every component.** Labels, layout, tags and read-only text don't need a rule.
- A prop required everywhere turns into `access="public"` written on autopilot.
- That makes the attribute meaningless exactly where it matters.

---

## 1. Server: one wrapper, enforced by a test

### Today
- **Server actions:** 136 exports across 43 `'use server'` files.
- **API routes:** 180 HTTP handlers across 146 `route.ts` files.
- **How checks happen:** each one does its own check, or doesn't. The helpers exist — in
  `lib/permission-helpers.ts`, `lib/api/engagement-auth.ts` (`requireProjectView`, `requireProjectEdit`,
  `requireProjectManage`) and `requireEngagementManager` — but nothing requires anyone to use
  them.
- **Engagement routes:** only 7 of the 43 `app/api/projects/**` routes use `engagement-auth.ts`.
- **Middleware:** `proxy.ts` admin-gates `/system` *pages* only. Every `/api/*` route, including
  `/api/system/*`, has to protect itself.

### Shape
A server-only module, `lib/server/access.ts`, holds the wrapper. Every export of a `'use server'`
file becomes `export const x = gated(rule, handler)`. Example:

```ts
// lib/actions/members.ts
'use server'
import { gated, can } from '@/lib/server/access'
import { byMember } from '@/lib/server/scope'

export const removeMember = gated(
    can.manageEngagement(byMember),            // memberId → its engagement, then project:can_manage
    async ({ user, engagement }, memberId: string) => {
        // user and engagement are resolved and authorized; there is no userId parameter
    },
)
```

**`gated(rule, handler)`:**
- Reads the session itself, so a caller can never pass an identity.
- Runs the rule, then calls the handler with `{ user, …scope }` plus the caller's arguments.
- Normalizes failures to `Unauthorized` (signed out) or `Forbidden` (signed in, no rights). It can
  write an `ACCESS_DENIED` audit event.
- Attaches the rule as metadata (a symbol property), for the tests and for generated docs.

**Next.js check (done):** Next 16.3.1 validates `'use server'` exports at runtime with
`typeof action === 'function'` only (`ensureServerEntryExports`). So a wrapped export is legal; it
is the same pattern next-safe-action uses. Still confirm it end to end with `next build` and the
server-reference manifest in the pilot.

**Rules (`can.*`).** Each rule answers one question.

| Rule | Passes when |
|---|---|
| `can.public({ reason, rateLimit })` | Always. Requires a written reason and, for anything that sends email or OTPs, a rate-limit key. |
| `can.self()` | Signed in. The handler may touch only the caller's own rows. |
| `can.systemAdmin()` | `isSystemAdminEmail(user.email)` |
| `can.manageFirm(resolve)` | `canManageOrganization(firmId)` |
| `can.manageClient(resolve)` | `canManageClient(firmId, clientId)` |
| `can.viewEngagement(resolve)` | `canViewProject` |
| `can.seeEngagementInternals(resolve)` | `canViewProjectInternalTabs` (Members, Shares, Insights) |
| `can.editEngagement(resolve)` | `canEditProject` |
| `can.manageEngagement(resolve)` | `canManageProject`, the same as the page's `canManage` |

**Resolvers (`lib/server/scope.ts`)** map whatever id the caller sent to the entity that owns it,
through the database:
- They include `byEngagement`, `byMember`, `byInvitation`, `byDocument`, `byWikiPage`, `byClient`,
  `byConnector` and `byComment`.
- A resolver never accepts a parent id from the caller. That one rule closes the
  "trusts caller-supplied firmId" class of bugs.
- Where a call names two ids (engagement *and* document), the resolver checks that they belong
  together and throws if not. That closes the mismatched-id IDOR class.

**API routes** get the same rules through `route(rule, handler)`:
- It authenticates from the cookie or a Bearer token (`getAuthUser` in `engagement-auth.ts`).
- Resolvers can read route params: `fromParams('projectId')`, `fromParams('documentId')`.
- Example: `export const PATCH = route(can.editEngagement(documentIn('projectId', 'documentId')), handler)`.
- **Webhooks** use `webhook({ verify }, handler)`, which needs a signature verifier (Polar,
  Inngest's signing key).

### Enforcement test (`lib/server/access-enforcement.test.ts`)
Uses the TypeScript compiler API, which is already a dependency, not regexes:
- **`'use server'` files:** every export must be `export const X = gated(…)`.
- **Inline `'use server'` functions** inside components are rejected outright. They are endpoints
  nobody reviews.
- **API routes:** every exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE` in `app/api/**/route.ts` must
  be `route(…)` or `webhook(…)`.
- **Exceptions** live in `lib/server/access-allowlist.ts`, each with a reason. The test also fails
  on allowlist entries that no longer match anything.

**Ratchet for the migration:**
- The allowlist starts with every current un-wrapped export, generated once and marked
  `legacy: true`.
- CI fails if the legacy list grows, so new code can't skip the gate. Each migration PR deletes
  lines from it.
- This extends `lib/actions/server-action-identity.test.ts`, the userId-parameter guard, which
  stays in place.

**Second net, after build:** read `.next/server/server-reference-manifest.json` and check that
every registered action maps to a module the scan covered. This catches `'use server'` code the
scan missed.

---

## 2. UI: the mandatory attribute is the action, not the component

**One key, shared by both sides.** `lib/permissions/action-access.ts` is a plain module, importable
from client and server alike. It names each mutation and the capability it needs:

```ts
export const ACTION_ACCESS = {
    'members.invite':       'project:can_manage',
    'members.changeRole':   'project:can_manage',
    'members.remove':       'project:can_manage',
    'deliverable.setDue':   'project:can_manage',
    'document.upload':      'project:can_edit',
    // …
} as const satisfies Record<string, CapabilityKey>
export type ActionKey = keyof typeof ACTION_ACCESS
```

- **On the server,** engagement rules can take the key: `can.engagement('members.remove', byMember)`.
- **On the client,** mutation primitives *require* it:

```tsx
<ActionButton access="members.remove" onClick={…}>Remove</ActionButton>   // `access` is a required prop
<ActionMenuItem access="members.changeRole" onSelect={…}>Change role</ActionMenuItem>
<Can access="members.invite" fallback={null}>…</Can>
```

**Pieces:**
- **`CapabilityProvider`** sits at the engagement, client and firm page roots.
  - It is filled server-side by `resolveProjectCapabilitiesForUser`, which already exists and
    already honors View As.
  - It replaces threading `canManage`, `canEdit` and `canViewInternalTabs` through props.
- **`useCan(key)`**, plus `ActionButton`, `ActionIconButton` and `ActionMenuItem` in
  `components/ui/`.
  - They take `whenDenied: 'hide' | 'disable'`. The default is hide; disable shows a tooltip such
    as "Only engagement leads can remove members".
- **Lint rule (`no-restricted-imports`)** on `components/ui/**`: primitives never import server
  actions. Feature components stay free to.
  - Making ESLint prove that "every `onClick` that calls an action is an `ActionButton`" isn't
    worth it. The server gate is the guarantee, and section 2 is about consistency.
- **`PROJECT_GATES`** (`lib/permissions/ui-gates.config.ts`) exists, but nothing renders from it.
  - The engagement page works out its tabs by hand.
  - **Wire it in:** drive the tab strip from `getVisibleGates(capabilities)` and keep the config as
    the single list of tabs.
  - Fold its `requiredCapabilities` vocabulary into `ACTION_ACCESS` so tabs and actions share one
    language.
- **Persona matrix test**, per page:
  - Render with each persona's capability set (from `persona-map.ts`) and snapshot which tabs and
    `ActionButton`s show.
  - A role change then appears as a reviewed snapshot diff, not a surprise in production.

---

## 3. Inventory

The full per-endpoint tables are in [access-gates-inventory.md](access-gates-inventory.md). They
come from four read-only audit passes over the working tree, one row per endpoint. The
most serious claims were spot-checked by hand (listed there); the rest should be confirmed when
fixed.

**Production has only Deepak as of 2026-09-11, so nobody is exposed today.** The P0 list below
must land before any outside firm gets an account.

| Verdict | Server actions (136) | API handlers (180) | Total (316) |
|---|---|---|---|
| OK — signs in and checks rights on the entity | 57 | 78 | 135 |
| SELF — only the caller's own rows | 41 | 29 | 70 |
| PUBLIC — intentionally signed-out | 3 | 7 | 10 |
| AUTH-ONLY — signed in, no rights check | 5 | 9 | 14 |
| PARTIAL — wrong scope, trusts caller ids, view-gates a write | 20 | 44 | 64 |
| MISSING — no check | 10 | 10 | 20 |
| UNSURE — depends on prod env (Inngest) | 0 | 3 | 3 |

About 100 endpoints need work.
- Of the 20 MISSING, five are harmless: the persona catalog ×4 and a constant folder name.
- Three more (the waitlist count, leaderboard and referral stats) are latent, because nothing
  imports them.

### Root causes

Most gaps trace to a handful of patterns. The wrapper in §1 exists to remove them.

1. **Caller-supplied parent ids.**
   - `checkClientPermission` and `checkProjectPermission` return true for any firm admin of the
     firm id *passed in*, without checking the client or engagement belongs to that firm.
   - Anyone can become firm admin of a throwaway firm, through `createOwnWorkspace`, which has
     no cap.
   - Results: `inviteClientMember` on another tenant's client, `notifications/broadcast` to
     another tenant, `onboarding/create-project` under a foreign client, `index-file` body
     `organizationId`/`clientId`, and `firms/[id]/audit/filters`.
2. **Authorization from token claims.**
   - `checkFirmPermission` and `checkClientPermission` trust `app_metadata.active_persona`.
   - `POST /api/onboarding/ensure-org` sets that claim to `firm_admin` for whoever calls it.
   - Removing a member never clears it.
3. **Connector ids treated as secrets.**
   - The Google access token route has no auth.
   - Connector ids leak through `/api/connectors` GET, document `sharing` GET and linked-files
     `list`.
   - About fifteen connector actions run against any connector id.
   - Onboarding re-parents any connector into the caller's new firm.
4. **Unsigned OAuth state.** The Google Drive and OneDrive callbacks decode base64 JSON from
   `state` and act on its user, firm and client ids. Nothing ties the request to the session.
5. **Secondary ids not bound to the checked entity.**
   - `drive-action` fileId, permissionId and connectorId.
   - `bulk-download` and `index-file-intake` Drive ids; `resolve-path`.
   - Client contacts by id; reminders by id; doc-comment `recipientId`.
6. **View rights guarding internal data.** External contributors and reviewers (EC/EV) pass `can_view`, then read:
   - members with emails, deliverables with access logs, audit, subtasks and comment previews;
   - search over Confidential files;
   - previews of documents never shared with them.

   `sharing/regrant` re-grants Drive access after an un-share.
7. **Content and transport hygiene.**
   - An SVG firm logo is served from the app origin with no CSP or `nosniff`, which is stored XSS.
   - Access tokens are put in download URLs as `?token=`.
   - `getSession()` is used for identity in about a dozen places.
   - `Cache-Control: public` is set on authenticated thumbnails.
   - Push-subscription endpoints are not allow-listed (blind SSRF).
   - The waitlist email field accepts `a@x,b@y`, so the confirmation mail fans out.
   - There is no rate limiter anywhere.
8. **Environment-dependent verification.**
   - Inngest skips signature checks when `INNGEST_DEV` is set.
   - Debug routes are gated by `WORKSPACE_ENV` alone.
   - System admin is matched by email without checking `email_confirmed_at`.

There is no Postgres RLS (row-level security), so these app checks are the only barrier. RLS as
defense in depth is a separate decision and out of scope here.

### P0 — fix before any outside user

Most fixes are small (S); a few are medium (M).

| # | Gap | Where | Exploit in one line | Size |
|---|---|---|---|---|
| 1 | Live Google access token with no sign-in | `GET /api/connectors/google-drive/token` | Anyone with a connector id gets that firm's Drive token | S |
| 2 | Connector ids readable by anyone signed in | `GET /api/connectors?organizationId=`, `GET …/documents/[id]/sharing`, `GET …/sharing/ids` | Feeds #1, #3 and #5 for any firm | S |
| 3 | Connector actions with no or weak checks | `POST /api/connectors/google-drive` (initiate, test, create-folder, ensure-folder…), `POST /api/connectors/onedrive`, `…/linked-files` GET and DELETE, `…/test`, `DELETE /api/connectors` (disconnect), `…/upload` (connectionId branch), `…/import` | Rewrite another firm's Drive root, delete its document records, revoke its Drive connection | M |
| 4 | OAuth callbacks trust unsigned `state` | Google and OneDrive `/callback` | Link the attacker's Drive as a victim firm's or client's storage | M |
| 5 | Cross-tenant Drive operations | `POST /api/drive-action` (trash, revoke, set_expiry, searches) | Trash files or revoke shares in another firm's Drive | M |
| 6 | Connector hijack at onboarding | `onboarding/create-org`, `create-custom-workspace`, `test-org` | Re-parent a victim's connector into the attacker's firm | S |
| 7 | Self-granted firm-admin persona | `POST /api/onboarding/ensure-org` + token-claim fast path | A guest becomes "firm admin" of their default firm | S–M |
| 8 | Parent ids never bound to their firm | permission helpers, root cause 1 | Invite yourself as client admin of another tenant's client; broadcast to another tenant | M |
| 9 | Stored XSS via SVG logo | `POST/GET /api/firms/[id]/logo` | A script runs on the app origin for anyone who opens the link | S |
| 10 | Any firm's support tickets | `GET /api/support/requests?firmSlug=` | Read any firm's tickets; an unknown slug returns all tickets | S |
| 11 | Caller-chosen Polar checkout params | `GET /api/checkout` | Point a checkout at another group and downgrade its plan | S |
| 12 | Member lists for any firm or client | `getFirmMembers`, `getClientMembers` | Read members' emails and pending invites | S |
| 13 | Production environment check | Vercel env | Confirm `INNGEST_DEV` is unset, `INNGEST_SIGNING_KEY` is set, `WORKSPACE_ENV` ≠ development, and Supabase email confirmation is on | XS (Deepak) |

#### P0 status — #1–#12 fixed, uncommitted, 2026-10-15

Every fix has gate tests: refused caller, allowed caller, signed-out caller. The shared pieces are:
- `lib/connectors/connector-access.ts`: who may use a connector, and who may connect storage.
- `lib/connectors/oauth-state.ts`: signed OAuth state.
- `lib/connectors/engagement-file-scope.ts`: is a Drive item inside an engagement's tree.
- `lib/http/safe-image-response.ts`: serving uploaded images safely.

| # | Fix | Files |
|---|---|---|
| 1 | Token route: owner or firm admin only. Client partners don't get the raw token. | `connectors/google-drive/token/route.ts` |
| 2 | Connector list: firm admins only. `sharing` GET and `sharing/ids` GET need `canViewProject`, with firm and client taken from the engagement row. `connectorId` stripped from the sharing response. | `api/connectors/route.ts`, `…/documents/[documentId]/sharing/route.ts`, `…/sharing/ids/route.ts` |
| 3 | One connector gate before every Google Drive and OneDrive POST action except `initiate`. Unknown actions are gated too. The connector-manager check also covers `test`, linked-files GET/DELETE, the upload `connectionId` branch, `import` (plus edit rights on a target engagement folder) and disconnect. linked-files `create-folder` needs edit rights on the engagement. `firmId` hints are followed only into firms the caller administers (`update-root-folder`, `onedrive/sites`). | `connectors/google-drive/{route,test,linked-files,upload,import}`, `connectors/onedrive/{route,sites}`, `api/connectors/route.ts` |
| 4 | `initiate` uses the session user, ignoring the body's `userId`, and checks rights to the firm, client or replaced connector, then signs the state with HMAC-SHA256 (30-minute lifetime). The callbacks verify the signature before exchanging the code, require that the session user is the state's user, and re-check rights. The default-firm fallback links only to a firm the user administers. `next` is limited to same-origin paths. | `connectors/{google-drive,onedrive}/route.ts` and `/callback/route.ts` |
| 5 | With an engagement: `trash` only, with edit rights, through the engagement's own connector, and only for a file inside its tree. Without one: only connectors the caller manages. | `api/drive-action/route.ts` |
| 6 | `create-org` and `create-custom-workspace` take over only a connector the caller connected. `test-org` needs a firm admin and a connector they manage. | `onboarding/{create-org,create-custom-workspace,test-org}` |
| 7 | `ensure-org` writes the real role. `checkFirmPermission` answers `firm:can_manage` from the database's `firm_admin` role every time. The token-claim fast path is gone from the firm and client checks. | `onboarding/ensure-org`, `lib/permission-helpers.ts` |
| 8 | `checkClientPermission` and `checkProjectPermission` refuse a client or engagement that isn't under the firm (and client) passed in. Body ids are bound in broadcast, `create-project`, `index-file` (body firm and client ignored) and `audit/filters`. `inviteClientMember` checks the client's own firm. | `lib/permission-helpers.ts`, `notifications/broadcast`, `onboarding/create-project`, `projects/[id]/index-file`, `firms/[id]/audit/filters`, `lib/actions/client-members.ts` |
| 9 | Both logos are served through `safeImageResponse`: real raster bytes, SVG only under a sandbox CSP, `nosniff`. The client brand logo had served a stored `data:text/html` URL as HTML. Firm logo uploads must match their declared type. The public 500 response no longer includes error detail. | `firms/[id]/logo`, `clients/[id]/brand/logo` |
| 10 | A firm's tickets go to its firm admins. Other members see only the tickets they filed. An unknown slug returns 404. | `support/requests/route.ts` |
| 11 | Firm admins only. The query is rebuilt from `firmId`, `returnTo` and `products`; the customer and metadata are set server-side. Caller-chosen products must be in the public catalog. `getSession()` is replaced by `getUser()`. | `api/checkout/route.ts` |
| 12 | `getFirmMembers`: firm admins and Client Partners only, with invitations for firm admins only. `getClientMembers`: client managers only. Invite tokens are stripped from all three member lists. | `lib/actions/{firm-members,client-members,members}.ts` |

**#13 is for Deepak to check in production settings (Vercel and Supabase):**
- **Inngest:** `INNGEST_DEV` is unset and `INNGEST_SIGNING_KEY` is set.
- **Debug routes:** `WORKSPACE_ENV` isn't `development`.
- **Supabase:** email confirmation is on.
- **OAuth state secret:** set a dedicated `OAUTH_STATE_SECRET`. Until then the state is signed with the service-role key.

**Notes:**
- **Extra queries:** the hierarchy binding (#8) and the database answer for firm management (#7)
  add one indexed lookup per check.
- **Existing SVG logos:** they keep rendering, sandboxed.
- **Logo GET still creates folders:** it can still create `.meta/assets` once per firm (P2).
- **`drive-action` dashboard modals:** these now act only through connectors the caller manages. A
  firm member who isn't an admin no longer sees other people's risky shares there.

### P1 — guests and members seeing or doing more than their role allows
- **Engagement documents for EC/EV:**
  - `preview` and `download-share?preview=true` skip the shared-subtree, privacy and download
    rules.
  - `bulk-download` takes any Drive ids.
  - `search` reaches Confidential files.
  - `regrant` re-grants Drive access after an un-share.
  - `index-file-intake` plus intake withdraw can claim and trash an internal file.
- **Internal lists behind `can_view` alone:** members, shares (access logs), audit, subtasks,
  doc-comment previews. Also `/api/documents/download`, which works across a whole firm via its
  connector.
- **Client data:**
  - Contacts are updated, deleted or set primary by id without a scope check.
  - `listClientContacts` is open to any firm member.
  - The hierarchy actions return CRM fields (internal memo, value, billing address) to EC/EV.
  - `createClient` and `createEngagement` accept any firm member, guests included.
- **Engagement folders:** `provisionEngagementDriveFolder` and `getEngagementFolderIds` only check
  sign-in.
- **Reminders and invites:**
  - `createManualReminder` resolves any entity id.
  - Reminders can be deleted by id.
  - `recipientId` is unchecked on doc comments.
  - Invites marked SUPERSEDED can be accepted again.
  - Removing a member leaves their engagement and client rows, and their token persona.
- **Firm and client records:** `/api/firm` GET returns the full firm record to external members.
  Client `brand` and `brand/logo` are open.

### P2 — public surface hygiene
- **Waitlist:** `to:` list injection, and PII leaks (status for any email; latent leaderboard and
  count).
- **OTP and account checks:** no rate limits on OTP or email-exists, so accounts can be enumerated.
- **Anonymous tickets:** `submitErrorTicket` and `reportActionFailure` file tickets, signed out,
  against any firm.
- **Maintenance endpoints:** the platform-maintenance status GET changes state and mass-emails
  without an atomic check. `maintenance-by-slug` is a firm-slug oracle.
- **Transport:** push SSRF; public caching of thumbnails; `?token=` in download URLs;
  `getSession()` → `getUser()`.
- **Leftovers:** demo routes still ship to production, and the firm-logo GET creates Drive folders
  for anonymous callers.

---

## 4. Migration order

1. **Stop the bleeding: P0 #1–#13 as narrow, tested fixes, before any new infrastructure.**
   - Use the existing helpers and the `requireEngagementManager` pattern, with one gate test per
     fix, as in `member-gates.test.ts`.
   - Don't block the urgent fixes on the wrapper.
   - About 2–3 days. Item #13 is a Vercel and Supabase settings check for Deepak.
2. **Foundations (about 2 days).**
   - **Helpers:** take the leaf id only — `canManageClient(clientId)`, `canManageEngagement(engagementId)`
     — and derive the chain from the database. Old signatures become deprecated wrappers that
     verify the chain.
   - **Token claims:** drop the token-claim fast path from authorization.
   - **Wrappers:** build `gated`, `route` and `webhook`, the `can.*` rules and the resolvers.
   - **Enforcement:** add the enforcement test with the generated legacy allowlist (the ratchet).
3. **Pilot (about half a day).**
   - Convert `lib/actions/members.ts` and `invitations.ts` to `gated`; they are already checked.
   - Confirm the wrapped exports survive `next build` and appear in the server-reference manifest.
4. **P1 by area (about 3–4 days).**
   - Engagement document routes first, sharing one `can.accessDocument` rule (shared subtree,
     privacy lock, download rights).
   - Then client contacts and creation, then reminders, invites and offboarding.
5. **Burn down the allowlist (1–2 days).**
   - Convert the remaining OK and SELF endpoints to the wrapper (about 200, mostly mechanical).
   - Each PR deletes allowlist lines; the list reaching zero is the definition of done.
6. **P2 hygiene and a rate limiter (1–2 days).**
7. **UI layer (about 2–3 days), alongside the Phase 6 redesign, since those pages are being
   touched anyway.**
   - `CapabilityProvider`, `ActionButton`/`ActionMenuItem`/`Can` and `ACTION_ACCESS`.
   - Engagement tabs driven from `PROJECT_GATES`; the Members tab first.
   - Persona matrix tests.

**Total:** roughly two to three weeks of focused work. Step 1 is the only urgent part.
