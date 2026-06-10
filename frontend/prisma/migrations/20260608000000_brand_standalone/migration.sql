-- Make Brand a standalone entity: no FK to clients or firms.
-- Brand is now referenced by ID via settings JSON on Firm/Client records.
-- Adds logoData (base64 blob). Removes unused sourceBrandId and isLocked.

-- 1. Drop FK constraint and unique index on clientId
ALTER TABLE "platform"."brands" DROP CONSTRAINT IF EXISTS "brands_clientId_fkey";
DROP INDEX IF EXISTS "platform"."brands_clientId_key";

-- 2. Make clientId nullable (preserved for data migration only)
ALTER TABLE "platform"."brands" ALTER COLUMN "clientId" DROP NOT NULL;

-- 3. Drop unused columns
ALTER TABLE "platform"."brands" DROP COLUMN IF EXISTS "sourceBrandId";
ALTER TABLE "platform"."brands" DROP COLUMN IF EXISTS "isLocked";

-- 4. Add logoData column for base64 blob storage (replaces Drive-based logoUrl)
ALTER TABLE "platform"."brands" ADD COLUMN IF NOT EXISTS "logoData" TEXT;

-- 5. Data migration: write each brand's id into its client's settings JSON
--    so existing branding is preserved after the FK is severed.
UPDATE "platform"."clients" c
SET settings = jsonb_set(
    COALESCE(c.settings, '{}'::jsonb),
    '{brandId}',
    to_jsonb(b.id)
)
FROM "platform"."brands" b
WHERE b."clientId" = c.id
  AND b."clientId" IS NOT NULL;

-- 6. Clear clientId — column stays nullable but is no longer used
UPDATE "platform"."brands" SET "clientId" = NULL;
