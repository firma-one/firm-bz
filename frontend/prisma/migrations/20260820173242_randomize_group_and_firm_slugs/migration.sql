-- Re-derive every existing Group and Firm slug as fully random (no name derivation), matching
-- lib/slug-utils.ts's updated generateGroupSlug()/generateFirmSlug() — the URL segment no
-- longer leaks the creating user's first name or the firm's display name. Names themselves are
-- untouched; users can still see/edit the real name in Settings, only the URL slug changes.
-- Format: random(4) + '-' + random(4), mirroring generateRandomSlug()'s shape.

UPDATE "platform"."groups"
SET "slug" = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 4)
    || '-' || substr(md5(random()::text || clock_timestamp()::text || id::text || 'b'), 1, 4);

UPDATE "platform"."firms"
SET "slug" = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 4)
    || '-' || substr(md5(random()::text || clock_timestamp()::text || id::text || 'b'), 1, 4);
