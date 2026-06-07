-- Delete the incorrectly created free sandbox row
DELETE FROM platform.subscriptions
WHERE "firmId" = 'a3520a95-1591-4fa0-bad8-b28f1da866ac'
  AND "polarSubscriptionId" IS NULL
  AND active = true;

-- Reactivate the Standard row
UPDATE platform.subscriptions
SET active = true, "deactivatedAt" = null
WHERE "firmId" = 'a3520a95-1591-4fa0-bad8-b28f1da866ac'
  AND "polarSubscriptionId" = 'fd8be697-06cd-4a17-9047-ebb42c52a72d';
