# Refactor: Move `Connector` from Firm level to Client level

## Context

**Why this change:** A new use case — consultants who work with multiple clients and store docs in
*each client's* Google Drive (or use a per-client email/account). Today a connector is owned by the
**Firm** (`Firm.connectorId` 1:1 + `Connector.firmId` 1:N), so every client/engagement under a firm
shares one Drive account. These consultants need a **different connector per client**.

**Target (confirmed with product owner, latest refinements applied):**
1. Connectors live at the **Client level — one connector per client** (`Client.connectorId`).
2. **No firm-level connector and no firm-level default** — the firm connector concept is removed; the
   resolver does **not** fall back to a firm connector.
3. **Remove the firm-level connectors page** (`/d/f/[slug]/connectors`) and its nav entry.
4. The client connector UI is **merged into the existing Client Settings page**, placed **above the
   restricted Delete-Client (Danger zone) section**.
5. **Connectors are SHARED, not duplicated.** When two clients choose the same account, both point at
   the **same `Connector` row** (1:N `Connector`→`Client`). Consequences, by design:
   - **Disconnecting via one client disconnects it for all clients** sharing that connector.
   - **Editing the owning account** prompts the user: *change the owner for all clients sharing this
     connection*, **or** *create a new connection row for this client only*.
6. Auth: both **Firm Admin** and **Client Partner** (`client_admin`) can manage a client's connector,
   via the existing `canManageClient(firmId, clientId)` (`lib/permission-helpers.ts:86-146`). **No JWT
   change** — JWT only carries `active_firm_id`/`active_persona`.

**Outcome:** Each client has exactly one connector (possibly shared with sibling clients). Engagement
folder creation, file ops, and OAuth all resolve the connector from the *client*; the firm no longer
holds a connector.

### Design decision: shared record vs. duplicated record (when the same account serves many clients)

**Chosen: SHARED** (one `Connector` row per account, referenced by N clients). Rationale — a Google
OAuth grant is physically *one* grant per (account + OAuth client + scopes), so duplication models a
single shared credential as if it were N independent ones, which is untrue and costly:
- **Isolation is illusory.** Revoking a duplicated row revokes the underlying grant → breaks every
  sibling anyway, forcing compensating "revoke-only-if-no-sibling" guard logic.
- **Token-rotation hazard.** If refresh-token rotation is on, a refresh by one duplicated row
  invalidates the copies in siblings → intermittent, hard-to-debug breakage. Shared has one lineage.
- **Consistency & secret hygiene.** Re-auth updates one shared row vs. fanning out to N; the encrypted
  refresh token lives in exactly one place rather than N audit/rotation surfaces.

Duplication's only genuine win — per-client *settings* (notably a different root folder for the same
account) — is achieved without copying the credential: the credential is shared, the per-client root is
a link/engagement attribute. The cost of sharing (disconnect affects all sharers; owner change needs a
"change-for-all vs. fork" prompt) is *truthful* coupling and is handled with a "Shared with N" badge,
warnings, and an explicit fork escape hatch (when an account truly diverges → its own row). The schema
follows from this: unique key is keyed on the **account** (`[type, userId, externalAccountId]`), which
collapses the same account to one row while keeping different accounts distinct.

---

## Complexity & blast surface (at a glance)

- **Schema:** add `Client.connectorId` (shared FK), relax the unique constraint, retire `Firm.connectorId`. Medium.
- **Read paths:** ~5 firm-connector resolution sites route through one new client resolver (no firm fallback). Wide but mechanical.
- **OAuth + storeConnection:** become client-aware; dedup key changes. Highest care.
- **Sharing semantics:** disconnect affects all sharers (intended); owner-edit fork dialog. New, contained logic.
- **UI:** remove firm page; add a connector section inside Client Settings. Medium.
- **Onboarding:** firm-level connect step must change (firm no longer owns a connector) — see edge cases.

---

## A. Data model / schema changes

`frontend/prisma/schema.prisma`

**`Connector` (142-175)** — relax the unique constraint so one Supabase user can connect *multiple
distinct accounts* (the core use case: a different Google account per client), keep `firmId` as a
scoping tag, add the shared reverse relation:
```prisma
  // keep firmId as a firm-scoping tag (which firm this connector belongs to — for the
  // "use an existing connection" picker and cross-firm isolation). NOT a firm default.
  clients Client[] @relation("ClientConnector")

  // change FROM: @@unique([type, userId])
  // allows one user to hold several connectors of the same type for different external accounts
  @@unique([type, userId, externalAccountId])
```

**`Client` (294-341)** — add the shared FK:
```prisma
  /** The client's document-storage connector. Shared: multiple clients may reference one Connector. */
  connectorId String?    @db.Uuid
  connector   Connector? @relation("ClientConnector", fields: [connectorId], references: [id], onDelete: SetNull)

  @@index([connectorId])
```
- `onDelete: SetNull` — a Connector is shared, so removing it must not cascade-delete clients; the
  client's `connectorId` simply clears.
- Relation name `"ClientConnector"` does not collide with the firm relations.

**`Firm.connectorId` / `Firm.connector` / `Firm.connectors`** — **retire.** Stop all reads (resolver no
longer falls back to firm). Keep the columns physically for one release to allow the backfill and avoid
a destructive drop; remove in a follow-up migration. (The relations stay declared until reads are gone.)

