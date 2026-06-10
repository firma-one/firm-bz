-- Connector ownership moved from Firm → Client; sandbox unhook; per-client Brand table.

-- ── clients: add connectorId FK ──────────────────────────────────────────────
ALTER TABLE "platform"."clients"
  ADD COLUMN "connectorId" UUID REFERENCES "platform"."connectors"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "clients_connectorId_idx" ON "platform"."clients"("connectorId");

-- ── connectors: replace unique constraint + enforce name ─────────────────────
ALTER TABLE "platform"."connectors" DROP CONSTRAINT IF EXISTS "connectors_type_userId_key";

ALTER TABLE "platform"."connectors"
  ADD CONSTRAINT "connectors_type_userId_externalAccountId_key" UNIQUE ("type", "userId", "externalAccountId");

ALTER TABLE "platform"."connectors"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "name" SET DEFAULT 'Default Connection';

-- ── Unhook sandbox firms and clients from connectors ─────────────────────────
UPDATE "platform"."clients"
SET "connectorId" = NULL
WHERE "sandboxOnly" = true
  AND "connectorId" IS NOT NULL;

UPDATE "platform"."firms"
SET "connectorId" = NULL
WHERE "isAnchor" = true
  AND "connectorId" IS NOT NULL;

-- ── firms: drop legacy branding columns ──────────────────────────────────────
ALTER TABLE "platform"."firms"
  DROP COLUMN IF EXISTS "brandingSubtext",
  DROP COLUMN IF EXISTS "logoUrl",
  DROP COLUMN IF EXISTS "themeColorHex";

-- ── brands: per-client branding table ────────────────────────────────────────
CREATE TABLE "platform"."brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "sourceBrandId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "logoAspectRatio" TEXT,
    "subtext" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brands_clientId_key" ON "platform"."brands"("clientId");

ALTER TABLE "platform"."brands"
  ADD CONSTRAINT "brands_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
