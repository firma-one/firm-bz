# OneDrive Connector Support — Analysis & Plan

> Related: [docs/mvp/todo.md](../../docs/mvp/todo.md) — see "Connector: OneDrive Support" and "Connector: Replace Owning Account"

## Context

The codebase currently supports Google Drive as the primary (and only) live cloud storage connector. OneDrive is listed in the enum and has stub files ready, but is marked `disabled: true / comingLater: true` in the UI. The architecture has strong abstractions at the data/service layer but the routing, background jobs, and UI are tightly coupled to Google Drive specifically.

This plan covers two related workstreams, both delivered across two phases:
- **Replace Owning Account** — let a firm admin swap the Google account on an existing connector without losing the Drive workspace
- **Additional Provider Support (OneDrive)** — generalize the connector layer then implement OneDrive on top

This plan is split into two phases:
- **Phase 1:** Replace-owner feature + generalize/abstract existing code to be multi-connector ready (no OneDrive logic yet)
- **Phase 2:** Implement the actual OneDrive connector on top of the generalized foundation

---

## Current Code Scalability

**Already well-abstracted (no changes needed):**
- `ConnectorType` enum already includes `ONEDRIVE`, `DROPBOX`, `BOX`
- `IConnectorStorageAdapter` and `IConnectorInstance` interfaces are provider-agnostic
- `PockettStructureService` — zero changes needed, fully storage-agnostic
- `Connector` table with `settings: Json` absorbs provider-specific metadata
- Registry dispatch in `registry.ts` already routes by DB `type` field
- OneDrive stubs exist: [onedrive-connector.ts](frontend/lib/connectors/onedrive-connector.ts), [onedrive-adapter.ts](frontend/lib/connectors/adapters/onedrive-adapter.ts)

**Hardcoded / needs generalization before OneDrive can land cleanly:**
- `connectors/page.tsx` — UI tabs are a hardcoded string array; GDrive-specific component imports
- `lib/inngest/functions.ts` — calls `googleDriveConnector.*` directly, not via registry
- `grant-engagement-drive-folder-access.ts` — calls Google Drive connector directly
- `EngagementDocumentSharingUser.googlePermissionId` — provider name in field
- `workspaceRootLocation` enum (`MY_DRIVE`/`SHARED_DRIVE`) — Google-specific concept in DB
- OAuth success query params (`success === 'google_drive_connected'`) — hardcoded string

---

## Phase 1 — Generalize & Abstract (No OneDrive Yet)

**Goal:** Refactor existing GDrive-specific code paths so a second connector can plug in without forking logic. All existing GDrive behavior must be preserved exactly — this phase has zero new features, only structural cleanup.

### 1a — Replace Owning Account (GDrive-specific feature)

Deliver the replace-owner feature while the codebase is still GDrive-only — before the UI refactor in 1b makes `connectors/page.tsx` more complex to work in.

| Area | Exact Work | Files |
|------|-----------|-------|
| OAuth state | Accept `replaceConnectorId` in POST body, encode it in the base64 state object passed to Google | `app/api/connectors/google-drive/route.ts` |
| OAuth callback | On `replaceConnectorId` present: revoke old connector (`status=REVOKED`, clear tokens, `firmId=null`), link new connector to firm | `app/api/connectors/google-drive/callback/route.ts` |
| `storeConnection()` | Also write `externalAccountId` on update so it stays in sync when the account changes | `lib/google-drive-connector.ts` (~line 1740) |
| UI | Add "Replace account" button alongside Test/Reconnect/Disconnect; confirmation `AlertDialog` before OAuth popup opens | `app/(app)/d/f/[slug]/connectors/page.tsx` (~line 544) |

**Complexity:** Low-Medium — 4 files, all changes are additive or small targeted edits. The callback logic requires care to avoid double-linking, but the flow is well-defined.

**Effort:** 1–2 days

**Regression risk:**

