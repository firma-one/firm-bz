-- AlterTable - Add ticketNumber column
ALTER TABLE "platform"."customer_requests" ADD COLUMN "ticketNumber" TEXT;

-- Backfill ticketNumber with unique values using CTE
WITH numbered_requests AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") as rn
  FROM "platform"."customer_requests"
)
UPDATE "platform"."customer_requests" cr
SET "ticketNumber" = 'TKT-' || LPAD(nr.rn::TEXT, 5, '0')
FROM numbered_requests nr
WHERE cr.id = nr.id;

-- Make column NOT NULL and add unique constraint
ALTER TABLE "platform"."customer_requests"
ALTER COLUMN "ticketNumber" SET NOT NULL;

CREATE UNIQUE INDEX "customer_requests_ticketNumber_key" ON "platform"."customer_requests"("ticketNumber");
