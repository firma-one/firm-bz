-- Identity for a single rated answer and for the conversation it belongs to.
--
-- Both are minted in the browser, not here. Nothing about a Brio thread is persisted server-side —
-- the chat endpoint is stateless and receives the whole message array each turn — so the server has
-- no continuity to anchor an id to. The client mints them and echoes them back with the rating.
--
-- Hand-written rather than generated: the shadow database cannot replay this project's earlier
-- migrations, which depend on `auth.users`.

ALTER TABLE "platform"."platform_ai_feedback"
    ADD COLUMN "answerId" UUID,
    ADD COLUMN "threadId" UUID;

-- One rating per answer per user, so correcting a rating replaces it rather than adding a second
-- row and double-counting in the efficacy report.
--
-- Postgres treats NULLs as distinct in a unique index, so rows from surfaces with no chat turn to
-- key on (the daily brief, engagement summaries) are unaffected and still insert freely. That is
-- why no explicit WHERE clause is needed here.
CREATE UNIQUE INDEX "platform_ai_feedback_answer_user_key"
    ON "platform"."platform_ai_feedback" ("answerId", "userId");

-- Reads ratings back as a conversation: a run of good answers turning bad after a topic shift is a
-- different signal from the same number of unrelated complaints.
CREATE INDEX "platform_ai_feedback_threadId_createdAt_idx"
    ON "platform"."platform_ai_feedback" ("threadId", "createdAt");