| File | Risk | Why |
|------|------|-----|
| `callback/route.ts` | **Medium** | Replace vs reconnect branch must not corrupt existing connectors |
| `google-drive-connector.ts` | **Low** | One-line addition to upsert |
| `connectors/page.tsx` | **Low** | Additive UI only |

**Verification:**
1. Replace with a different Google account → new email/avatar shown, old connector `status=REVOKED`, `firmId=null`
2. Replace with the same Google account → tokens refreshed in-place, no duplicate record
3. Drive workspace folders unchanged after replace
4. Reconnect (existing flow) still works unaffected

---

### 1b — Generalize & Abstract (multi-connector prep)

### What changes (with exact scope):

| Area | Exact Work | Nature | Files |
|------|-----------|--------|-------|
| Inngest jobs — 16 call sites | Replace direct `googleDriveConnector.*` calls with registry dispatch across 7 functions (`scanAndIndexProject`, `reconcileFileDeletion`, `reconcileFolderDeletion`, `revokeProjectSharing`, `revokeByDisabledPersona`, `revokeByMemberPersonaChange`, `grantPermissionsForNewMember`). Mostly mechanical swaps. | Mostly mechanical | `lib/inngest/functions.ts` (1,223 lines) |
| Workspace root migration — Inngest | `migrateWorkspaceRoot` function (lines 888–994) calls 3 GDrive-specific methods: `listTopLevelChildren`, `moveBatch` (Drive Batch API), `persistWorkspaceRootLocation` (detects MY_DRIVE vs SHARED_DRIVE via `driveId` field). None of these exist on `IConnectorStorageAdapter`. Must extend the adapter interface or add a new `IConnectorMigrationAdapter` for move operations. | Interface design required | `lib/inngest/functions.ts`, `lib/connectors/types.ts` |
| Workspace root migration — API | `migrate-and-update-root` and `estimate-migration` actions in the GDrive API route are tightly coupled to Drive query syntax and `driveId` field. Must be abstracted or moved behind a per-connector handler. | Logic redesign | `app/api/connectors/google-drive/route.ts` |
| Workspace root migration — DB schema | `WorkspaceRootLocation` enum values (`MY_DRIVE`, `SHARED_DRIVE`) are GDrive concepts. For OneDrive the equivalent is personal drive vs SharePoint Site. Must rename enum values to be provider-neutral (`PERSONAL`, `SHARED`) and rename `workspaceRootSharedDriveId` → `workspaceRootSharedStorageId`, `workspaceRootSharedDriveName` → `workspaceRootSharedStorageName`. Also tracked in `FirmWorkspaceMigration` and `FirmWorkspaceMigrationFile` models — these are already provider-agnostic. | Migration required | `prisma/schema.prisma` |
| Workspace root migration — UI | `GoogleDriveWorkspaceRoot` component (631 lines) is entirely GDrive-specific: Google Picker integration, shared drive display, Drive-specific location badges. Must be extracted behind a connector-type gate in `connectors/page.tsx` (lines 590–623). The component itself stays GDrive-only for now — abstraction deferred to Phase 2 when OneDrive workspace root UI is built. | Extraction only | `connectors/page.tsx`, `components/google-drive/google-drive-workspace-root.tsx` |
| Permission grants — 2 call sites | Abstract `getProjectFolderIds()` — encodes GDrive engagement folder structure (general/confidential/staging). Must define a connector-agnostic `EngagementFolderIds` type and per-connector discovery. | Logic redesign | `lib/grant-engagement-drive-folder-access.ts` (52 lines) |
| UI tab data-driven | Replace hardcoded connector array (12 string literals, 6 GDrive-specific imports). Tab content (lines 445–662) is a monolith — extract into `<GoogleDriveConnectorTab>` with registry-based component lookup. | Logic redesign | `connectors/page.tsx` (699 lines) |
| DB schema — permissions | Rename `EngagementDocumentSharingUser.googlePermissionId` → `connectorPermissionId`. | Migration required | `prisma/schema.prisma` |
| Registry metadata | Add `getConnectorMeta()` returning `{ label, icon, enabled }` — ~20 lines. | Mechanical | `lib/connectors/registry.ts` (152 lines) |

