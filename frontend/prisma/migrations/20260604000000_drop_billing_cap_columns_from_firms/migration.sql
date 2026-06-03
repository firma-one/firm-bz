-- Drop billing cap columns from firms table now that caps are read from subscriptions.settings.metadata
-- billingSharesSubscriptionFromFirmId was a duplicate of anchorFirmId (always same value)
-- billingGroupFirmCap, billingActiveEngagementCap, billingCapsLocked are now sourced from Polar webhook metadata

-- Drop the index on billingSharesSubscriptionFromFirmId first
DROP INDEX IF EXISTS "platform"."firms_billingSharesSubscriptionFromFirmId_idx";

ALTER TABLE "platform"."firms"
  DROP COLUMN IF EXISTS "billingSharesSubscriptionFromFirmId",
  DROP COLUMN IF EXISTS "billingGroupFirmCap",
  DROP COLUMN IF EXISTS "billingActiveEngagementCap",
  DROP COLUMN IF EXISTS "billingCapsLocked";
