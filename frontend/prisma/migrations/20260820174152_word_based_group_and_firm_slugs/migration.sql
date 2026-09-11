-- Switch Group/Firm slug part 1 from random characters to a readable word (see
-- lib/slug-utils.ts's generateWordSlug()/SLUG_WORDS) — more memorable/shareable in a URL,
-- still no name derivation. Re-slugifies every existing Group and Firm to match.
-- Wordlist mirrors lib/slug-utils.ts's SLUG_WORDS exactly — keep both in sync if either changes.

CREATE OR REPLACE FUNCTION pg_temp.random_slug_word()
RETURNS text AS $$
DECLARE
    words text[] := ARRAY[
        'amber', 'arch', 'ash', 'atlas', 'aurora', 'birch', 'blue', 'bright', 'brook', 'cedar',
        'clover', 'coral', 'cove', 'crest', 'cyan', 'delta', 'ember', 'fern', 'field', 'flint',
        'forge', 'gold', 'grove', 'harbor', 'haven', 'hazel', 'hill', 'indigo', 'ivory', 'ivy',
        'jade', 'lake', 'lark', 'linen', 'maple', 'marsh', 'meadow', 'mint', 'mist', 'moss',
        'oak', 'olive', 'onyx', 'opal', 'orbit', 'peak', 'pearl', 'pine', 'plum', 'quartz',
        'quill', 'reed', 'ridge', 'river', 'rose', 'sage', 'sand', 'shore', 'sky', 'slate',
        'spruce', 'stone', 'summit', 'teal', 'terra', 'thistle', 'tide', 'timber', 'trail', 'vale',
        'violet', 'wave', 'willow', 'wren'
    ];
BEGIN
    RETURN words[floor(random() * array_length(words, 1))::int + 1];
END;
$$ LANGUAGE plpgsql;

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
SET "slug" = pg_temp.random_slug_word() || '-' || pg_temp.random_base36_part(4);

UPDATE "platform"."firms"
SET "slug" = pg_temp.random_slug_word() || '-' || pg_temp.random_base36_part(4);

DROP FUNCTION pg_temp.random_slug_word();
DROP FUNCTION pg_temp.random_base36_part(integer);
