-- RAID becomes Risks, Actions, Issues and Decisions (.claude/plans/raid-actions-memo-minutes.md). An Action has an
-- owner (the existing ownerUserId), a due date and no priority. ASSUMPTION stays in the enum for entries saved
-- before this; nothing new is created with it. followUp marks an Action Brio added for the firm itself (setting up
-- a new deliverable, preparing for a review point), which a memo's minutes leave out. Nothing to backfill.
--
-- Written by hand from `prisma migrate diff --from-schema-datamodel <before> --to-schema-datamodel
-- prisma/schema.prisma --script`, as the shadow database can't replay the older Supabase migrations.

-- CreateEnum
CREATE TYPE "platform"."RaidFollowUp" AS ENUM ('DELIVERABLE', 'PREPARE');

-- AlterEnum
ALTER TYPE "platform"."RaidItemType" ADD VALUE 'ACTION';

-- AlterTable
ALTER TABLE "platform"."engagement_raid_items" ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "followUp" "platform"."RaidFollowUp";
