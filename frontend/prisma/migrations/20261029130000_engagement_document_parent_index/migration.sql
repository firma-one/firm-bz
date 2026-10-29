-- `SearchService.removeFile` deletes a file and its descendants with a recursive CTE that joins
-- `engagement_documents` to itself on `parentId`, scoped by `firmId`. With no index covering
-- that join, each level of the recursion did a sequential scan of the whole table — on
-- 2026-10-29 that query hit Postgres's statement timeout (57014) from an Inngest step ("Failed
-- to remove file from platform search index"), which in turn held one of the pool's few
-- connections for the full timeout duration during the Files-page incident.
--
-- Written by hand from `prisma migrate diff` rather than `migrate dev --create-only`: the shadow
-- database cannot replay this project's earlier migrations, which reference Supabase's auth.users
-- (see the doc_comment_internal_notes migration for the same note). The diff's unrelated
-- `DROP INDEX reddit_screener.posts_embedding_idx` is deliberately omitted — that index is a
-- pgvector index Prisma does not model, not drift this migration should correct.

-- CreateIndex
CREATE INDEX "engagement_documents_firmId_parentId_idx" ON "platform"."engagement_documents"("firmId", "parentId");
