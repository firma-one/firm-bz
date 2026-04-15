-- =============================================================================
-- Cascade delete platform data for a user who is a firm_admin
-- =============================================================================
--
-- Purpose
-- -------
-- Removes all `platform.*` rows tied to every firm where the given user has
-- role `firm_admin` (entire workspace: clients, engagements, documents,
-- subscriptions, invitations, members on that firm, audit events, etc.).
-- PostgreSQL `ON DELETE CASCADE` from `platform.firms` handles most children.
--
-- This script additionally deletes:
--   - `platform.platform_notifications` rows for those firms (no FK to firms)
--   - `platform.customer_requests` for those firms or for the user
--   - `platform.user_personalizations` for the user
--   - `system.system_admins` for the user
--   - `platform.connectors` rows that are no longer referenced by any firm
--     after the deletes (same `userId` is often the Drive connector owner)
--
-- What this does NOT do
-- ---------------------
--   - Does not delete the Supabase Auth user (`auth.users`) or sessions.
--   - Does not remove the user from firms where they are only `firm_member`
--     (those firms are left intact).
--   - Does not delete `system.contact_submissions`, `system.waitlist`, etc.
--
-- Usage (psql)
-- ------------
--   psql "$DIRECT_URL" -v target_user="'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'"
--        -f frontend/scripts/sql/cascade-delete-platform-data-for-firm-admin.sql
--
-- Or edit the UUID inside the DO block below and run from any SQL client.
--
-- Always run inside a transaction first and verify counts:
--   BEGIN;
--   ... script ...
--   ROLLBACK;   -- or COMMIT;
--
-- =============================================================================

BEGIN;

DO $$
DECLARE
  -- Set this UUID to the user to purge (firm_admin workspaces only).
  v_user uuid := '00000000-0000-0000-0000-000000000000'::uuid;

  v_firm_ids uuid[];
  v_firm_count int;
  v_deleted bigint;
BEGIN
  IF v_user = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Edit v_user in this script to the target user UUID before running.';
  END IF;

  SELECT array_agg(fm."firmId" ORDER BY fm."firmId")
  INTO v_firm_ids
  FROM platform.firm_members fm
  WHERE fm."userId" = v_user
    AND fm.role = 'firm_admin'::platform."FirmRole";

  IF v_firm_ids IS NULL OR cardinality(v_firm_ids) = 0 THEN
    RAISE NOTICE 'No firms found where user % is firm_admin. Nothing to delete.', v_user;
    RETURN;
  END IF;

  v_firm_count := cardinality(v_firm_ids);
  RAISE NOTICE 'Target user: %', v_user;
  RAISE NOTICE 'Firms to delete (firm_admin): % — ids: %', v_firm_count, v_firm_ids;

  -- Rows that reference firms but are NOT covered by ON DELETE CASCADE from firms.
  DELETE FROM platform.platform_notifications n
  WHERE n."firmId" = ANY (v_firm_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted platform_notifications rows: %', v_deleted;

  DELETE FROM platform.customer_requests cr
  WHERE cr."firmId" = ANY (v_firm_ids)
     OR cr."userId" = v_user;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted customer_requests rows: %', v_deleted;

  -- Break firm → connector pointer before firm row goes away (defensive).
  UPDATE platform.firms f
  SET "connectorId" = NULL
  WHERE f.id = ANY (v_firm_ids)
    AND f."connectorId" IS NOT NULL;

  -- Core delete: cascades to subscriptions, clients, engagements, documents,
  -- firm_members (all members), invitations, audit events, comments, etc.
  DELETE FROM platform.firms f
  WHERE f.id = ANY (v_firm_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted firms rows: %', v_deleted;

  -- Connectors: unique per (type, userId); remove orphans no firm references.
  DELETE FROM platform.connectors c
  WHERE c."userId" = v_user
    AND NOT EXISTS (
      SELECT 1
      FROM platform.firms f
      WHERE f."connectorId" = c.id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted orphaned connectors for user: %', v_deleted;

  DELETE FROM platform.user_personalizations up
  WHERE up."userId" = v_user;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted user_personalizations rows: %', v_deleted;

  DELETE FROM system.system_admins sa
  WHERE sa."userId" = v_user;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted system_admins rows: %', v_deleted;

  RAISE NOTICE 'Done.';
END $$;

-- Change to COMMIT when satisfied; use ROLLBACK to undo.
ROLLBACK;
