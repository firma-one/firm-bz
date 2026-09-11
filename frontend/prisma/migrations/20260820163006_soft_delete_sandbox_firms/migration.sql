-- Soft-delete every sandbox/demo firm (isAnchor = true, Prisma-aliased as sandboxOnly) and its
-- clients/engagements, now that the DB-backed per-user sandbox firm is retired in favor of the
-- static, unauthenticated /demo route (see .claude/plans/sandbox-firm-removal.md, Step 4).
--
-- Soft delete only — sets deletedAt (deletedBy left NULL: this is an automated data migration,
-- not a specific user's action, and deletedBy has no "system actor" convention in this schema).
-- Rows are NOT hard-deleted: FK cascade deletion is available but not used here, so this remains
-- reversible (a follow-up migration could NULL deletedAt back out) and preserves audit history.
--
-- Note: getUserFirms()/FirmService.getUserFirms() already filter sandbox firms out via
-- isAnchor = false, so this migration does not change what any user currently sees — it only
-- marks the already-unreachable rows as deleted for consistency with the rest of the schema's
-- soft-delete convention, and to signal intent clearly to anyone reading the data directly.

UPDATE "platform"."engagements"
SET "deletedAt" = now()
WHERE "firmId" IN (SELECT id FROM "platform"."firms" WHERE "isAnchor" = true)
  AND "deletedAt" IS NULL;

UPDATE "platform"."clients"
SET "deletedAt" = now()
WHERE "firmId" IN (SELECT id FROM "platform"."firms" WHERE "isAnchor" = true)
  AND "deletedAt" IS NULL;

UPDATE "platform"."firms"
SET "deletedAt" = now()
WHERE "isAnchor" = true
  AND "deletedAt" IS NULL;
