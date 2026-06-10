# Client Brand Refactor Plan

## Overview

Firm-level branding (logo, colors, tagline) currently lives in `Firm.settings.branding` (JSONB) and legacy mirror columns (`logoUrl`, `brandingSubtext`, `themeColorHex`). We are moving branding ownership to the Client level via a new `Brand` table, so each client can carry its own distinct brand identity. The topbar will show the active client's brand when inside a client context, falling back to the Firma default otherwise.

---

## DB Schema

### New `Brand` model

Add to `schema.prisma` (in `platform` schema):

```prisma
model Brand {
  id              String   @id @default(cuid())
  name            String                        // user-friendly label e.g. "DataSentry Firm Branding"
  clientId        String   @unique              // one active brand per client
  client          Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  sourceBrandId   String?                       // duplicated-from (null = original)
  isLocked        Boolean  @default(false)
  logoUrl         String?                       // /api/clients/[clientId]/brand/logo proxy
  logoAspectRatio String?
  subtext         String?
  primaryColor    String?
  secondaryColor  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("client_brands")
  @@schema("platform")
}
```

### `Client` model update

Add relation field:

```prisma
brand Brand?
```

### `Firm` model update

Remove these columns:

- `logoUrl`
- `brandingSubtext`
- `themeColorHex`

### Migration strategy

- Run `npx prisma migrate dev --name client_brand --create-only` to generate the migration file without applying it.
- Nullify `settings.branding` writes in the `updateFirm` action — no data migration needed.
- User runs `npm run build` to apply migrations (same as production flow).

### Migration SQL (reference)

```sql
-- Create client_brands table
CREATE TABLE "platform"."client_brands" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sourceBrandId" TEXT,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "logoUrl" TEXT,
  "logoAspectRatio" TEXT,
  "subtext" TEXT,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_brands_clientId_key" ON "platform"."client_brands"("clientId");
ALTER TABLE "platform"."client_brands"
  ADD CONSTRAINT "client_brands_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "platform"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove legacy firm branding columns
ALTER TABLE "platform"."firms"
  DROP COLUMN IF EXISTS "logoUrl",
  DROP COLUMN IF EXISTS "brandingSubtext",
  DROP COLUMN IF EXISTS "themeColorHex";
```

---

## New API Routes

### `GET|POST|DELETE /api/clients/[clientId]/brand/logo`

Mirrors `/api/firms/[firmId]/logo/route.ts` exactly, but uses `Client.driveFolderId` + `Client.connectorId` instead of firm context. Logo files are stored at `[Client Name]/.meta/assets/` in Drive.

- **GET**: Stream logo file from Drive.
- **POST**: Upload new logo file to Drive path, update `Brand.logoUrl`.
- **DELETE**: Trash logo file in Drive, set `Brand.logoUrl` to null.

### `GET|POST|PUT|DELETE /api/clients/[clientId]/brand`

- **GET**: Return `Brand` record for this client, or null if none exists.
- **POST/PUT**: Upsert brand metadata (name, subtext, colors, logoAspectRatio).
- **DELETE**: Delete the brand record and trash logo in Drive if one exists.

### `POST /api/clients/[clientId]/brand/duplicate`

Body: `{ sourceBrandId: string, name: string }` — `name` is required; user must supply the new copy's label.

Steps:
1. Load source `Brand` — must belong to a client in the same firm (security check).
2. Reject if source `isLocked` is true.
3. Insert new `Brand` with `sourceBrandId` set, `isLocked: false`, new `name`.
4. If source has a `logoUrl`: copy logo file in Drive from source client's `[Client]/.meta/assets/` to target client's `[Client]/.meta/assets/` using adapter `copyFile` (or download + reupload if adapter lacks `copyFile`).
5. Set `logoUrl` on the new record to `/api/clients/[targetClientId]/brand/logo`.
6. Return the new `Brand`.

---

## Server Action: `upsertBrand`

Location: `lib/actions/client.ts`

Params:

```ts
{
  clientId: string
  name: string
  subtext?: string
  primaryColor?: string
  secondaryColor?: string
  logoAspectRatio?: string
  isLocked?: boolean
}
```

Upserts on `clientId` uniqueness.

---

## UI Changes

### `components/projects/client-settings-form.tsx`

- Add a new "Branding" section with the same visual design as the current firm branding panel:
  - "Brand name" text input (required before saving brand)
  - Logo upload with aspect ratio picker
  - Tagline / subtext field
  - Primary color picker
  - Accent color picker
  - Header preview
- Add "Duplicate from another client" button:
  - Opens a modal listing all `Brand` records for clients in the same firm, excluding locked ones
  - User selects a source brand and enters a new name
  - Calls `POST /api/clients/[clientId]/brand/duplicate`
- Add lock/unlock toggle (firm admins only) — `isLocked` prevents duplication to other clients.
- Entire Branding section only renders when client has a `connectorId` (Drive set up); otherwise show "Set up Document Storage first" placeholder.

### `components/projects/firm-settings-form.tsx`

- Remove the entire Branding column (logo upload, colors, tagline, header preview).
- Remove all branding state variables and handlers.
- Remove `handleRemoveLogo`, logo file input, and canvas export logic.

### `lib/use-firm-branding.ts` → rename concept to `useActiveBranding`

- When pathname includes `/c/[clientSlug]`: fetch `GET /api/clients/[clientId]/brand` and map to `OrganizationBranding`; fall back to Firma default (`{ name: null, logoUrl: null, themeColor: null, ... }`) if no brand is set.
- When pathname is firm-only: return Firma default immediately (firm branding removed).
- Cache key changes from firm slug to client slug.

---

## Cleanup

- Remove `logoUrl`, `brandingSubtext`, `themeColorHex` from `FirmWithMembers` interface in `lib/firm-service.ts`.
- Remove `settings.branding` merge from `updateFirm` in `lib/actions/firms.ts`.
- Remove `FirmBranding` interface from `lib/actions/firms.ts`.
- Remove `/api/firms/[firmId]/logo` route entirely.

---

## Verification Checklist

1. `npm run typecheck` — 0 errors.
2. `npm test` — all tests pass.
3. Client Settings → Branding section renders; logo upload works.
4. Topbar shows client brand when inside client context; shows Firma default otherwise.
5. Duplicate brand: picks source, enters name, new record created, logo copied in Drive.
6. Locked brand: duplicate button disabled for locked source brands.
7. Firm Settings no longer has a Branding column.
