-- Where a memo RAID suggestion's quote sits in the memo, never its words (.claude/plans/brio-features-round-2.md, §13):
-- { at, length, hash }, as a memo's action items keep theirs. The memo's pane fills the words in from the memo it has
-- open. Nothing to backfill: earlier suggestions kept no place, so they show no quote until the memo is read again.
--
-- Written by hand from `prisma migrate diff --from-schema-datamodel <before> --to-schema-datamodel
-- prisma/schema.prisma --script`, as the shadow database can't replay the older Supabase migrations.

-- AlterTable
ALTER TABLE "platform"."engagement_raid_items" ADD COLUMN     "quoteAt" JSONB;
