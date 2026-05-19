-- Set enableBetaFeatures: false in settings JSON for all existing firm records
UPDATE "platform"."firms"
SET "settings" = jsonb_set(
  COALESCE("settings", '{}'::jsonb),
  '{enableBetaFeatures}',
  'false'::jsonb
)
WHERE "settings" IS NULL OR ("settings"->>'enableBetaFeatures') IS NULL;
