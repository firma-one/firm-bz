-- Schema drift corrections: column additions, type fixes, and table cleanup.

-- doc_comment_messages: add settings
ALTER TABLE "platform"."doc_comment_messages"
  ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';

-- engagements: add followUpDate
ALTER TABLE "platform"."engagements"
  ADD COLUMN IF NOT EXISTS "followUpDate" TIMESTAMPTZ(6);

-- user_personalizations: drop notes (was added/removed directly on local, never on production)
ALTER TABLE "platform"."user_personalizations"
  DROP COLUMN IF EXISTS "notes";

-- WaitlistStatus enum + WaitlistCampaign table
DO $$ BEGIN
  CREATE TYPE "system"."WaitlistStatus" AS ENUM ('WAITING', 'INVITED', 'CONVERTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "system"."WaitlistCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "WaitlistCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "system"."waitlist"
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "system"."WaitlistStatus" NOT NULL DEFAULT 'WAITING';

DO $$ BEGIN
  ALTER TABLE "system"."waitlist"
    ADD CONSTRAINT "waitlist_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "system"."WaitlistCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- clients.clientSinceDate: fix type from TIMESTAMPTZ to TIMESTAMP(3)
ALTER TABLE "platform"."clients"
  ALTER COLUMN "clientSinceDate" SET DATA TYPE TIMESTAMP(3);

-- Drop engagement_canvases (removed from schema)
DROP TABLE IF EXISTS "platform"."engagement_canvases";
