-- Thumbs up/down on individual AI answers.
--
-- Stores the QUESTION but never the ANSWER: the question is text the user typed knowing it went to
-- the assistant, while the answer is derived from engagement data, so keeping it would copy client
-- data into a second table for no gain. The question plus timestamp is enough to reproduce it.
--
-- Hand-written rather than generated: the shadow database cannot replay this project's earlier
-- migrations, which reference Supabase's auth.users. Mirrors platform_ai_usage exactly.
CREATE TABLE "platform"."platform_ai_feedback" (
    "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
    "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId"      UUID           NOT NULL,
    "firmId"       UUID,
    "engagementId" UUID,
    "userId"       UUID,
    "feature"      TEXT           NOT NULL,
    "helpful"      BOOLEAN        NOT NULL,
    "reason"       TEXT,
    "question"     TEXT,

    CONSTRAINT "platform_ai_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_ai_feedback_groupId_createdAt_idx"
    ON "platform"."platform_ai_feedback" ("groupId", "createdAt");
-- Serves the admin dashboard's core question: helpful rate per feature over time.
CREATE INDEX "platform_ai_feedback_feature_helpful_createdAt_idx"
    ON "platform"."platform_ai_feedback" ("feature", "helpful", "createdAt");

ALTER TABLE "platform"."platform_ai_feedback"
    ADD CONSTRAINT "platform_ai_feedback_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "platform"."groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
