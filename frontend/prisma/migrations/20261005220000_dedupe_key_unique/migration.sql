-- Make `dedupeKey` actually deduplicate.
--
-- Roughly ten call sites construct careful dedupe keys and pass `skipDuplicates: true` to
-- `createEventNotifications`. That flag only skips rows that would violate a UNIQUE constraint, and
-- there was none on this column — so every one of those keys was decorative and duplicate
-- notifications were never actually suppressed.
--
-- Partial, because most rows pass null and NULLs must stay unconstrained: a unique index over a
-- nullable column would still permit unlimited NULLs in Postgres, but stating the predicate makes
-- the intent explicit and keeps the index small.

-- Collapse any pre-existing duplicates first, keeping the earliest of each group. The index cannot
-- be created while they exist, and the oldest row is the one whose notification was actually
-- delivered — the later ones are the duplicates this index exists to prevent.
DELETE FROM "platform"."platform_notifications" a
USING "platform"."platform_notifications" b
WHERE a."dedupeKey" IS NOT NULL
  AND a."dedupeKey" = b."dedupeKey"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "platform_notifications_dedupeKey_key"
    ON "platform"."platform_notifications" ("dedupeKey")
    WHERE "dedupeKey" IS NOT NULL;
