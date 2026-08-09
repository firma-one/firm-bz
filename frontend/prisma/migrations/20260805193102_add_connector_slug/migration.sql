-- Add an immutable identity anchor to platform.connectors, independent of the
-- (type, userId, externalAccountId) triple that previously served as the sole dedup key.
-- That key silently merged "Add new connection" into an existing connector whenever the
-- same external account was reconnected, even when the user intended a second, independent
-- connector (e.g. a Personal-mode connector and a separate Shared-to-a-different-site
-- connector, both backed by the same Microsoft account). See
-- .claude/plans/connector-microsoft-impl.md (2026-08-06) for the full incident/rationale.

-- 1. Add the column nullable first so existing rows don't block the DDL.
ALTER TABLE "platform"."connectors" ADD COLUMN "slug" TEXT;

-- 2. Backfill a random, collision-safe slug for every existing row. Format mirrors
--    lib/slug-utils.ts's generateConnectorSlug() output shape ("conn-" + 8 random base36
--    chars) closely enough for consistency, without needing app code inside the migration.
UPDATE "platform"."connectors"
SET "slug" = 'conn-' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10)
WHERE "slug" IS NULL;

-- 3. Now that every row has a value, enforce NOT NULL + UNIQUE.
ALTER TABLE "platform"."connectors" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "connectors_slug_key" ON "platform"."connectors"("slug");

-- 4. Drop the old account-based uniqueness constraint that caused the bug — connectors are
--    no longer deduped by (type, userId, externalAccountId) alone. Keep a plain (non-unique)
--    index on the same columns since lookups by account are still common (e.g. reconnect's
--    account-mismatch guard), just no longer used to decide "is this the same connector".
ALTER TABLE "platform"."connectors" DROP CONSTRAINT IF EXISTS "connectors_type_userId_externalAccountId_key";
CREATE INDEX "connectors_type_userId_externalAccountId_idx" ON "platform"."connectors"("type", "userId", "externalAccountId");
