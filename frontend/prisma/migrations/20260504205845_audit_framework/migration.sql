-- Add PlatformAuditScope values
ALTER TYPE "platform"."PlatformAuditScope" ADD VALUE IF NOT EXISTS 'FIRM';
ALTER TYPE "platform"."PlatformAuditScope" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TYPE "platform"."PlatformAuditScope" ADD VALUE IF NOT EXISTS 'ENGAGEMENT';
ALTER TYPE "platform"."PlatformAuditScope" ADD VALUE IF NOT EXISTS 'DOCUMENT';

-- Add PlatformAuditEventType values — Firm lifecycle
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_SETTINGS_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_BRANDING_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_MEMBER_INVITED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_MEMBER_ADDED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_MEMBER_REMOVED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_MEMBER_ROLE_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_CONNECTOR_ATTACHED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'FIRM_CONNECTOR_DETACHED';

-- Client lifecycle
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_SETTINGS_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_CONTACT_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_CONTACT_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_CONTACT_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_MEMBER_ADDED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_MEMBER_REMOVED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_MEMBER_ROLE_CHANGED';

-- Engagement lifecycle
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_CLOSED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_REOPENED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_LOCKED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_SETTINGS_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_MEMBER_ADDED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_MEMBER_REMOVED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_MEMBER_ROLE_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_FOLDER_ATTACHED';

-- Document lifecycle
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_MOVED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_VERSIONED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_OPENED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_DOWNLOADED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_INDEXED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_FINALIZED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_UNLOCKED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_STATUS_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_COMMENT_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_COMMENT_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_COMMENT_DELETED';

-- Document sharing
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_SHARE_CREATED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_SHARE_CHANGED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_SHARE_DELETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_SHARE_VIEWED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_SHARE_DOWNLOADED';

-- Onboarding lifecycle
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_WORKSPACE_INITIALIZED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_SUBSCRIBE_COMPLETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_SUBSCRIBE_SKIPPED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_DRIVE_CONNECTED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_PROVISIONING_STARTED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_COMPLETED';
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'ONBOARDING_DOMAIN_JOINED';

-- Audit meta
ALTER TYPE "platform"."PlatformAuditEventType" ADD VALUE IF NOT EXISTS 'AUDIT_LOG_EXPORTED';

-- Index for firm/client scoped queries
CREATE INDEX IF NOT EXISTS "platform_audit_events_firmId_scope_eventAt_idx"
  ON "platform"."platform_audit_events" ("firmId", "scope", "eventAt");

-- Convert eventType from enum to plain text, then drop the enum
ALTER TABLE platform.platform_audit_events ALTER COLUMN "eventType" TYPE text;
DROP TYPE IF EXISTS platform."PlatformAuditEventType";
