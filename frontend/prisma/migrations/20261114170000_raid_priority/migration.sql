-- RAID priority: High, Medium or Low on Risks and Issues (.claude/plans/brio-features-round-2.md, section 14).
--
-- Set from the Health score's own grade of the signal for STATUS and HEALTH entries, proposed by Brio for
-- THREAD and MEMO suggestions, or chosen by a person, whose choice (prioritySetBy) the sync never changes.
-- Null for Assumptions and Decisions. No backfill: an older Risk or Issue with no priority reads as Medium,
-- and the next sync sets one on every live STATUS and HEALTH entry.
--
-- Written by hand from `prisma migrate diff --from-schema-datamodel <schema before> --to-schema-datamodel
-- prisma/schema.prisma` rather than `migrate dev --create-only`: the shadow database cannot replay this
-- project's earlier migrations, which reference Supabase's auth.users (P3006, as for 20261112130000_raid_items).

-- CreateEnum
CREATE TYPE "platform"."RaidPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "platform"."engagement_raid_items" ADD COLUMN     "priority" "platform"."RaidPriority",
ADD COLUMN     "prioritySetBy" UUID;
