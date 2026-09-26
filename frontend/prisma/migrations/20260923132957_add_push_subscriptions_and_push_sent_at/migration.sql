-- Web Push (PWA-style) notifications — see .claude/plans/firm-settings-event-email-and-push-notifications.md (Part B).
-- pushSubscriptions holds one entry per subscribed device/browser: { endpoint, keys: { p256dh, auth }, createdAt }.
-- pushSentAt mirrors the existing emailSentAt column, tracking whether a push was dispatched for a notification.

ALTER TABLE "platform"."user_personalizations" ADD COLUMN "pushSubscriptions" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "platform"."platform_notifications" ADD COLUMN "pushSentAt" TIMESTAMPTZ(6);