### Why 5–8 days (not 1–2)

The scope looks small on paper but the workspace root migration feature alone is a significant abstraction challenge:

**1. Workspace root migration abstraction (2–3 days)**
The `migrateWorkspaceRoot` Inngest function calls three methods that are deeply GDrive-specific and don't exist on `IConnectorStorageAdapter`:
- `listTopLevelChildren()` — uses Drive query syntax (`'${id}' in parents and trashed = false`)
- `moveBatch()` — uses the Google Drive Batch API (`addParents`/`removeParents`, multipart response parsing, shared drive support)
- `persistWorkspaceRootLocation()` — detects `MY_DRIVE` vs `SHARED_DRIVE` by checking the Drive API `driveId` field

These can't be mapped to the existing 13-method `IConnectorStorageAdapter` interface. The right move is to define a new `IConnectorMigrationAdapter` interface (or extend the existing one) and implement it for GDrive first, then OneDrive in Phase 2. The API route (`estimate-migration`, `migrate-and-update-root`) also needs to route to the correct provider. The DB enum values (`MY_DRIVE`, `SHARED_DRIVE`) need renaming to provider-neutral terms.

**2. Inngest — 16 remaining call sites across 7 functions (1–1.5 days)**
Mechanical swaps but must be tested per-function. Separate from `migrateWorkspaceRoot` which is treated as its own sub-task.

**3. Permission grants — `getProjectFolderIds()` abstraction (1 day)**
Only 52 lines but requires designing a new `EngagementFolderIds` type — a design task.

**4. connectors/page.tsx — UI component extraction (1.5–2 days)**
699 lines. Tab content (lines 445–662) including workspace migration UI (lines 590–623) must be extracted into a per-provider component. The `GoogleDriveWorkspaceRoot` component itself (631 lines, Google Picker integration) stays GDrive-only — the work here is just gating it correctly.

**5. Prisma migrations (0.5–1 day)**
Two separate migrations: rename `googlePermissionId` + rename `WorkspaceRootLocation` enum values and workspace root fields. Each requires auditing all query sites.

### Complexity

| Area | Complexity | Change Type |
|------|-----------|-------------|
| Workspace root migration abstraction | **High** | Interface design — 3 GDrive methods with no generic equivalent |
| Workspace root DB schema | **Medium** | Enum rename + field renames, 2 migrations |
| Workspace root UI extraction | **Medium** | Extract into provider-gated component; component itself unchanged |
| Inngest 16 call sites (non-migration) | **Medium** | Mostly mechanical; must test each function |
| Permission grant abstraction | **Medium-High** | Logic redesign — `getProjectFolderIds()` is GDrive-specific |
| UI tab data-driven | **Medium-High** | Logic redesign — 699-line page with monolithic tab content |
| Permissions DB schema | **Low-Medium** | Field rename + migration |
| Registry `getConnectorMeta()` | **Low** | Purely additive, ~20 lines |

### Effort: 5–8 engineering days

### Regression Risk

| File | Risk | Why |
|------|------|-----|
| `lib/inngest/functions.ts` — `migrateWorkspaceRoot` | **High** | Live migration job — any regression loses files or leaves workspace in a broken state |
| `lib/inngest/functions.ts` — other 16 call sites | **High** | Live production jobs; mistakes break file indexing and permission grants for all users |
| `grant-engagement-drive-folder-access.ts` | **Medium-High** | Permissions grant path fails silently — users lose engagement folder access without obvious errors |
| `app/api/connectors/google-drive/route.ts` | **Medium-High** | `migrate-and-update-root` and `estimate-migration` actions — errors corrupt workspace root state |
| `prisma/schema.prisma` migrations | **Medium** | Two separate migrations (enum rename + field renames); missed query site = runtime error |
| `connectors/page.tsx` | **Medium** | Extracting tab + workspace migration UI; wrong component boundaries break GDrive tab state |
| `lib/connectors/types.ts` | **Low-Medium** | Extending `IConnectorStorageAdapter` or adding new interface — type errors surface at build time |
| `lib/connectors/registry.ts` | **Low** | Additive only — adding `getConnectorMeta()` doesn't touch dispatch logic |

