-- Brio's "Your day" on Home (.claude/plans/brio-features-round-2.md, section 3.2).
--
-- user_personalizations.dayBrief: { date, text, fingerprint, generatedAt }, the person's brief for
-- one local day (date is "YYYY-MM-DD" in notificationPrefs.timezone). Written at most once a day,
-- and again only by Rewrite when what it was written from has changed (lib/ai/day-brief.ts).
-- Its own column rather than a key in uiPrefs or notificationPrefs, so saving a brief never
-- overwrites a preference saved meanwhile. Nullable: null until the first brief.
--
-- Written by hand from `prisma migrate diff` rather than `migrate dev --create-only`: the shadow
-- database cannot replay this project's earlier migrations, which reference Supabase's auth.users.
-- The diff's unrelated `DROP INDEX reddit_screener.posts_embedding_idx` is deliberately omitted —
-- that index is a pgvector index Prisma does not model, not drift this migration should correct.

-- AlterTable
ALTER TABLE "platform"."user_personalizations" ADD COLUMN "dayBrief" JSONB;
