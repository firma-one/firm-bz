-- Add FK from engagement_document_sharing_users (engagementId, userId)
-- → engagement_members (engagementId, userId) with ON DELETE CASCADE
--
-- When a member is removed from an engagement, their document-level sharing
-- records are automatically deleted, preventing orphaned permission rows.
--
-- IMPORTANT: App code must revoke connector (e.g. GDrive) permissions BEFORE
-- deleting the engagement_members row, since the cascade will drop sharing rows
-- (and their connectorPermissionId) immediately.

ALTER TABLE "platform"."engagement_document_sharing_users"
  ADD CONSTRAINT "engagement_document_sharing_users_engagementId_userId_fkey"
  FOREIGN KEY ("engagementId", "userId")
  REFERENCES "platform"."engagement_members"("engagementId", "userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
