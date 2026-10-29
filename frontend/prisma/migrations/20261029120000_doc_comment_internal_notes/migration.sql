-- Internal notes on a discussion: a comment the firm writes for itself, which external
-- collaborators and viewers never see and which never counts as a reply to the client.
--
-- A real column rather than a key in `settings`, because every reader filters on it and a
-- negated JSON-path match in SQL also drops the rows that don't have the key at all, which is
-- every ordinary comment. NOT NULL DEFAULT false makes every existing comment a shared one.
--
-- Written by hand from `prisma migrate diff` rather than `migrate dev --create-only`: the shadow
-- database cannot replay this project's earlier migrations, which reference Supabase's auth.users.
-- The diff's unrelated `DROP INDEX reddit_screener.posts_embedding_idx` is deliberately omitted —
-- that index is a pgvector index Prisma does not model, not drift this migration should correct.

-- AlterTable
ALTER TABLE "platform"."doc_comment_messages" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;
