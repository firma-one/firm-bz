-- Fix 20260820173242_randomize_group_and_firm_slugs: it used md5(), which is hex-only
-- (0-9a-f) and never produces g-z, so every slug it wrote looked numeric-ish and didn't
-- match lib/slug-utils.ts's actual generateRandomSlug(), which is base-36 (0-9a-z) via
-- Math.random().toString(36). Re-randomizes every Group and Firm slug again, this time
-- picking each character independently from the full 36-character alphabet.

CREATE OR REPLACE FUNCTION pg_temp.random_base36_part(len integer)
RETURNS text AS $$
DECLARE
    alphabet text := '0123456789abcdefghijklmnopqrstuvwxyz';
    result text := '';
BEGIN
    FOR i IN 1..len LOOP
        result := result || substr(alphabet, floor(random() * 36)::int + 1, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

UPDATE "platform"."groups"
SET "slug" = pg_temp.random_base36_part(4) || '-' || pg_temp.random_base36_part(4);

UPDATE "platform"."firms"
SET "slug" = pg_temp.random_base36_part(4) || '-' || pg_temp.random_base36_part(4);

DROP FUNCTION pg_temp.random_base36_part(integer);
