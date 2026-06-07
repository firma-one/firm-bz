-- Phase 1b: Multi-connector schema generalization
-- Renames Google-specific field/enum names to provider-neutral equivalents.
--
-- IMPORTANT: Run as a single transaction against a live database.
-- Postgres cannot rename enum values in-place, so the pattern is:
--   1. Add a temporary text column to hold the translated value
--   2. Populate it via CASE (old enum → new string)
--   3. Drop the old enum column
--   4. Create new enum type
--   5. Add the real column using the new enum type, populated from temp column
--   6. Drop the temp column
-- This avoids the type-mismatch problem of trying to cast to a new enum type
-- while the column still holds the old enum type.

BEGIN;

-- Step 1: Add a temporary text column to hold translated values
ALTER TABLE "platform"."connectors"
  ADD COLUMN "workspaceRootLocation_tmp" text;

-- Step 2: Translate old enum values to new string values (column still old type)
UPDATE "platform"."connectors"
SET "workspaceRootLocation_tmp" = CASE
  WHEN "workspaceRootLocation"::text = 'MY_DRIVE'     THEN 'PERSONAL'
  WHEN "workspaceRootLocation"::text = 'SHARED_DRIVE' THEN 'SHARED'
  ELSE NULL
END
WHERE "workspaceRootLocation" IS NOT NULL;

-- Step 3: Drop the old enum column (frees the old type dependency)
ALTER TABLE "platform"."connectors"
  DROP COLUMN "workspaceRootLocation";

-- Step 4: Drop old enum type, create new provider-neutral one
DROP TYPE "platform"."WorkspaceRootLocation";
CREATE TYPE "platform"."WorkspaceRootLocation" AS ENUM ('PERSONAL', 'SHARED');

-- Step 5: Add the real column with the new enum type, populated from temp column
ALTER TABLE "platform"."connectors"
  ADD COLUMN "workspaceRootLocation" "platform"."WorkspaceRootLocation";

UPDATE "platform"."connectors"
SET "workspaceRootLocation" = "workspaceRootLocation_tmp"::"platform"."WorkspaceRootLocation"
WHERE "workspaceRootLocation_tmp" IS NOT NULL;

-- Step 6: Drop the temp column
ALTER TABLE "platform"."connectors"
  DROP COLUMN "workspaceRootLocation_tmp";

COMMIT;

-- Steps 7-9: Rename Google Drive-specific column names to provider-neutral equivalents.
-- These run in their own transaction so a failure here doesn't leave the enum migration
-- in an ambiguous state, and vice versa.
BEGIN;

ALTER TABLE "platform"."connectors"
  RENAME COLUMN "workspaceRootSharedDriveId" TO "workspaceRootSharedStorageId";

ALTER TABLE "platform"."connectors"
  RENAME COLUMN "workspaceRootSharedDriveName" TO "workspaceRootSharedStorageName";

-- Rename googlePermissionId → connectorPermissionId
ALTER TABLE "platform"."engagement_document_sharing_users"
  RENAME COLUMN "googlePermissionId" TO "connectorPermissionId";

COMMIT;
