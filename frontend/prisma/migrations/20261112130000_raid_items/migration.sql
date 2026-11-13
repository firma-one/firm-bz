-- RAID log: Risks, Assumptions, Issues and Decisions per engagement
-- (.claude/plans/brio-features-round-2.md, section 9). Internal only.
--
-- STATUS, HEALTH and BOARD entries are kept current from the engagement's own signals and are unique
-- per signal ("engagementId", "signalKey"); signalKey is NULL for THREAD, MEMO and MANUAL entries, so
-- many entries may cite one comment. A quote is kept for THREAD sources only: memo text is never
-- stored in the database (Deepak, 2026-11-12).
--
-- Written by hand from `prisma migrate diff --from-schema-datamodel <schema before> --to-schema-datamodel
-- prisma/schema.prisma` rather than `migrate dev --create-only`: the shadow database cannot replay this
-- project's earlier migrations, which reference Supabase's auth.users (P3006, as for
-- 20261112120000_user_day_brief). Diffing the two schema files leaves nothing in but this table, its
-- enums and its indexes.

-- CreateEnum
CREATE TYPE "platform"."RaidItemType" AS ENUM ('RISK', 'ASSUMPTION', 'ISSUE', 'DECISION');

-- CreateEnum
CREATE TYPE "platform"."RaidItemStatus" AS ENUM ('SUGGESTED', 'OPEN', 'CLOSED', 'RECORDED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "platform"."RaidSourceKind" AS ENUM ('STATUS', 'HEALTH', 'BOARD', 'THREAD', 'MEMO', 'MANUAL');

-- CreateTable
CREATE TABLE "platform"."engagement_raid_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedBy" UUID,
    "firmId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "type" "platform"."RaidItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "ownerUserId" UUID,
    "status" "platform"."RaidItemStatus" NOT NULL,
    "sourceKind" "platform"."RaidSourceKind" NOT NULL,
    "sourceRef" TEXT,
    "signalKey" TEXT,
    "internalSource" BOOLEAN NOT NULL DEFAULT false,
    "quote" TEXT,
    "extraSources" JSONB NOT NULL DEFAULT '[]',
    "attachedToId" UUID,
    "raisedAt" TIMESTAMPTZ(6) NOT NULL,
    "closedAt" TIMESTAMPTZ(6),
    "closedReason" TEXT,
    "closedBy" UUID,

    CONSTRAINT "engagement_raid_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_raid_items_engagementId_status_idx" ON "platform"."engagement_raid_items"("engagementId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_raid_items_engagementId_signalKey_key" ON "platform"."engagement_raid_items"("engagementId", "signalKey");

-- AddForeignKey
ALTER TABLE "platform"."engagement_raid_items" ADD CONSTRAINT "engagement_raid_items_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "platform"."engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."engagement_raid_items" ADD CONSTRAINT "engagement_raid_items_attachedToId_fkey" FOREIGN KEY ("attachedToId") REFERENCES "platform"."engagement_raid_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

