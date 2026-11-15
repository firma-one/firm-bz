-- A comment's reminder ticked off by the person it reminded, and when (.claude/plans/brio-features-round-2.md, §3.7).
-- The reminder itself is removed from their list on Done, so this row is what remains of it: Waiting on
-- Reviewers reads it to know a nudge was acknowledged. Nothing to backfill: earlier Dones left no trace.
--
-- Written by hand from `prisma migrate diff --from-schema-datamodel <before> --to-schema-datamodel
-- prisma/schema.prisma --script`, as the shadow database can't replay the older Supabase migrations.

-- CreateTable
CREATE TABLE "platform"."doc_comment_reminder_done" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "doneAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_comment_reminder_done_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "doc_comment_reminder_done_engagementId_idx" ON "platform"."doc_comment_reminder_done"("engagementId");
