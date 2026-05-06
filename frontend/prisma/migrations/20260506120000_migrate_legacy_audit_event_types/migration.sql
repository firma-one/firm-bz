-- Convert eventType from enum to plain text, then drop the enum.
ALTER TABLE platform.platform_audit_events ALTER COLUMN "eventType" TYPE text;
DROP TYPE IF EXISTS platform."PlatformAuditEventType";
