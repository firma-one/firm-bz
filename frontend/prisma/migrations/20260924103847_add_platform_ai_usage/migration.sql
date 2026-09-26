-- Append-only ledger of AI API calls. Never overwritten: usage cannot live in
-- Subscription.settings because the Polar webhook sync replaces that JSON wholesale.
CREATE TABLE "platform"."platform_ai_usage" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId"      UUID         NOT NULL,
    "firmId"       UUID,
    "userId"       UUID,
    "feature"      TEXT         NOT NULL,
    "model"        TEXT         NOT NULL,
    "inputTokens"  INTEGER      NOT NULL,
    "outputTokens" INTEGER      NOT NULL,
    "credits"      DECIMAL(8,2) NOT NULL,

    CONSTRAINT "platform_ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_ai_usage_groupId_createdAt_idx"
    ON "platform"."platform_ai_usage" ("groupId", "createdAt");
CREATE INDEX "platform_ai_usage_firmId_createdAt_idx"
    ON "platform"."platform_ai_usage" ("firmId", "createdAt");
CREATE INDEX "platform_ai_usage_feature_createdAt_idx"
    ON "platform"."platform_ai_usage" ("feature", "createdAt");

ALTER TABLE "platform"."platform_ai_usage"
    ADD CONSTRAINT "platform_ai_usage_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "platform"."groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
