-- UI v2 foundations — see .claude/plans/ui-ux-overhaul.md (Phase 0).
--
-- 1. user_personalizations.uiPrefs: per-user UI preferences, starting with the "New UI" toggle
--    ({ shell: 'v1' | 'v2' }). One JSON column, matching bookmarks / reminders / notificationPrefs,
--    so later UI preferences (sidebar state, last tab per engagement) need no further migration.
-- 2. user_recent_visits: server-side recents. Today recents live in per-device, per-firm
--    localStorage and open the engagement's Overview; this table records the exact path (tab,
--    folder, document hash) so Home can offer "Continue where you left off" on any device and
--    sign-in can land on the last-visited firm. One row per (user, entity), bumped on revisit and
--    pruned to the newest 50 per user by the writer. entityId is polymorphic (no FK) — readers
--    re-check access and drop rows whose entity is gone. The firm FK cascades so a deleted firm
--    takes its rows with it.
--
-- Generated with `prisma migrate diff` (schema → schema) rather than `migrate dev --create-only`:
-- the shadow database cannot replay this project's earlier migrations, which reference Supabase's
-- auth.users.

-- CreateEnum
CREATE TYPE "platform"."RecentVisitEntityType" AS ENUM ('firm', 'client', 'engagement', 'document');

-- AlterTable
ALTER TABLE "platform"."user_personalizations" ADD COLUMN "uiPrefs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "platform"."user_recent_visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "entityType" "platform"."RecentVisitEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "visitedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recent_visits_pkey" PRIMARY KEY ("id")
);

-- Serves Home's per-firm "Continue" list (newest first).
CREATE INDEX "user_recent_visits_userId_firmId_visitedAt_idx" ON "platform"."user_recent_visits"("userId", "firmId", "visitedAt" DESC);

-- One row per entity per user; also the upsert target for recordVisit.
CREATE UNIQUE INDEX "user_recent_visits_userId_entityType_entityId_key" ON "platform"."user_recent_visits"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "platform"."user_recent_visits" ADD CONSTRAINT "user_recent_visits_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "platform"."firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
