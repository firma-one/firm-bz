# Plan: Introduce `platform.groups` as the Billing Root Entity

## Context

The current design uses a self-referential `firms` table where `anchorFirmId` points to the billing root. This is semantically confusing — a "firm" plays two roles: workspace and billing container. Since we have no production users and redeploy from scratch, we can do this cleanly now by introducing a proper `platform.groups` table. The subscription attaches to the group, and every firm has a `groupId` FK. This also gives us a named entity (`"Deepak's Firm Group"`) we can surface in the UI and allow users to rename in future.

---

## New Schema: `platform.groups`

```prisma
model Group {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String                         // auto-encrypted via ENCRYPTED_FIELDS_MAP
  settings  Json     @default("{}")
  createdBy String?  @db.Uuid
  createdAt DateTime @default(now())
  updatedBy String?  @db.Uuid
  updatedAt DateTime @updatedAt

  firms     Firm[]
  members   GroupMember[]

  @@map("groups")
  @@schema("platform")
}

model GroupMember {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  groupId   String   @db.Uuid
  userId    String   @db.Uuid
  role      String   @default("GROUP_MEMBER")   // GROUP_ADMIN | GROUP_MEMBER
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@index([groupId])
  @@index([userId])
  @@map("group_members")
  @@schema("platform")
}
```

Add to `Firm` model — replace `anchorFirmId` with `groupId`:
```prisma
// Remove:
anchorFirmId  String?  @db.Uuid
anchorFirm    Firm?    @relation("FirmAnchorHierarchy", ...)
anchoredFirms Firm[]   @relation("FirmAnchorHierarchy")
@@index([anchorFirmId])

// Add:
groupId  String   @db.Uuid
group    Group    @relation(fields: [groupId], references: [id])
@@index([groupId])
```

Add to `ENCRYPTED_FIELDS_MAP` in `frontend/lib/prisma.ts`:
```typescript
group: ['name'],
```

---

## Migration Strategy

All changes squashed into `20260416120000_init_platform` (no production data to migrate — deploy from scratch).

---

## Steps

### 1. ✅ DONE — Prisma Schema
**`frontend/prisma/schema.prisma`**
- Added `Group` and `GroupMember` models
- Removed `anchorFirmId`, `anchorFirm`, `anchoredFirms` from `Firm`
- Added `groupId String @db.Uuid` + `@@index([groupId])`

### 2. ✅ DONE — Encryption
**`frontend/lib/prisma.ts`** — added `group: ['name']` to `ENCRYPTED_FIELDS_MAP`

### 3. ✅ DONE — Migration squashed into init_platform
- `groups` and `group_members` tables added before `firms` in `20260416120000_init_platform/migration.sql`
- `anchorFirmId` column replaced with `groupId UUID NOT NULL`
- Indexes and FKs updated accordingly
- Separate `20260614090425_add_groups_and_group_members` migration deleted

### 4. ✅ DONE — Billing Group Resolution
**`frontend/lib/billing/billing-group.ts`**
- `resolveGroupId(firmId)` — queries `firm.groupId` directly
- All count/list functions filter by `{ groupId }`
- Deprecated alias `resolveBillingAnchorFirmId` kept for transition

### 5. ✅ DONE — Firm Service
**`frontend/lib/firm-service.ts`**
- `CreateFirmData`: `anchorFirmId` replaced with `groupId: string` (required)
- `createFirmWithMember`: stores `groupId` on firm row; skips membership check for sandbox firms

### 6. ✅ DONE — Firm Creation Gate
**`frontend/lib/billing/firm-creation-gate.ts`**
- `getEligibleGroups(userId)` replaces `getEligibleSatelliteAnchorCandidates`
- `resolveGroupForNewFirm(userId)` replaces `resolveBillingAnchorForNewSatelliteFirm`
- `userHasMembershipInGroup` replaces `userHasMembershipUnderAnchor`
- Deprecated aliases kept

### 7. ✅ DONE — Onboarding — Sandbox Creation
**`frontend/app/api/onboarding/create-sandbox/route.ts`**
- Creates group named `"${firstName}'s Firm Group"` with user as `GROUP_ADMIN` first
- Then creates sandbox firm with `groupId: group.id`

### 8. ✅ DONE — getUserFirms & FirmOption
**`frontend/lib/actions/firms.ts`**
- `FirmOption` now has `groupId` and `groupName`
- `getUserFirms()` includes `group: { select: { id: true, name: true } }`

### 9. ✅ DONE — Billing Page Client
**`frontend/components/billing/billing-page-client.tsx`**
- Shows group name via `selectedFirm.groupName ?? selectedFirm.name`
- Label changed to "FIRM GROUP", heading to "Billing Entity"

### 10. ✅ DONE — All Billing API Routes
- `checkout/route.ts` — `customerExternalId: groupId`
- `webhooks/polar/route.ts` — uses `r.groupId` / `r.anchorFirmId` correctly
- `billing/engagement-gate/route.ts` — `resolveGroupId`
- `billing/client-gate/route.ts` — `resolveGroupId`
- `billing/document-gate/route.ts` — `resolveGroupId`
- `billing/current-plan/route.ts` — `resolveGroupId`
- `billing/upgrade-nudge-status/route.ts` — `resolveGroupId` + sandbox firm lookup
- `billing/skip-upgrade/route.ts` — `resolveGroupId` + sandbox firm lookup
- `billing/subscription/cancel/route.ts` — `resolveGroupId` + sandbox firm lookup
- `billing/customer-portal/route.ts` — `resolveGroupId`, portal opened with `groupId`

