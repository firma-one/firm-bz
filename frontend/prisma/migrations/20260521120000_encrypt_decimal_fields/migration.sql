-- Retype Decimal columns to TEXT to support field-level encryption.
-- Existing numeric values are cast to text (e.g. 5000.00 → '5000.00').
-- The app's encryption backfill script will encrypt these plaintext strings
-- after the next deployment via /system/admin-scripts.

ALTER TABLE platform."engagements"
  ALTER COLUMN "rateOrValue" TYPE TEXT USING "rateOrValue"::TEXT;

ALTER TABLE platform."clients"
  ALTER COLUMN "relationshipValue" TYPE TEXT USING "relationshipValue"::TEXT;
