# Cleanup: Connector Client-Level Refactor — Legacy Removal

## Context

The connector ownership refactor (dev branch, Jun 2026) moved Drive connector ownership from Firm → Client level.
`Client.connectorId` + `Client.driveFolderId` are now the authoritative sources.
Two legacy data paths remain in place intentionally pending production stability confirmation.

---

## What to Clean Up

### 1. `connector.settings.clientFolderIds[slug]` (pockett-structure.service.ts)

**Current state:** `ensureAppFolderStructure` resolves `clientFolderId` from `connector.settings.organizations[orgId].clientFolderIds[slug]` (line ~641). It also writes back to both `Client.driveFolderId` and this settings path, keeping them in sync.

**Target state:** Read `clientFolderId` directly from `Client.driveFolderId` (single source of truth). Remove the `connector.settings.clientFolderIds` read/write path.

**Pre-condition:** All production clients must have `driveFolderId` set. Verify with:
```sql
SELECT COUNT(*) FROM platform.clients
WHERE "connectorId" IS NOT NULL AND "driveFolderId" IS NULL AND "deletedAt" IS NULL;
```
Must return 0 before removing the fallback.

**Files to change:**
- `lib/connectors/pockett-structure.service.ts` — `ensureAppFolderStructure`: read from `Client.driveFolderId`, stop writing to `connector.settings.clientFolderIds`
- `lib/connectors/pockett-structure.service.ts` — `getProjectFolderIds`: same

---

### 2. `Firm.connectorId` legacy FK

**Current state:** `Firm.connectorId` still exists on the `firms` table and in `schema.prisma`. The `getConnections()` function in `registry.ts` unions both `firm.connectors` (new `firmId` relation) and `firm.connector` (legacy FK) to avoid missing connectors during transition.

**Target state:** Remove `Firm.connectorId` FK entirely. All connector reads go through `Client.connectorId`.

**Pre-condition:** Confirm no active code path reads `firm.connectorId` directly outside the union in `registry.ts`. Grep for `firm.connectorId`, `firm.connector` (singular), `LegacyFirmConnector`.

**Files to change:**
- `prisma/schema.prisma` — remove `connectorId` field and `LegacyFirmConnector` relation from `Firm` model
- `lib/connectors/registry.ts` — simplify `getConnections()` to remove legacy union
- New migration: `ALTER TABLE platform.firms DROP COLUMN "connectorId"`

---

### 3. `connector.settings.orgFolderId` redundancy

**Current state:** `orgFolderId` is stored in both `Firm.firmFolderId` (DB column) and `connector.settings.orgFolderId`. `ensureAppFolderStructure` already prefers `Firm.firmFolderId` with `connector.settings` as fallback.

**Target state:** Read exclusively from `Firm.firmFolderId`. Stop writing to `connector.settings.orgFolderId`.

**Pre-condition:** Confirm all firms have `firmFolderId` set in DB.

---

## When to Do This

After the connector client-level refactor has been **live in production for at least 2 weeks** with no reported folder resolution issues. This is a quality/maintenance cleanup, not urgent.

## Verification

1. `npm run typecheck` — 0 errors
2. `npm test` — all tests pass
3. File upload flow works end-to-end for new and existing clients
4. `Client.driveFolderId` populated correctly after new connector connection