### 11. ✅ DONE — Subscription & Entitlement Libs
- `polar-free-plan.ts` — `resolveGroupId` replaces `resolveBillingAnchorFirmId`
- `user-settings-plus.ts` — queries sandbox firm per group for entitlements
- `subscription-metadata.ts` — `resolveGroupId`
- `effective-billing-caps.ts` — `resolveGroupId`, finds sandbox firm in group
- `billing-user-session-sync.ts` — `groupId` parameter
- `polar-billing-lifecycle.ts` — `groupId` for reminders; group admin email fetched via `GroupMember` + Supabase admin for `resyncSandboxFreePlanAfterPaidSubscriptionEnd`

### 12. ✅ DONE — Create Org / Custom Workspace / Firms Routes
- `create-org/route.ts` — passes `groupId` to `createFirmWithMember`
- `create-custom-workspace/route.ts` — passes `groupId`
- `app/api/firms/route.ts` — passes `groupId`
- `lib/actions/firms.ts` — passes `groupId`
- `lib/actions/profile.ts` — `resolveGroupId` for Polar customer name sync
- `lib/billing/billing-profile.ts` — `resolveGroupId`
- `lib/services/auto-import.ts` — passes `groupId`

### 13. ✅ DONE — System Data Map
- `lib/system/user-data-map.ts` — `resolveGroupId`, `billing.groupId` field
- `app/(app)/system/user-data-map/page.tsx` — renders "Billing group" label

---

## 14. ✅ DONE — Migrate `subscriptions.firmId` → `subscriptions.groupId`

**Why**: `subscriptions.firmId` currently points to the sandbox firm (billing root firm). But the real billing entity is the **group**, not a firm. `customerExternalId` in Polar is already `groupId`. Having subscriptions keyed by `groupId` removes the two-step "find sandbox firm → look up subscription by its firmId" indirection used throughout the codebase, and aligns the DB with the Polar billing model.

**Changes:**

#### 14a. Prisma Schema — `frontend/prisma/schema.prisma`
- On `Subscription` model: remove `firmId String @db.Uuid`, add `groupId String @db.Uuid`
- Remove `firm Firm @relation(...)` on `Subscription`
- Add `group Group @relation(fields: [groupId], references: [id])` on `Subscription`
- Add `subscriptions Subscription[]` to `Group` model
- Update unique index: `subscriptions_one_active_per_firm` → `subscriptions_one_active_per_group` on `groupId`

#### 14b. Init migration — `20260416120000_init_platform/migration.sql`
- In `CREATE TABLE "platform"."subscriptions"`: replace `"firmId" UUID NOT NULL` with `"groupId" UUID NOT NULL`
- Replace index `subscriptions_firmId_active_idx` with `subscriptions_groupId_active_idx`
- Replace FK `subscriptions_firmId_fkey` with `subscriptions_groupId_fkey` → references `platform.groups(id)`
- Replace unique index `subscriptions_one_active_per_firm` with `subscriptions_one_active_per_group` on `groupId`

#### 14c. `polar-free-plan.ts`
- `persistFirmWithLifetimeFreePlan(anchorFirmId, ...)` → `persistGroupWithLifetimeFreePlan(groupId, ...)`
- All `where: { firmId: anchorFirmId }` on subscription queries → `where: { groupId }`
- All `data: { firmId: anchorFirmId }` on subscription creates → `data: { groupId }`

#### 14d. `polar-webhook-sync.ts`
- `resolveFirmForPayload`: finds firm by groupId (already does this); subscription write uses `groupId`
- `PolarSubscriptionSyncResult`: remove `anchorFirmId`, keep only `groupId` + `resolvedFirmId` (the sandbox firm id, for lifecycle callers that need it)
- All subscription `create`/`update`/`updateMany`/`findFirst` calls: `firmId` → `groupId`

#### 14e. `active-billing-subscription.ts`
- `getActiveSubscriptionForFirm(firmId)` → `getActiveSubscriptionForGroup(groupId)`
- All callers updated

#### 14f. `subscription-audit.ts`
- `resolveSubscriptionAuditUserId(tx, anchorFirmId, ...)` → resolves admin via `groupMember` instead of `firmMember`

#### 14g. `effective-billing-caps.ts`
- `loadAnchorForCaps`: subscription lookup now `where: { groupId }`
- `assertWithinFirmGroupCap`: same

#### 14h. `user-settings-plus.ts`
- `computePlanEntitlementsByFirm`: subscription lookup now `where: { groupId: { in: groupIds } }`; no longer needs to find sandbox firms first

#### 14i. `subscription-metadata.ts`
- `getActiveSubscriptionMetadataForFirm`: lookup by `groupId` directly

#### 14j. Billing API routes that call `getActiveSubscriptionForFirm` with a `billingFirmId`
- `current-plan/route.ts`, `cancel/route.ts`, `customer-portal/route.ts`, `upgrade-nudge-status/route.ts`, `skip-upgrade/route.ts`
- All now pass `groupId` directly — no sandbox firm lookup needed

#### 14k. `polar-billing-lifecycle.ts`
- `resyncSandboxFreePlanAfterPaidSubscriptionEnd(anchorFirmId)` → parameter becomes `groupId`
- `maybeRevokeFreePolarAfterPaidSubscriptionSync`: `revokeAllOtherPolarSubscriptions` receives `groupId` as the Polar `externalId`
- `webhooks/polar/route.ts`: callers updated accordingly

---

## Verification

1. Run `npm run build` to apply migration and catch type errors
2. Sign up as new user → check DB: `platform.groups` has a row; `platform.subscriptions` row has `groupId` (not `firmId`)
3. Visit `/d/billing` — plan shown correctly
4. Checkout flow → Polar `customerExternalId` matches `group.id`; subscription row in DB has `groupId`
5. Webhook fires → subscription row updated by `groupId`