**Key safeguard:** `migrateWorkspaceRoot` was intentionally left untouched in Phase 1b. It is the sole remaining GDrive-specific Inngest function and requires its own design phase (1c) before any implementation begins.

**Also intentionally left GDrive-specific:** `populateSandboxSampleFiles` calls `googleDriveConnector.createGoogleDriveAdapter` directly. Sandbox population is inherently GDrive-only behavior — there is no generic equivalent and no OneDrive sandbox — so abstracting it is not required.

### Data Migrations (DML)

The migration is at `prisma/migrations/20260604100000_multi_connector_schema_rename/migration.sql`.

**Why a temp-column pattern instead of a direct USING cast:**
PostgreSQL cannot cast between two enum types directly in `ALTER COLUMN ... TYPE ... USING`. The naive pattern (create new enum, cast column via USING) fails at runtime because the old column type creates a dependency that blocks `DROP TYPE`. The correct pattern is:

1. Add a temp text column
2. Translate old enum values into it via CASE (`MY_DRIVE → PERSONAL`, `SHARED_DRIVE → SHARED`, `NULL → NULL`)
3. Drop the old enum column (removes the type dependency)
4. Drop the old enum type, create the new one
5. Add the real column with the new enum type, populate from temp column
6. Drop the temp column

The whole sequence runs in a single `BEGIN`/`COMMIT` transaction — if anything fails mid-way, the database rolls back to its original state.

**Execution order:**
1. Run migration SQL (all steps are in one transaction)
2. Run `prisma generate` to regenerate the client
3. Deploy updated application code

### Regression Tests (Phase 1a + 1b gate)
1. GDrive OAuth connect → callback → workspace accessible (unchanged)
2. Replace account: new email shown, old connector `status=REVOKED` and `firmId=null`, workspace unchanged
3. File import (copy + shortcut mode) completes successfully
4. Inngest `processIndexFileIntake` and `processIndexFilesInFolder` complete without errors
5. Engagement folder permission grants work for GDrive connectors
6. Verify `workspaceRootLocation` value on connector record reads `PERSONAL` or `SHARED`
7. `tsc --noEmit` passes clean

---

## Phase 1c — Migrate `migrateWorkspaceRoot` to Registry

**Goal:** The one remaining GDrive-specific Inngest function. This is the highest-regression-risk change in the entire plan — a broken workspace migration loses files or leaves a workspace permanently locked. It must be treated as its own design + implementation sub-task, not batched with anything else.

**Why it wasn't done in 1b:** `migrateWorkspaceRoot` calls three methods that have no generic equivalent in `IConnectorStorageAdapter` or `IConnectorPermissionAdapter`:
- `listTopLevelChildren(connectionId, parentId)` — uses Drive query syntax
- `moveBatch(connectionId, batch, oldParent, newParent)` — uses the Drive Batch API (`addParents`/`removeParents`), multipart response parsing, shared drive support
- `persistWorkspaceRootLocation(connectionId, rootFolderId)` — detects `PERSONAL` vs `SHARED` by inspecting Drive API `driveId` field

None of these belong on a generic storage adapter. They are migration-specific, destructive, and provider-specific in their implementation.

### Interface Design (do this first, review before implementing)

Define `IConnectorMigrationAdapter` in `lib/connectors/types.ts`:

```typescript
export interface IConnectorMigrationAdapter {
  /** List the direct children (one level deep) of a folder. Returns file IDs only. */
  listTopLevelChildren(connectionId: string, parentFolderId: string): Promise<string[]>
  /**
   * Move a batch of items from oldParent to newParent.
   * Returns failures (items that could not be moved) for partial-failure tracking.
   */
  moveBatch(
    connectionId: string,
    fileIds: string[],
    oldParentFolderId: string,
    newParentFolderId: string
  ): Promise<{ failures: { id: string; error: string }[] }>
  /**
   * Inspect the new root folder and persist PERSONAL vs SHARED on the connector record.
   * Called after all moves complete.
   */
  persistWorkspaceRootLocation(connectionId: string, rootFolderId: string): Promise<void>
}
```

**Design decisions to resolve before implementing:**
1. Should `IConnectorMigrationAdapter` extend `IConnectorPermissionAdapter`, or be entirely separate? (Recommendation: separate — migration is a one-shot admin op, not a per-request op)
2. Does `moveBatch` need a `dryRun` flag for the estimate step, or should `estimate-migration` stay GDrive-specific behind a connector-type guard in the API route?
3. `persistWorkspaceRootLocation` currently reads Drive API metadata to detect `driveId` (shared drive indicator). For OneDrive the equivalent is checking if the item lives in a personal drive vs a SharePoint site. The method signature is provider-agnostic but the internal implementation is entirely different — confirm this is acceptable before proceeding.

### What changed

| Area | Work | Files |
|------|------|-------|
| Interface | `IConnectorMigrationAdapter` added to `lib/connectors/types.ts` — 3 methods: `listTopLevelChildren`, `moveBatch`, `persistWorkspaceRootLocation` | `lib/connectors/types.ts` |
| Registry | `getMigrationAdapter(connectionId)` added — dispatches to GDrive impl, wraps all 3 methods | `lib/connectors/registry.ts` |
| Inngest | 3 direct `googleDriveConnector.*` calls in `migrateWorkspaceRoot` replaced with `getMigrationAdapter`. `getAccessToken` pre-flight now routes through `getConnectorInstance` (already on `IConnectorInstance`) | `lib/inngest/functions.ts` |
| API route — `migrate-and-update-root` | `persistWorkspaceRootLocation` call replaced with `getMigrationAdapter(connId).persistWorkspaceRootLocation(...)` | `app/api/connectors/google-drive/route.ts` |
| API route — `estimate-migration` | Gated behind explicit `connector.type !== 'GOOGLE_DRIVE'` check with a clear 400 error — it uses Drive query syntax directly and has no generic equivalent | `app/api/connectors/google-drive/route.ts` |

**Design decision recorded:** `estimate-migration` stays GDrive-specific behind a type guard. It directly constructs a Drive API query (`'${id}' in parents and trashed = false`) — abstracting this would require a `countChildren(connectionId, folderId)` method on the migration adapter, which is only worth adding when a second provider needs it.

**Also confirmed:** `populateSandboxSampleFiles` retains its direct `googleDriveConnector.createGoogleDriveAdapter` call. Sandbox population is GDrive-only — no abstraction needed.

### Regression Tests (Phase 1c gate)
1. Full workspace migration E2E: initiate → grace period → maintenance mode → files moved → root updated → workspace unlocked
2. Partial failure case: one file fails to move → failure recorded, workspace still unlocks
3. `estimate-migration` returns correct item count and time estimate
4. GDrive connect + workspace access still works after the refactor (Phase 1a/1b regression)
5. `tsc --noEmit` passes clean ✓

---

## Phase 2 — OneDrive Implementation

**Goal:** Implement the actual OneDrive connector using the clean foundation from Phase 1. All new code; no changes to GDrive paths.

### What's built:

| Area | Work | Files |
|------|------|-------|
| Azure AD setup | App registration, OAuth scopes (`Files.ReadWrite`, `User.Read`), redirect URI config | Infrastructure (not code) |
| Env config | Add `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET`, `ONEDRIVE_TENANT_ID`, `ONEDRIVE_REDIRECT_URI` | `lib/config.ts`, `.env` |
| OneDrive connector | Full `IConnectorInstance` implementation replacing stub: `initiateConnection`, `getAccessToken`, `refreshAccessToken`, `getConnections`, `disconnectConnection` | `lib/connectors/onedrive-connector.ts` |
| OAuth routes | `/api/connectors/onedrive/route.ts` (initiate) + `/api/connectors/onedrive/callback/route.ts` | New files |
| Storage adapter | Full `IConnectorStorageAdapter` implementation (13 methods) via Microsoft Graph API | `lib/connectors/adapters/onedrive-adapter.ts` |
| Registry wiring | Add `ONEDRIVE` cases in `getConnectorInstanceByType()` and `getStorageAdapter()` | `lib/connectors/registry.ts` |
| UI components | `OneDriveWorkspaceRoot`, OneDrive File Picker SDK integration, OneDrive icon | New components |
| UI — enable tab | Remove `disabled/comingLater` from OneDrive entry; wire up OAuth initiate | `connectors/page.tsx` |

### Complexity

| Area | Complexity | Notes |
|------|-----------|-------|
| Microsoft OAuth (MSAL/Azure AD) | **High** | Tenant IDs, consent flows, different token endpoint, PKCE requirements, refresh token handling differ significantly from Google |
| Graph API storage adapter | **High** | Structurally different from Drive v3: `driveId`+`itemId` references, `@microsoft.graph.downloadUrl`, chunked upload session API, no `appProperties` equivalent, Delta query for sync |
| File picker | **High** | OneDrive Picker SDK is an iframe-based flow, completely different from Google Picker JS library |
| Permission model | **High** | Graph API uses invite-based sharing with `roles: ['read'/'write']`; no equivalent to Drive's direct `permissions.create` with email |
| SharePoint/OneDrive workspace root | **Medium-High** | Personal OneDrive vs SharePoint Sites — must decide how to map to existing `workspaceRootLocation` concept |
| OAuth routes | **Medium** | Parallel structure to GDrive routes; main complexity is Azure-specific state/nonce handling |
| Registry wiring | **Low** | Additive only |
| UI components | **Medium** | New components but follow existing GDrive component patterns |

### Effort: 10–14 engineering days

### Regression Risk

| File | Risk | Why |
|------|------|-----|
| `lib/connectors/registry.ts` | **Medium** | Adding new switch cases — a typo or wrong return type breaks the dispatch for both connectors |
| `connectors/page.tsx` | **Low-Medium** | Enabling OneDrive tab; GDrive tab content is separate and should be unaffected |
| All new OneDrive files | **Low** | Net-new code, no GDrive paths touched |
| `prisma/schema.prisma` | **Low** | May need OneDrive-specific fields; existing records unaffected |

**Key safeguard:** Phase 2 is almost entirely additive. The only shared code touched is `registry.ts` (2 switch cases) and `connectors/page.tsx` (enabling a previously-disabled tab). GDrive regression risk is minimal.

### Regression Tests (Phase 2 gate)
1. Full OneDrive E2E: connect → set workspace root → import org folder → verify PockettMeta sync
2. Permission grant for an engagement with OneDrive connector
3. Full GDrive regression suite (same as Phase 1 gate — must still pass)
4. `npm run build` and `npm test` pass clean

---

## Total Effort Summary

| Phase | Sub-task | Effort | Risk Profile |
|-------|----------|--------|-------------|
| Phase 1a | Replace Owning Account | 1–2 days | Low-Medium (targeted, additive) |
| Phase 1b | Generalize existing code | 4–6 days | Medium-High (touching live production paths) |
| Phase 2 | OneDrive implementation | 10–14 days | Low-Medium (mostly new code) |
| **Total** | | **~15–22 days** | |

**Sequencing note:** Do 1a before 1b — the replace-owner feature is smaller and self-contained, and it's easier to implement while `connectors/page.tsx` is still in its current form before the multi-provider refactor in 1b.

**Counterintuitive insight:** Phase 1b carries higher regression risk than Phase 2, despite being smaller in scope. It modifies live production paths (Inngest jobs, permissions). Phase 2 is largely additive.
