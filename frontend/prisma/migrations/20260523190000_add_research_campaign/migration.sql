-- CreateEnum
CREATE TYPE "system"."ResearchCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "system"."research_campaign" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "script_snippet" TEXT,
    "query_params" JSONB NOT NULL DEFAULT '[]',
    "status" "system"."ResearchCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_campaign_pkey" PRIMARY KEY ("id")
);
