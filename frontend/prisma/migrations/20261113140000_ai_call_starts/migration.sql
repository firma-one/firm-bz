-- Per-person limits on AI calls (lib/ai/person-limit.ts): one row per call a person starts, read for
-- calls a minute, calls a day and a day's cap on some features (Your day). Written when the call starts,
-- so requests sent at once can't all pass on the same count; each person's rows older than a day are
-- deleted on their next call.
--
-- Written by hand, as 20261112130000_raid_items: the shadow database cannot replay this project's
-- earlier migrations, which reference Supabase's auth.users (P3006). Only this table and its index.

-- CreateTable
CREATE TABLE "platform"."ai_call_starts" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "feature" TEXT NOT NULL,

    CONSTRAINT "ai_call_starts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_starts_userId_createdAt_idx" ON "platform"."ai_call_starts"("userId", "createdAt");
