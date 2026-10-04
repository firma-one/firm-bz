-- Per-user notification preferences — see .claude/plans/browser-push-reminders.md (Phase 1).
-- Holds { timezone: <IANA string>, remindersDigest: { lastNotifiedDate: "YYYY-MM-DD" } }.
-- A single JSON column, matching the existing bookmarks / reminders / pushSubscriptions
-- pattern on this table, so later preferences need no further migration.
--
-- timezone drives the daily reminder digest firing at each user's local 09:00.
-- remindersDigest.lastNotifiedDate is the once-per-day claim stamp shared by the digest
-- cron and the in-app sign-in catch-up, so a user is notified exactly once per local day.

ALTER TABLE "platform"."user_personalizations"
  ADD COLUMN "notificationPrefs" JSONB NOT NULL DEFAULT '{}';

-- Supports the digest cron's "users in these timezones" scan.
CREATE INDEX IF NOT EXISTS "user_personalizations_notificationPrefs_timezone_idx"
  ON "platform"."user_personalizations" (("notificationPrefs" ->> 'timezone'));
