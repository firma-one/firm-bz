-- Rename client_admin persona display name from "Client Administrator" to "Client Partner"
-- Only updates the master personas table; existing member/invitation records are unaffected.
UPDATE "platform"."personas"
SET "displayName" = 'Client Partner'
WHERE "slug" = 'client_admin'
  AND "displayName" = 'Client Administrator';
