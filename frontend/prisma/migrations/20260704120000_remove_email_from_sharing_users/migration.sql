-- Remove denormalized email column from engagement_document_sharing_users.
-- Email is now resolved at query time by joining to auth.users.
ALTER TABLE "platform"."engagement_document_sharing_users" DROP COLUMN "email";
