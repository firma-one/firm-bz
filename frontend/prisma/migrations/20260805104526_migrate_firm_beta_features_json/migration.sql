-- Data migration: firms.settings JSON restructure
-- Old shape: { "enableBetaFeatures": boolean, ... }
-- New shape: { "betaFeatures": { "dossier": boolean, "microsoftStorageConnector": boolean }, ... }
--
-- Only touches rows that actually have the legacy key. Preserves an existing
-- "betaFeatures" node if one is already present (merges dossier into it rather
-- than clobbering), and always drops the legacy "enableBetaFeatures" key.

UPDATE "platform"."firms"
SET "settings" = (
  ("settings" - 'enableBetaFeatures') || jsonb_build_object(
    'betaFeatures',
    COALESCE("settings"->'betaFeatures', '{}'::jsonb)
      || jsonb_build_object('dossier', COALESCE("settings"->'enableBetaFeatures', 'false'::jsonb))
  )
)
WHERE "settings" ? 'enableBetaFeatures';
