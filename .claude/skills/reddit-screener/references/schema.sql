-- Reddit screener schema for Firma prospecting — DOCUMENTATION ONLY.
--
-- This file documents intent. The actual DDL that gets applied to the DB is
-- the generated Prisma migration at
-- frontend/prisma/migrations/<timestamp>_add_reddit_screener/migration.sql
-- (generated from frontend/prisma/schema.prisma's RedditScreenerPost /
-- RedditScreenerRun models). Do not run this file directly; edit the Prisma
-- schema and regenerate a migration instead, to avoid drift between this doc
-- and the real schema.
--
-- Isolated in its own Postgres schema (reddit_screener) so it never touches
-- app tables and is easy to drop. Runs on dev/local only, never production.

create schema if not exists reddit_screener;

-- pgvector powers two things and two things only:
--   1. dedupe    - recognize a near-identical POST we already engaged
--   2. retrieval - find past posts semantically similar to a new one, so we can
--                  feed the replies that worked as few-shot examples to the drafter
-- The screener still runs without embeddings; it just skips similarity dedupe.
-- (pgvector extension is already enabled by this repo's earlier "platform"
-- init migration; no need to re-create it.)
create extension if not exists vector;

-- One row per discovered Reddit post (the OP submission).
-- NOTE ON NAMING: on Reddit, a "thread" means the post PLUS its whole comment
-- tree. We store the POST here, not the comments, so the table is named `posts`.
-- The one embedding on this table is built from the POST ONLY (title + body).
create table if not exists reddit_screener.posts (
    id                bigint generated always as identity primary key,
    reddit_id         text unique not null,          -- fullname, e.g. t3_1t9g98e
    permalink         text not null,
    subreddit         text not null,
    post_title        text not null,                 -- the OP's title
    post_body         text,                          -- the OP's selftext (may be empty)
    author            text,
    created_utc       timestamptz not null,
    score             integer,                        -- upvotes at discovery time
    num_comments      integer,
    upvote_ratio      real,

    -- ---- screener output ----
    relevance_score   integer,                        -- 0-100 blended score
    score_reason      text,                           -- one-line why-it-ranked
    matched_keywords  text[],
    draft_help_only   text,                           -- Variation A: pure help
    draft_soft_promo  text,                           -- Variation B: help + soft build mention
    soft_promo_advised boolean default true,          -- false for vendor-hostile subs

    -- ---- lifecycle ----
    status            text not null default 'drafted'
                        check (status in ('drafted','skipped','posted')),
    posted_variation  text check (posted_variation in ('A','B')),
    posted_comment_url text,
    posted_at         timestamptz,

    -- ---- outcome feedback (fill in later to teach the drafter) ----
    outcome_upvotes   integer,
    outcome_replies   integer,
    outcome_notes     text,

    -- ---- semantic search ----
    -- The ONE vector on this table. Built from post_title + post_body ONLY,
    -- embedded with the SAME local embedding function the Firma app already
    -- uses on documents (frontend/lib/embeddings.ts, Xenova/all-MiniLM-L6-v2,
    -- 384-dimensional) so both live in the same vector space.
    -- Do NOT embed the drafts or the comments here; drafts ride along on the row
    -- and are retrieved via this post vector (see learning loop below).
    post_embedding    vector(384),

    discovered_at     timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists posts_status_idx
    on reddit_screener.posts (status);
create index if not exists posts_created_idx
    on reddit_screener.posts (created_utc desc);
create index if not exists posts_subreddit_idx
    on reddit_screener.posts (subreddit);

-- ANN index for cosine similarity dedupe/retrieval. Build after some rows exist.
create index if not exists posts_embedding_idx
    on reddit_screener.posts
    using ivfflat (post_embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- LEARNING LOOP (how the one vector improves future drafts):
--   For a new candidate post, embed its (title + body), then nearest-neighbour
--   search this table for past posts with status='posted' and good outcome_*
--   numbers. Those rows carry their winning draft (draft_help_only /
--   draft_soft_promo) inline, so you retrieve the good examples BY POST
--   SIMILARITY and feed them to the drafter as few-shot context. The reply
--   never needs its own vector because you match on the situation (the post),
--   not on the wording of the reply.
--
-- FUTURE (v2, not now): if you later want an anti-repetition guard so a new
-- draft doesn't echo one you already posted several times, add a SECOND vector
-- column `draft_embedding vector(N)` and compare new drafts against past drafts.
-- Leave it out until repetition is an actual problem.
-- ---------------------------------------------------------------------------

-- Optional: log each run for observability.
create table if not exists reddit_screener.runs (
    id             bigint generated always as identity primary key,
    started_at     timestamptz not null default now(),
    finished_at    timestamptz,
    posts_found    integer,
    posts_new      integer,
    top_n          integer,
    notes          text
);

-- keep updated_at fresh
create or replace function reddit_screener.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists posts_touch on reddit_screener.posts;
create trigger posts_touch before update on reddit_screener.posts
    for each row execute function reddit_screener.touch_updated_at();
