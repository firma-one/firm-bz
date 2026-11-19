-- Every AI call is metered by what it cost us (plan: .claude/plans/ai-metering-by-tokens.md).

-- AlterTable
ALTER TABLE "platform"."platform_ai_usage" ADD COLUMN     "costMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "polarSentAt" TIMESTAMPTZ(6),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ok',
ADD COLUMN     "stopReason" TEXT;

-- CreateIndex
CREATE INDEX "platform_ai_usage_polarSentAt_createdAt_idx" ON "platform"."platform_ai_usage"("polarSentAt", "createdAt");

-- Backfill: what each earlier call cost, from its stored tokens at its model's list price (US$ per
-- million tokens: Haiku 5.5 0.10 in / 0.50 out; Haiku 4.5 1.00 / 5.00). Credits are left as charged.
UPDATE "platform"."platform_ai_usage"
SET "costMicros" = CEIL("inputTokens" * 0.10 + "outputTokens" * 0.50)
WHERE "model" = 'claude-haiku-5-5';

UPDATE "platform"."platform_ai_usage"
SET "costMicros" = CEIL("inputTokens" * 1.00 + "outputTokens" * 5.00)
WHERE "model" = 'claude-haiku-4-5';
