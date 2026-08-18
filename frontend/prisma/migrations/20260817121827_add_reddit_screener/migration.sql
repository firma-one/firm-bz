-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "reddit_screener";

-- CreateEnum
CREATE TYPE "reddit_screener"."reddit_screener_post_status" AS ENUM ('drafted', 'skipped', 'posted');

-- CreateEnum
CREATE TYPE "reddit_screener"."reddit_screener_variation" AS ENUM ('A', 'B');

-- CreateTable
CREATE TABLE "reddit_screener"."posts" (
    "id" BIGSERIAL NOT NULL,
    "reddit_id" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "post_title" TEXT NOT NULL,
    "post_body" TEXT,
    "author" TEXT,
    "created_utc" TIMESTAMPTZ(6) NOT NULL,
    "score" INTEGER,
    "num_comments" INTEGER,
    "upvote_ratio" DOUBLE PRECISION,
    "relevance_score" INTEGER,
    "score_reason" TEXT,
    "matched_keywords" TEXT[],
    "draft_help_only" TEXT,
    "draft_soft_promo" TEXT,
    "soft_promo_advised" BOOLEAN NOT NULL DEFAULT true,
    "status" "reddit_screener"."reddit_screener_post_status" NOT NULL DEFAULT 'drafted',
    "posted_variation" "reddit_screener"."reddit_screener_variation",
    "posted_comment_url" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "outcome_upvotes" INTEGER,
    "outcome_replies" INTEGER,
    "outcome_notes" TEXT,
    "post_embedding" vector,
    "discovered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reddit_screener"."runs" (
    "id" BIGSERIAL NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "posts_found" INTEGER,
    "posts_new" INTEGER,
    "top_n" INTEGER,
    "notes" TEXT,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posts_reddit_id_key" ON "reddit_screener"."posts"("reddit_id");

-- CreateIndex
CREATE INDEX "posts_status_idx" ON "reddit_screener"."posts"("status");

-- CreateIndex
CREATE INDEX "posts_created_utc_idx" ON "reddit_screener"."posts"("created_utc" DESC);

-- CreateIndex
CREATE INDEX "posts_subreddit_idx" ON "reddit_screener"."posts"("subreddit");

-- ANN index for cosine similarity dedupe/retrieval (pgvector extension already
-- enabled by the platform init migration).
CREATE INDEX "posts_embedding_idx" ON "reddit_screener"."posts"
    USING ivfflat ("post_embedding" vector_cosine_ops) WITH (lists = 100);

-- Keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION "reddit_screener".touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_touch ON "reddit_screener"."posts";
CREATE TRIGGER posts_touch BEFORE UPDATE ON "reddit_screener"."posts"
    FOR EACH ROW EXECUTE FUNCTION "reddit_screener".touch_updated_at();
