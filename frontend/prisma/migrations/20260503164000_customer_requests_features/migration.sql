-- Add comments column
ALTER TABLE "platform"."customer_requests" ADD COLUMN "comments" JSONB NOT NULL DEFAULT '[]';

-- Add ticketNumber column
ALTER TABLE "platform"."customer_requests" ADD COLUMN "ticketNumber" TEXT;

-- Backfill ticketNumber with unique values
WITH numbered_requests AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") as rn
  FROM "platform"."customer_requests"
)
UPDATE "platform"."customer_requests" cr
SET "ticketNumber" = 'TKT-' || LPAD(nr.rn::TEXT, 5, '0')
FROM numbered_requests nr
WHERE cr.id = nr.id;

-- Make ticketNumber NOT NULL + unique
ALTER TABLE "platform"."customer_requests" ALTER COLUMN "ticketNumber" SET NOT NULL;
CREATE UNIQUE INDEX "customer_requests_ticketNumber_key" ON "platform"."customer_requests"("ticketNumber");

-- Add attachments column
ALTER TABLE "platform"."customer_requests" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb;
