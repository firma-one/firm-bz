-- Shorten Group.slug's base to 4 chars (was 7), matching lib/slug-utils.ts's updated
-- generateGroupSlug(name, 4, 4) — the group segment prefixes every firm/client/engagement
-- URL under it, so a shorter base keeps /d/[groupSlug]/f/... links tighter.

-- Re-derive every existing group's slug from the creating user's first_name using the same
-- 4-char-base + '-' + 4-char-random-suffix shape as the original backfill (see migration
-- 20260820101823_add_group_slug), just with substr(..., 1, 4) instead of substr(..., 1, 7).
UPDATE "platform"."groups" g
SET "slug" = lower(regexp_replace(
      substr(COALESCE(NULLIF(trim(u.raw_user_meta_data ->> 'first_name'), ''), 'group'), 1, 4),
      '[^a-zA-Z0-9]+', '-', 'g'
    ))
    || '-' || substr(md5(random()::text || clock_timestamp()::text || g.id::text), 1, 4)
FROM "auth"."users" u
WHERE u.id = g."createdBy";

-- Safety net: groups whose createdBy didn't join to an auth.users row (orphaned/legacy data)
-- keep the 'group-' fallback shape, just re-randomized for consistency with the rest.
UPDATE "platform"."groups"
SET "slug" = 'grp-' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 4)
WHERE id NOT IN (SELECT id FROM "platform"."groups" g WHERE EXISTS (
    SELECT 1 FROM "auth"."users" u WHERE u.id = g."createdBy"
  ));
