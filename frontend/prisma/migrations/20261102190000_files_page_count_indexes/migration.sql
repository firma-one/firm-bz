-- The engagement page counts its tab badges on every render. Two of those counts had no index to use:
--   * Members: `engagement_members` filtered by "engagementId" alone — its only index is the unique
--     ("userId", "engagementId"), which leads with "userId".
--   * Audit: `platform_audit_events` filtered by "engagementId" and "scope" — the ("engagementId",
--     "eventAt") index found the engagement's rows but checked "scope" row by row on a table that
--     only grows.
--
-- Written by hand rather than `migrate dev --create-only`: the shadow database cannot replay this
-- project's earlier migrations, which reference Supabase's auth.users (see
-- 20261029130000_engagement_document_parent_index). Names follow Prisma's own convention, so the
-- schema and the database agree.

-- CreateIndex
CREATE INDEX "engagement_members_engagementId_idx" ON "platform"."engagement_members"("engagementId");

-- CreateIndex
CREATE INDEX "platform_audit_events_engagementId_scope_idx" ON "platform"."platform_audit_events"("engagementId", "scope");