**`FirmWorkspaceMigration` (220-262)** — **defer.** Workspace-root migration stays connector-scoped.
Because a connector is shared, a root change affects all sharing clients (warn in UI, F#6).

### Backfill migration (raw SQL appended to the generated Prisma migration)

Generate with `prisma migrate dev --create-only`, then append a **sharing** backfill — point every
client at its firm's existing connector row (no new rows):
```sql
UPDATE "platform"."clients" c
SET "connectorId" = f."connectorId"
FROM "platform"."firms" f
WHERE c."firmId" = f."id"
  AND f."connectorId" IS NOT NULL
  AND c."connectorId" IS NULL
  AND c."deletedAt" IS NULL;
```
`Engagement.connectorRootFolderId` is left untouched. After this ships and reads are migrated,
`Firm.connectorId` is dead and can be dropped.

---

## B. Read-path resolution refactor

New file `frontend/lib/connectors/resolve-client-connector.ts` (no firm fallback):
```ts
/** Resolve the connector id for a client. One per client, possibly shared with siblings.
 *  No firm-level fallback — firm connectors no longer exist. */
export async function resolveClientConnector(clientId: string): Promise<{
  connectorId: string | null; firmId: string
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { firmId: true, connectorId: true },
  })
  if (!client) throw new Error('Client not found')
  return { connectorId: client.connectorId, firmId: client.firmId }
}
```

Switch firm-scoped resolutions to client-scoped (remove firm-default reads entirely):

| File | Today | Change |
|---|---|---|
| `lib/actions/project.ts:199-231` | `const connectorId = firm.connectorId` | `resolveClientConnector(client.id)` |
| `lib/services/project.service.ts` (~109-124) | `firm.connectorId` | resolve via engagement's `clientId` |
| `lib/actions/client.ts` (~176-182) | `firm.connectorId` | resolve from the client row |
| `lib/services/search-service.ts` (~41-49) | `firm.connectorId` | resolve from doc's `clientId` |
| `lib/connectors/registry.ts:63-104` (`getConnections`) | `firm.findUnique(...).connector` | replace with `getClientConnections(clientId)` via resolver |
| `lib/google-drive-connector.ts:284-329` (`getConnections`) | reads `firm.connectorId` | replace/sibling `getClientConnections(clientId)` |

`getStorageAdapter`, `disconnect/removeConnection`, `getEngagementFolderIds`, `ensureAppFolderStructure`
already work by `connectorId` — unchanged; callers pass the client-resolved id. Any remaining
`firm.connectorId` read becomes a no-op/null (engagement creation already guards `if (connectorId)`).

---

## C. OAuth flow & `storeConnection`, sharing semantics

**`storeConnection` (`google-drive-connector.ts:1690-1792`)** — change dedup from `(type, userId)` to
`(type, userId, externalAccountId)` so the same user connecting a *new* account creates a new shared
row, while re-connecting an *existing* account updates (and continues sharing) the existing row. Add a
`clientId` param; after upsert, set `Client.connectorId = connector.id`. Drop the firm-link writes
(lines 1754-1758, 1784-1788).

**Initiate** (`app/api/connectors/google-drive/route.ts` ~71-81): add `clientId` to the base64 state.
**Callback** (`app/api/connectors/google-drive/callback/route.ts` ~222-310): decode `clientId`, pass to
`storeConnection`, link the client. Verify (via `Connector.firmId` / client's `firmId`) the account
stays within the firm.

**Share an existing connection (no OAuth):** a picker action `{ clientId, connectorId }` that simply
sets `Client.connectorId = connectorId` after confirming the chosen connector belongs to the same firm.
This is the "use my own Drive for several clients" path — pure sharing, one row.

**Edit owning account (fork dialog):** when a client changes its connector's owning account and the
current connector is referenced by **more than one** client:
- **"Change for all N clients"** → re-run OAuth and **update the shared Connector row** in place (new
  tokens / `externalAccountId`). All sharers move together.
- **"Only this client"** → create/*find* a Connector row for the new account
  (`storeConnection` with the new `externalAccountId`) and repoint only this client's `connectorId`;
  siblings keep the old row.
If only one client references the connector, edit in place silently (no prompt).

**Disconnect (shared):** intentionally affects all sharers. `disconnectConnection` revokes at Google and
marks the Connector `REVOKED`; the UI shows the revoked state for every sharing client. `remove` nulls
all referencing `Client.connectorId` and deletes the row. (No "skip revoke" guard — shared disconnect is
the desired behavior; the UI warns first, F#3.)

---

## D. Permissions & API

Client connector actions are exposed through the Client Settings surface and a small client-scoped API
(or server actions in `lib/actions/client.ts`), each authorized by `canManageClient(firmId, clientId)`
(true for `firm_admin` and `client_admin`):
- **get** the client's connection (account, status, sharedWithCount).
- **connect** (OAuth, threads `clientId`).
- **share** an existing firm connector (`{ clientId, connectorId }`).
- **edit owner** (fork dialog: change-for-all vs new-row).
- **disconnect / remove** (with shared-impact warning).

**Removed:** firm-level connector routes are retired along with the firm page. Keep the OAuth
callback/initiate routes (now client-aware). `app/api/connectors/route.ts` (firm GET/DELETE) is removed
or repurposed to client scope.

---

## E. UI changes

**E1. Remove the firm-level connectors page.**
- Delete `frontend/app/(app)/d/f/[slug]/connectors/page.tsx`.
- Remove the nav entry: `connectorsHref` in `frontend/components/app/app-sidebar.tsx:977` and the
  matching prop in the firm sidebar component; drop `/connectors` from the active-state checks
  (`app-sidebar.tsx:372`).

**E2. Add the connector section to Client Settings.**
- In `frontend/components/projects/client-settings-form.tsx`, insert a new "Document storage /
  Connector" tile **between the Actions bar (ends line 368) and the Danger zone `<section>` (line 370)**
  — i.e. above the restricted Delete-Client area.
- Contents (reuse Google Drive components from the old firm page + `components/google-drive/*`):
  - Current connection: account email, status; **"Shared with N clients"** badge when applicable.
  - **Connect Google Drive** → popup OAuth with `clientId` in the body.
  - **Use an existing connection** picker → lists the firm's other connectors; selecting one shares it
    (sets `Client.connectorId`).
  - **Change owning account** → triggers the fork dialog (C: change-for-all vs only-this-client).
  - **Disconnect** → confirm dialog that **warns when shared** ("This connection is used by N clients;
    disconnecting affects all of them.").
  - Workspace-root picker (`components/google-drive/google-drive-workspace-root.tsx`), shown with a
    "changing the root affects all clients sharing this connection" note when shared.
- Pass the client's `connectorId` / sharing info into `ClientSettingsForm` props (extend
  `ClientSettingsFormProps`, populated by the client settings page loader).

**E3. Permission reachability — confirm.** The client settings page must authorize via
`canManageClient` (not `canManageOrganization`) so Client Partners can manage the connector. The
`/d/f/[slug]/c/[clientSlug]` segment has no firm-admin layout gate.

---

## F. Regression risks, edge cases, blast surface

| # | Risk / edge case | Handling |
|---|---|---|
| 1 | Engagements created **before** backfill | `connectorRootFolderId` untouched; backfill shares the firm connector down to every client so the resolver is consistent. |
| 2 | Client with **no connector** | Resolver returns `null`; engagement creation skips Drive structure (existing `if (connectorId)` guard, `project.ts:200`). No crash. |
| 3 | **Shared disconnect affects all clients** | Intended. UI warns with the sharer count before disconnect/remove. `disconnectConnection` revokes + marks `REVOKED`; all sharing clients reflect it. |
| 4 | **Unique constraint** change `[type,userId]`→`[type,userId,externalAccountId]` | Also update `storeConnection`'s `findFirst` WHERE clause (currently `{ type, userId }`) to `{ type, userId, externalAccountId }` — the constraint change alone doesn't fix the lookup, and a mismatch would silently overwrite a different account's connector row. |
| 5 | **Owner edit on a shared connector** | Fork dialog (C): change-for-all (update shared row) vs only-this-client (new row + repoint). Single-sharer edits in place without prompt. |
| 6 | **Workspace-root change on a shared connector** | Root is connector-level; affects all sharers. Show a "shared" note; root migration stays connector-scoped (deferred A). |
| 7 | **Onboarding** currently creates a firm connector + Drive sample files | Firm no longer holds a connector. Onboarding becomes DB-only seeding (see §G). The firm Drive-connect step (Step 3) and async Drive provisioning (Step 4) are removed; storage is connected later per client. |
| 8 | **Satellite/anchor firms** | Resolver uses the client's own `firmId`; no anchor traversal (parity with prior logic). |
| 9 | **Cross-firm share** via picker | `share` and OAuth-callback verify the connector/account belongs to the same firm (`Connector.firmId` / client `firmId`) before linking. |
| 10 | `finalize` / `repair-org-folder` / `migrate-and-update-root` assume a firm owns the connector | Add null-safe firm lookups (connectors may have no firm default); operate by connector id. |
| 11 | Removing the firm page leaves **stale links/bookmarks** | Redirect `/d/f/[slug]/connectors` → `/d/f/[slug]` (firm dashboard). Remove sidebar active-state exclusions at `app-sidebar.tsx:371-372` alongside the nav entry (both become dead code). |
| 12 | **Existing prod Drive folder hierarchy** (firm folder orphaned post-backfill) | The single prod user's existing firm folder and client/engagement subfolders remain in Drive untouched — `connectorRootFolderId` on engagements is preserved. After backfill, the client's `connectorId` points at the existing connector and `driveFolderId` already stores the client folder id. No re-creation occurs. The firm folder becomes an orphan in Drive (not deleted by the app); it can be manually cleaned up later. New engagements created after the migration will create folders directly under the workspace root (no firm folder), so there will be a one-time structural divergence between old and new engagements for this client. |
| 13 | **`registry.ts:getConnections` dual-model union** | After backfill the registry already unions `firm.connector` (legacy FK) + `firm.connectors` (new `firmId` relation). Once all reads migrate to the client resolver, retire the legacy branch from `getConnections` and the `google-drive-connector.ts:284` `getConnections` separately — they are two distinct functions. |

---

## G. Onboarding, Drive folder root & Sandbox firms (consequences of removing the firm connector)

Today **every onboarded firm is a Sandbox firm** (`sandboxOnly=true`, DB column `isAnchor`). Sample
clients/engagements/contacts are already DB-seeded; sandbox firms already gate delete / native-doc
create / invites and bypass billing. The only thing currently "real" is that sample **files live in a
real Drive** under the firm connector connected in onboarding Step 3. Removing the firm connector lets
us cut that dependency.

### G1. Drive folder hierarchy starts at the **Client** level (drop the firm folder)
- Today: `connector workspaceRoot → firm folder (`Firm.firmFolderId`) → client folder → engagement →
  general/confidential/staging`. The firm folder is the **direct parent** of client folders
  (`lib/connectors/pockett-structure.service.ts:658`, parent = `firm.firmFolderId`).
- Change: the structure starts at the **client folder**, parented at the *client's* connector
  workspace root; tracked by existing `Client.driveFolderId`. **`Firm.firmFolderId` is retired**
  (kept one release, then dropped). A firm's clients may live in different Drives, so a single firm
  folder is no longer meaningful.
- In `ensureAppFolderStructure` / `setupFirmFolder` (`pockett-structure.service.ts:~210-260, ~619-700`):
  remove the firm-folder creation/parenting; create the client folder directly under
  `connector.settings.rootFolderId`.
- **Shared-connector collision guard:** when one connector is reused across clients (possibly across
  firms), client folders share a workspace root → name collisions. Namespace client folders as
  `"<FirmName> — <ClientName>"` (or a per-firm subfolder derived from the connector), not from a global
  firm folder id.
- **Firm logo folder** currently under the firm folder (`app/api/firms/[firmId]/logo/route.ts:110`)
  moves to connector-level storage or keeps using `Firm.logoUrl`.
- `importStructureFromDrive` / auto-import (`pockett-structure.service.ts:316+`, `lib/services/auto-import.ts`)
  drop the org-level scan tier; detect at client level (client `.pockett/meta.json` already exists).

### G2. Sandbox/Anchor firms become **DB-only** (static sample file lists, live actions disabled)
- Onboarding **DB-seeds** the sample hierarchy synchronously (it already does for clients/engagements/
  contacts). The **Engagement files list** for `sandboxOnly` engagements renders from the **existing
  static sample definitions** (`lib/services/sample-file-service.ts` `DEFAULT_SAMPLE_FILES` +
  `sandbox-hierarchy.json`) as read-only rows — **no Drive reads**.
- **Disable** open / download / preview for sandbox sample rows, extending the existing sandbox gate
  (already present for trash at `app/api/drive-action/route.ts:97-118` and create at
  `components/projects/project-file-list.tsx:1470-1484`). The new gates (download/open) are few and
  central.
- **Delete** the firm-Drive onboarding machinery: OAuth Step 3, the async Inngest sandbox Drive
  provisioning (`lib/onboarding/onboarding-helper.ts:548-678` `provisionSandboxHierarchyForFirm`),
  `setupOrgFolder`, the Drive sample-file population job (`lib/inngest/functions.ts:296-339`), and
  `finalizeSandboxDriveConnectorAndIndexing`. **Net complexity drops** — a complex async Drive path is
  replaced by synchronous static seeding; the sandbox gates already exist.
- **Two distinct signals (do not overload one flag):**
  - `sandboxOnly` ⇒ "seeded demo content" ⇒ render the **static sample list**, actions disabled.
  - *client has a connector?* ⇒ gates **live actions** for real clients. A real-but-unconnected client
    shows an **empty state + "Connect a Drive" CTA**, not fake samples.
- One sample-render path only: render static samples for **any** `sandboxOnly` engagement and stop
  reading sandbox samples from Drive. Existing sandboxes' old Drive sample files become harmless
  orphans (optional later cleanup).

### G3. Keep the Subscription step; wire the Pricing intent into it
- Step 1 "Initializing workspace" is **DB-only (~200–500ms)** and runs before billing — **not** a
  payment-dropout risk; it's even lighter after Drive provisioning is removed.
- **Retain Step 2 (Subscribe)** — the natural conversion point for paid arrivals. **Fix the gap:** read
  `checkoutIntent` (set on Pricing via `lib/marketing/checkout-intent.ts`) in the onboarding billing
  step (`components/billing/billing-page-client.tsx`) so a user arriving from Pricing with "Standard"
  lands on a **pre-selected checkout**, not the free tier. The Step-1 free-plan anchor is just a
  placeholder and doesn't block the upgrade.

### New onboarding flow (after refactor)
1. **Initialize workspace** (DB-only): firm shell + member + free Polar anchor — unchanged.
2. **Subscribe** (retained; pre-selects plan from `checkoutIntent` for paid arrivals).
3. **Seed sandbox** (DB-only): create sample clients/engagements/contacts synchronously. **No OAuth, no
   Drive.** Done — redirect to the firm dashboard.

Real Drive storage is connected later, **per client**, in Client Settings (§E). Onboarding Steps 3 & 4
(Drive connect + async Drive provisioning) are removed.

---

## H. Impact on existing prod data (single test user)

The only user who has ever connected a Drive on prod is the sole test user (Deepak). Their current state:

- One `Connector` row (`type=GOOGLE_DRIVE`, `userId=<test-user-supabase-id>`, `externalAccountId=<google-account-id>`).
- `Firm.connectorId` points at this row.
- One or more `Client` rows under that firm, each with `driveFolderId` already set (the client Drive folder id).
- `Engagement.connectorRootFolderId` already set on any engagements that had folders created.
- The Drive folder hierarchy is: `workspaceRoot → firmFolder (firmFolderId) → clientFolder (driveFolderId) → engagementFolder`.

**What the backfill does:**

- Sets `Client.connectorId = firm.connectorId` for all clients under the firm. No new connector row is created; the existing row is shared.
- `driveFolderId` and `connectorRootFolderId` are untouched — existing folder references remain valid.

**What changes post-migration for the prod user:**

- The firm folder in Drive becomes an orphan. The app stops creating or referencing it; it sits in Drive harmlessly.
- New engagements created after the migration produce folders directly under the workspace root (no firm folder parent). Old and new engagements coexist with a different folder depth — this is cosmetic and does not break any file operations since `connectorRootFolderId` per engagement is the source of truth.
- The `/connectors` page redirects to the firm dashboard; the connector section moves to Client Settings.
- The connector section in Client Settings will show "Shared with N clients" if the backfill linked multiple clients to the same row.

**No data loss, no Drive file movement required.**

---

## I. Future provider scalability (OneDrive and beyond)

The connector registry already supports multiple providers. `registry.ts` has `IConnectorInstance` + `IConnectorStorageAdapter` interfaces with OneDrive scaffolded (`onedrive-connector.ts`, `adapters/onedrive-adapter.ts`, `ConnectorType.ONEDRIVE` in the enum). The client-level model is more compatible with multi-provider than the firm-level model was. Key design considerations to keep this refactor provider-agnostic:

**What this refactor handles well:**

- `Client.connectorId` is typed as a UUID FK to `Connector`, not hardcoded to Google Drive. Any `ConnectorType` can be linked.
- `resolveClientConnector` returns a `connectorId`; all downstream ops go through `getStorageAdapter(connectorId)` which is already provider-dispatched.
- The "Use an existing connection" picker in Client Settings should filter by `firmId` (any connector type), not by `type=GOOGLE_DRIVE`.

**Risks to avoid during implementation:**

- The OAuth initiate/callback routes (`app/api/connectors/google-drive/…`) are Google-specific. When OneDrive ships, a parallel route pair is needed. Do not bake `clientId` threading only into the Google routes — establish the pattern cleanly so it can be replicated.
- `storeConnection` inside `google-drive-connector.ts` is Google-specific and handles the dedup/upsert. OneDrive will need its own equivalent. The `clientId` link step (`Client.connectorId = connector.id`) should be extracted into a shared utility (`linkClientConnector(clientId, connectorId)`) so both providers call the same DB write rather than duplicating it.
- The fork dialog ("change for all vs only this client") and shared-connector picker are provider-agnostic UI. Build them against `connectorId` + `type` rather than assuming Google Drive, so they work when OneDrive rows exist.
- `getConnectorMeta(type)` in `registry.ts:223` already has a `label`/`iconKey` per type — use this for UI labels rather than hardcoding "Google Drive" strings in the new Client Settings connector tile.

**Schema is already provider-agnostic.** The `Connector` model has `type ConnectorType` and the unique constraint will be `[type, userId, externalAccountId]` — this naturally separates Google and OneDrive rows for the same Supabase user.

---

## J. UI friction points

These are places where users are likely to be confused or surprised by the new model, and what the UI must communicate clearly:

| Friction point | Risk | Mitigation |
| --- | --- | --- |
| **Disconnect affects all sharers** | User disconnects from Client A expecting only that client to lose Drive; Client B also goes offline | Confirm dialog must list the names of all sharing clients, not just a count. "Disconnecting will affect: Client A, Client B." |
| **"Shared with N" badge** | User sees badge but doesn't know who the other clients are | Tooltip or expandable list of client names sharing this connector. Don't just show a number. |
| **Owner-edit fork dialog** | Two options with non-obvious consequences ("change for all" silently moves credentials for sibling clients) | Name the sibling clients in the dialog body, not just in a tooltip. Default selection should be "Only this client" to avoid surprise. |
| **No connector → empty state vs. sample content** | Real-but-unconnected clients show "Connect a Drive" CTA; sandbox clients show static samples. Users may expect Drive to be pre-connected after onboarding. | The empty state CTA must explain that storage is connected per client, not firm-wide. First-time copy: "Connect a Google Drive for this client to store and manage engagement files." |
| **Old firm folder orphan in Drive** | Prod user sees a now-unused firm folder sitting in their Drive root with no explanation | Not actionable in the app. Optional: show a one-time notice in Client Settings: "Your previous firm-level folder is no longer used by the app." |
| **Client Settings section placement** | Connector section is above the Danger zone but below other settings — users might scroll past it | Consider a "Storage" heading with a drive icon to make it visually distinct from the form fields above. |
| **OAuth popup from Client Settings** | Popup blocked by browser if triggered outside a user gesture | Ensure the "Connect Google Drive" button directly triggers `window.open` on click — no async gap before the open call. |

---

## Ordered implementation steps

Ratings: **Complexity** = effort + surface area touched. **Risk** = potential for data loss, prod breakage, or hard-to-reverse mistakes. Scale: Low / Medium / High / Critical.

| # | Step | Complexity | Risk | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Schema** (A): add `Client.connectorId` + `"ClientConnector"` relation + index, add `Connector.clients`, change unique to `[type, userId, externalAccountId]`. `prisma migrate dev --create-only`. | Medium | High | Unique constraint change is a DDL migration on a live table. Must run `--create-only` first and review the generated SQL before applying. The constraint drop+recreate locks the `connectors` table briefly. |
| 2 | **Backfill SQL** (A): append the sharing `UPDATE clients SET connectorId = firm.connectorId`. | Low | High | One-way write against prod data. Snapshot the `clients` table before running. Verify row count before and after (`SELECT count(*) WHERE connectorId IS NOT NULL`). Cannot be auto-reversed if incorrect. |
| 3 | **Resolver** (B): add `lib/connectors/resolve-client-connector.ts` (no firm fallback). | Low | Low | Pure additive — new file, no existing code changed. Only becomes load-bearing once step 6 swaps callers to use it. |
| 4 | **storeConnection + OAuth** (C): dedup by `(type,userId,externalAccountId)`, add `clientId`, link `Client.connectorId`, drop firm-link writes. | High | Critical | The single most dangerous step. Changing the `findFirst` dedup key incorrectly will silently overwrite a connector row for the wrong account. Drop of `firm.connectorId` writes here means any read-path still using `firm.connectorId` starts returning null. Must land atomically with step 6, or deploy behind a feature flag. |
| 5 | **Sharing actions** (C/D): `share` existing connector, owner-edit fork (change-for-all vs new-row), shared-aware disconnect/remove — as server actions in `lib/actions/client.ts` (auth `canManageClient`). | High | Medium | New logic surface. The fork dialog has two distinct DB paths; the wrong branch silently affects sibling clients. Shared disconnect is intentionally destructive — the UI warning must fire reliably before the server action executes. |
| 6 | **Read-path swaps** (B): `project.ts`, `project.service.ts`, `client.ts`, `search-service.ts`, `registry.ts`, `google-drive-connector.getConnections`. | Medium | High | Six call-sites, each mechanical but each a regression risk if missed. After this step, any client whose `connectorId` is null (not yet backfilled) will silently skip Drive ops. Must ship after step 2 (backfill). Two distinct `getConnections` functions (registry.ts vs google-drive-connector.ts) must both be updated independently. |
| 7 | **Remove firm page + nav** (E1): delete `d/f/[slug]/connectors/page.tsx`, remove `connectorsHref` and active-state checks (lines 371–372, 977); add redirect to `/d/f/[slug]`. Remove/repurpose firm connector API routes. | Low | Low | Pure deletion + redirect. Irreversible only in the sense that bookmarks break — the redirect handles that. Clean up both sidebar active-state exclusion lines, not just the nav link. |
| 8 | **Client Settings UI** (E2): connector tile above Danger zone in `client-settings-form.tsx`; extend props + page loader; reuse `components/google-drive/*`. | Medium | Low | UI-only, no DB writes in this step. Main complexity is threading `connectorId` + sharing info through page loader props and reusing existing Google Drive components without breaking them in the firm-page context they still served. |
| 9 | **Folder hierarchy** (G1): client folder parents at the connector workspace root (drop firm folder); add shared-connector name namespacing; retire `Firm.firmFolderId` reads; update `pockett-structure.service.ts` + `auto-import`. | High | Medium | `pockett-structure.service.ts` is complex and already has a fallback chain (`connector.settings.organizations[firmId]` → `firm.firmFolderId`). Removing the firm-folder creation changes where new client folders land in Drive — irreversible for any folder created post-deploy. Namespacing logic must be collision-safe for the shared-connector case. |
| 10 | **Sandbox DB-only** (G2): synchronous DB seeding; static sample file-list render for `sandboxOnly`; disable open/download/preview; remove `provisionSandboxHierarchyForFirm`, `setupOrgFolder`, sample-file Inngest job, `finalizeSandboxDriveConnectorAndIndexing`. | High | Low | High complexity (many files, async job removal, Inngest function deletion) but low risk — sandbox content is test data and the Drive provisioning path is being replaced, not patched. Net code reduction. Verify the static sample render covers all `sandboxOnly` engagement entry-points before deleting the Drive path. |
| 11 | **Onboarding** (G3): remove Steps 3 & 4 (Drive connect + async provisioning); wire `checkoutIntent` pre-selection in the billing step. | Medium | Low | Removing onboarding steps is safe (steps were async and failure-tolerant already). The `checkoutIntent` wiring is additive. Risk: if onboarding page state machine has guards that expect step 3/4 to exist, removing them can cause index-out-of-range bugs — audit step numbering carefully. |
| 12 | **Guards** (F#10): null-safe firm lookups in `root-migration` / `finalize` / `repair-org-folder`. | Low | Medium | Defensive hardening. Missing even one null-guard here means a background job crashes when it encounters a firm with no connector. Low effort but the consequence of missing a site is a silent job failure. |
| 13 | `prisma migrate dev` + `prisma generate`; run verification (§K). | Low | Medium | Final migration applies all pending changes to prod DB. Run in a maintenance window if possible given the `connectors` table lock in step 1. Verify backfill counts and spot-check folder resolution before re-enabling traffic. |

### Critical files
- `frontend/prisma/schema.prisma`
- `frontend/lib/connectors/resolve-client-connector.ts` (new)
- `frontend/lib/google-drive-connector.ts` (`storeConnection` ~1690, `getConnections` ~284)
- `frontend/app/api/connectors/google-drive/{route.ts,callback/route.ts}`
- `frontend/lib/actions/client.ts` (connector server actions) + `lib/actions/project.ts`,
  `lib/services/project.service.ts`, `lib/services/search-service.ts`, `lib/connectors/registry.ts`
- `frontend/components/projects/client-settings-form.tsx` (UI insert above Danger zone, line ~369)
- `frontend/components/app/app-sidebar.tsx` (remove `connectorsHref`, lines ~372, 977)
- `frontend/app/(app)/d/f/[slug]/connectors/page.tsx` (delete + redirect)
- `frontend/lib/connectors/pockett-structure.service.ts` (folder hierarchy: drop firm folder, G1) +
  `frontend/lib/services/auto-import.ts`
- `frontend/lib/onboarding/onboarding-helper.ts` (`provisionSandboxHierarchyForFirm` → DB-only seeding),
  `frontend/app/api/onboarding/create-sandbox/route.ts`, `frontend/app/(app)/d/onboarding/page.tsx`
  (remove Steps 3-4), `frontend/lib/inngest/functions.ts` (remove sample-file Drive job)
- `frontend/lib/services/sample-file-service.ts` + `sandbox-hierarchy.json` (static sample list source),
  `frontend/components/projects/project-file-list.tsx` (static render + download/open gate)
- `frontend/components/billing/billing-page-client.tsx` + `frontend/lib/marketing/checkout-intent.ts`
  (pre-select plan from Pricing intent, G3)

---

## L. Client Brand (per-client branding identity)

### L0. Context

Firm-level branding (`logoUrl`, `brandingSubtext`, `themeColorHex` columns + `settings.branding` JSONB) is removed. Each client owns its own brand record. Branding is **duplicated** (not shared) — a new DB row is inserted and the logo file is copied in Drive. The topbar shows the active client's brand; falls back to Firma default if none set.

---

### L1. DB Schema

New model in `frontend/prisma/schema.prisma` (`platform` schema):

```prisma
model Brand {
  id              String   @id @default(cuid())
  name            String                        // user-friendly label e.g. "DataSentry Firm Branding"
  clientId        String   @unique              // one active brand per client
  client          Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  sourceBrandId   String?                       // duplicated-from reference (null = original)
  isLocked        Boolean  @default(false)      // locked brands cannot be duplicated to other clients
  logoUrl         String?                       // /api/clients/[clientId]/brand/logo proxy
  logoAspectRatio String?
  subtext         String?
  primaryColor    String?
  secondaryColor  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("client_brands")
  @@schema("platform")
}
```

Add to `Client` model: `brand Brand?`

Remove from `Firm` model: `logoUrl`, `brandingSubtext`, `themeColorHex`

**Migration:** `npx prisma migrate dev --name client_brand --create-only`, then `npm run build` to apply.

```sql
CREATE TABLE "platform"."client_brands" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sourceBrandId" TEXT,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "logoUrl" TEXT,
  "logoAspectRatio" TEXT,
  "subtext" TEXT,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_brands_clientId_key" ON "platform"."client_brands"("clientId");
ALTER TABLE "platform"."client_brands"
  ADD CONSTRAINT "client_brands_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."firms"
  DROP COLUMN IF EXISTS "logoUrl",
  DROP COLUMN IF EXISTS "brandingSubtext",
  DROP COLUMN IF EXISTS "themeColorHex";
```

---

### L2. New API Routes

**`GET|POST|DELETE /api/clients/[clientId]/brand/logo`**

Mirrors `app/api/firms/[firmId]/logo/route.ts` but uses `Client.driveFolderId` + `Client.connectorId`. Logo stored at `[Client Name]/.meta/assets/logo.*` in Drive.

- GET: stream logo file from Drive
- POST: upload file, update `Brand.logoUrl`
- DELETE: trash Drive file, null `Brand.logoUrl`

**`GET|POST|PUT|DELETE /api/clients/[clientId]/brand`**

- GET: return `Brand` or null
- POST/PUT: upsert metadata (name, subtext, colors, logoAspectRatio)
- DELETE: delete brand record + trash logo

**`POST /api/clients/[clientId]/brand/duplicate`**

Body: `{ sourceBrandId: string, name: string }` (name required)

1. Load source `Brand` — verify it belongs to a client in the same firm
2. Reject if `isLocked`
3. Insert new `Brand` with `sourceBrandId`, `isLocked: false`, new `name`
4. If source has `logoUrl`: copy logo in Drive via adapter `copyFile` (fallback: download + reupload)
5. Set `logoUrl` → `/api/clients/[targetClientId]/brand/logo`
6. Return new `Brand`

---

### L3. Server Action

`upsertBrand` in `lib/actions/client.ts` — upserts on `clientId` uniqueness:
```ts
{ clientId, name, subtext?, primaryColor?, secondaryColor?, logoAspectRatio?, isLocked? }
```

---

### L4. UI Changes

**`components/projects/client-settings-form.tsx`** — new "Branding" section:

- "Brand name" text input (required, top of panel)
- Logo upload with aspect ratio picker (same design as current firm branding panel)
- Tagline / subtext
- Primary + accent color pickers
- Header preview
- "Duplicate from another client" button → modal lists all firm `Brand` records (excluding locked); user picks source + enters new name → calls duplicate endpoint
- Lock/unlock toggle (firm admins only)
- Entire section only renders when `connectorId` is set; otherwise shows "Set up Document Storage first" placeholder

**`components/projects/firm-settings-form.tsx`** — remove entire Branding column (logo upload, colors, tagline, canvas export, `handleRemoveLogo`, all branding state vars)

**`lib/use-firm-branding.ts`** — rename to `useActiveBranding`:

- Pathname includes `/c/[clientSlug]`: fetch `GET /api/clients/[clientId]/brand` → map to `OrganizationBranding`; fall back to Firma default if null
- Firm-only pathname: return Firma default immediately
- Cache key: client slug (was firm slug)

---

### L5. Cleanup

Files to update:

- Remove `logoUrl`, `brandingSubtext`, `themeColorHex` from `FirmWithMembers` in `lib/firm-service.ts`
- Remove `settings.branding` merge + `FirmBranding` interface from `lib/actions/firms.ts`
- Delete `app/api/firms/[firmId]/logo/route.ts`

---

### L6. Verification

1. Client Settings → Branding section renders; logo upload + colors save correctly
2. Topbar shows client brand inside `/c/[slug]`; Firma default elsewhere
3. Duplicate brand: source picker shows firm's brands (locked excluded); new record created; logo copied in Drive
4. Locked brand: duplicate button disabled for locked sources
5. Firm Settings: no Branding column
6. `npm run typecheck` — 0 errors; `npm test` — all pass

---

## Verification & Post-fix Testing

### K1. Schema & backfill (run once after `prisma migrate dev`)

- Confirm unique constraint changed: `\d platform.connectors` shows `[type, userId, externalAccountId]`.
- Confirm backfill:
  ```sql
  SELECT c.id, c."connectorId", f."connectorId" AS firm_connector
  FROM platform.clients c
  JOIN platform.firms f ON c."firmId" = f.id
  WHERE f."connectorId" IS NOT NULL
  LIMIT 20;
  ```
  All rows should have `c.connectorId = f.connectorId`. Rows where `f.connectorId IS NULL` should have `c.connectorId IS NULL`.
- Confirm existing `driveFolderId` and `connectorRootFolderId` values are **unchanged** on all clients/engagements (spot-check against pre-migration DB snapshot).

### K2. Per-client connect (different accounts)

As `firm_admin`: Client A → Client Settings → connect Drive account X. Client B → connect Drive account Y.

- Confirm two distinct `Connector` rows exist: same `userId`, different `externalAccountId`.
- Create an engagement in each client; confirm Drive folders land in the correct Drive account.
- Confirm no `firm.connectorId` is written (check DB: `SELECT "connectorId" FROM platform.firms WHERE id = '<firmId>'` should be unchanged / null after the refactor).

### K3. Shared connector (same account, multiple clients)

Client C → "Use an existing connection" → pick Drive X (already used by Client A).

- Confirm `clients.connectorId` for C equals A's connector id (one shared row, no new row created).
- Confirm the connector section shows "Shared with 2 clients" with client names in the tooltip/list.
- Create an engagement in Client C; confirm folder lands in Drive X with a namespaced name (`"<FirmName> — <ClientName>"`), not colliding with Client A's folder.

### K4. Owner-edit fork dialog

On a shared connector (Drive X, used by clients A and C):

- Choose "Change owning account" → "Only this client" → complete OAuth for a new account → confirm a new `Connector` row is created and only Client C repoints; Client A still references the original row.
- On a different shared connector → "Change for all" → confirm both clients move to the new row (same `connectorId`, updated `externalAccountId`/tokens).
- On a single-sharer connector → confirm the fork dialog is **not shown**; edit happens in place.

### K5. Shared disconnect

Disconnect Drive X from Client A (which is shared with Client C).

- Confirm the warning dialog lists Client C by name before proceeding.
- After disconnect: both clients show `REVOKED` status in the connector section.
- Confirm `disconnectConnection` revoked the Google OAuth grant (re-auth required) and marked the `Connector` row `REVOKED`.
- Confirm `Client.connectorId` for both A and C is now null (or connector row deleted, depending on implementation choice).

### K6. Permissions

- As `client_admin` (Client Partner): confirm the connector section in Client Settings is **visible and actionable** (connect, disconnect, share, edit).
- As `firm_admin`: same.
- As a non-member: confirm 403 / redirect.
- Confirm `/d/f/[slug]/connectors` redirects to `/d/f/[slug]` (not 404).
- Confirm the sidebar no longer shows the Connectors nav link.

### K7. No-connector client

- A client with no connector (`connectorId IS NULL`): Client Settings shows the "Connect a Drive" empty state CTA.
- Create an engagement for this client: confirm it completes without error; no Drive folder is created; no crash in `project.ts` (the `if (connectorId)` guard fires cleanly).

### K8. Onboarding (DB-only)

- Sign up as a new user; confirm onboarding completes **without any OAuth/Drive prompt**.
- Confirm sandbox clients/engagements/contacts are seeded instantly.
- In the Engagement files list for a sandbox engagement: static sample rows appear; open/download/preview buttons are **disabled or absent**.
- Create a real (non-sandbox) client: it shows the "Connect a Drive" empty state, not fake samples.

### K9. Folder hierarchy (new engagements)

- Connect a Drive to a client; create an engagement.
- In Drive: confirm the client folder is **directly under the workspace root** (no firm folder above it).
- With a shared connector across two clients: confirm each client has its own namespaced folder (`"FirmA — ClientA"`, `"FirmA — ClientB"`) — no collision.
- Pre-migration engagements (with `connectorRootFolderId` set): confirm file ops still resolve correctly via the existing `connectorRootFolderId`.

### K10. storeConnection dedup correctness

- Connect the same Google account to two different clients: confirm only **one** `Connector` row exists (the row is shared, not duplicated).
- Connect a **different** Google account (different `externalAccountId`) to a third client under the same firm user: confirm a **second** `Connector` row is created (different `externalAccountId`).
- Verify `storeConnection`'s `findFirst` matches on `{ type, userId, externalAccountId }` — test by reconnecting an existing account and confirming tokens update on the existing row.

### K11. Subscribe pre-select

- Arrive from Pricing page with "Standard" plan intent → confirm onboarding billing step opens with Standard **pre-selected**, not the free tier.

### K12. Static checks

```bash
pnpm typecheck
pnpm test
```

No new type errors. Existing tests pass. If tests covered `getConnections` or `storeConnection` with the old dedup key, update them to assert the new `[type, userId, externalAccountId]` behaviour.
