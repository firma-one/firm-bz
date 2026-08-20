-- Add a globally unique, top-level URL segment to platform.groups: /d/[slug]/f/[firmSlug]/...
-- See .claude/plans/sandbox-firm-removal.md (Step 0) for the full rationale — groups become a
-- real routing/URL tier once the group picker (multi-group users) ships, not just a billing
-- anchor concept living only in session state.

-- 1. Add the column nullable first so existing rows don't block the DDL.
ALTER TABLE "platform"."groups" ADD COLUMN "slug" TEXT;

-- 2. Backfill existing groups from the creating user's first name (auth.users.raw_user_meta_data),
--    NOT from platform.groups.name — that column is application-encrypted at rest (see
--    lib/encryption.ts / lib/prisma.ts field-encryption extension) and cannot be slugified by
--    raw SQL. This mirrors the same first_name lookup app/api/onboarding/create-sandbox/route.ts
--    already uses for the sandbox-firm-group display name. Falls back to 'group' when
--    first_name is null/blank (confirmed live: 3 of 6 existing groups have no first_name set).
--    Format mirrors lib/slug-utils.ts's generateSlug()+generateUniqueSlug() output shape
--    (7-char base + '-' + 4-char random suffix) closely enough for consistency.
UPDATE "platform"."groups" g
SET "slug" = lower(regexp_replace(
      substr(COALESCE(NULLIF(trim(u.raw_user_meta_data ->> 'first_name'), ''), 'group'), 1, 7),
      '[^a-zA-Z0-9]+', '-', 'g'
    ))
    || '-' || substr(md5(random()::text || clock_timestamp()::text || g.id::text), 1, 4)
FROM "auth"."users" u
WHERE u.id = g."createdBy"
  AND g."slug" IS NULL;

-- 3. Safety net: any group whose createdBy didn't join to an auth.users row (orphaned/legacy
--    data) still needs a slug before the NOT NULL constraint below can apply.
UPDATE "platform"."groups"
SET "slug" = 'group-' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 4)
WHERE "slug" IS NULL;

-- 4. Now that every row has a value, enforce NOT NULL + UNIQUE.
ALTER TABLE "platform"."groups" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "groups_slug_key" ON "platform"."groups"("slug");
