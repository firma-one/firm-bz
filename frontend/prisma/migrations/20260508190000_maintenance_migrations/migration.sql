-- ============================================================
-- Workspace migration tracking tables
-- ============================================================

CREATE TABLE "platform"."firm_workspace_migrations" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "firmId"                UUID NOT NULL,
    "connectorId"           UUID NOT NULL,
    "status"                TEXT NOT NULL,
    "oldRootFolderId"       TEXT,
    "newRootFolderId"       TEXT NOT NULL,
    "initiatedBy"           UUID NOT NULL,
    "initiatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    "graceEndsAt"           TIMESTAMPTZ,
    "maintenanceStartedAt"  TIMESTAMPTZ,
    "maintenanceEndedAt"    TIMESTAMPTZ,
    "estimatedMinutes"      INTEGER,
    "inngestRunId"          TEXT,
    "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "firm_workspace_migrations_pkey" PRIMARY KEY ("id")
);

-- Prisma @updatedAt: drop DB default so ORM manages it
ALTER TABLE "platform"."firm_workspace_migrations" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "platform"."firm_workspace_migration_files" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "migrationId" UUID NOT NULL,
    "fileId"      TEXT NOT NULL,
    "fileName"    TEXT,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "error"       TEXT,
    "attemptedAt" TIMESTAMPTZ,
    "movedAt"     TIMESTAMPTZ,

    CONSTRAINT "firm_workspace_migration_files_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "firm_workspace_migrations_firmId_idx" ON "platform"."firm_workspace_migrations"("firmId");
CREATE INDEX "firm_workspace_migrations_firmId_status_idx" ON "platform"."firm_workspace_migrations"("firmId", "status");

-- Prevent two concurrent active migrations per firm
CREATE UNIQUE INDEX "firm_workspace_migrations_firm_active_unique"
    ON "platform"."firm_workspace_migrations"("firmId")
    WHERE status IN ('pending_grace', 'in_progress');

CREATE INDEX "firm_workspace_migration_files_migrationId_idx" ON "platform"."firm_workspace_migration_files"("migrationId");
CREATE INDEX "firm_workspace_migration_files_migrationId_status_idx" ON "platform"."firm_workspace_migration_files"("migrationId", "status");

-- Foreign keys
ALTER TABLE "platform"."firm_workspace_migrations"
    ADD CONSTRAINT "firm_workspace_migrations_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform"."firm_workspace_migration_files"
    ADD CONSTRAINT "firm_workspace_migration_files_migrationId_fkey"
    FOREIGN KEY ("migrationId") REFERENCES "platform"."firm_workspace_migrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Notification scope — make firmId nullable for platform-wide
-- notifications and add scope column
-- ============================================================

-- Make firmId nullable to support PLATFORM-scoped notifications
ALTER TABLE platform.platform_notifications ALTER COLUMN "firmId" DROP NOT NULL;

-- Add scope column: PLATFORM | FIRM | CLIENT | ENGAGEMENT | DOCUMENT
ALTER TABLE platform.platform_notifications ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'FIRM';

-- Index for platform-scope queries (no firmId)
CREATE INDEX IF NOT EXISTS "platform_notifications_scope_userId_idx"
  ON platform.platform_notifications ("scope", "userId");
