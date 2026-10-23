-- The engagement's Discussions page (.claude/plans/board-pane-comments-redesign.md, "Next"):
--
-- 1. doc_comment_threads: a document's discussion, once someone resolves it. One row per document,
--    created on first resolve; resolvedAt is cleared when a new comment reopens it.
-- 2. doc_comment_reads: when each member last read a document's discussion. A comment by someone
--    else after lastReadAt makes it unread for them.
--
-- Existing discussions start as read: every current engagement member gets a read marker on every
-- discussion that already has comments, so launch doesn't light up every row. Members who join
-- later see existing discussions as unread until they open them.
--
-- Generated with `prisma migrate diff` (schema → schema) rather than `migrate dev --create-only`:
-- the shadow database cannot replay this project's earlier migrations, which reference Supabase's
-- auth.users.

-- CreateTable
CREATE TABLE "platform"."doc_comment_threads" (
    "projectDocumentId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_comment_threads_pkey" PRIMARY KEY ("projectDocumentId")
);

-- CreateTable
CREATE TABLE "platform"."doc_comment_reads" (
    "userId" UUID NOT NULL,
    "projectDocumentId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doc_comment_reads_pkey" PRIMARY KEY ("userId","projectDocumentId")
);

-- CreateIndex
CREATE INDEX "doc_comment_threads_engagementId_idx" ON "platform"."doc_comment_threads"("engagementId");

-- CreateIndex
CREATE INDEX "doc_comment_reads_engagementId_userId_idx" ON "platform"."doc_comment_reads"("engagementId", "userId");

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_threads" ADD CONSTRAINT "doc_comment_threads_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."doc_comment_reads" ADD CONSTRAINT "doc_comment_reads_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "platform"."engagement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing discussions are read for everyone already on the engagement.
INSERT INTO "platform"."doc_comment_reads" ("userId", "projectDocumentId", "engagementId", "lastReadAt")
SELECT DISTINCT em."userId", m."projectDocumentId", m."engagementId", CURRENT_TIMESTAMP
FROM "platform"."doc_comment_messages" m
JOIN "platform"."engagement_members" em ON em."engagementId" = m."engagementId"
ON CONFLICT DO NOTHING;
