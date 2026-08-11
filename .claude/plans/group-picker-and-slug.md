# Plan: `/d/g` Group Picker + `Group.slug` (Hidden, for Manual Multi-Group Testing)

## Context

User B was invited into User A's firm as an engagement member (`firm_member` role, not `firm_admin`). There is currently no UI path for B to create their own independent Firm:

- `/d/onboarding` redirects any non-`firm_admin` member straight into their existing firm workspace (`frontend/app/(app)/d/onboarding/page.tsx:838-847`), skipping the create-firm wizard.
- The "New Firm" button on `/d` (`AddFirmModal` → `createFirm()` in `frontend/lib/actions/firms.ts:241`) requires `requireNonSandboxFirmCreationAccess`, which requires the user to already be `firm_admin` somewhere (`frontend/lib/billing/firm-creation-gate.ts:21-59`). B fails this and sees a misleading "entitlements consumed" message.
- The **sandbox firm creation logic** (`findOrCreateSandboxShellFirm`, `frontend/app/api/onboarding/create-sandbox/route.ts:26-70`) has no such gate — it creates a brand-new `Group` (user becomes `GROUP_ADMIN`) plus a sandbox `Firm` (user becomes `firm_admin`), fully independent of any existing membership. This is the right mechanism; it's just not exposed outside the full onboarding wizard.

The data model already supports multi-group membership cleanly: `FirmMember` is unique on `[userId, firmId]`, not per-user (`frontend/prisma/schema.prisma:485-503`), so a user can belong to many firms/groups at once.

**This pass is a hidden, unlinked testing surface** — not the end-user UX yet — so Deepak can manually create and navigate a second independent firm group for the same account, to validate multi-group behavior (billing isolation, membership isolation, firm switching) before deciding how to expose this to real engagement-only members later.

A secondary problem surfaced during planning: `Group` has no `slug`, and no URL today identifies "which group am I in" — `/d/f` lists all firms across all groups undifferentiated. To make `/d/g` navigable at all, `Group` needs a slug and a group-scoped firm-listing route.

**Constraint (explicit from Deepak): do not change `/d/f` routing at all in this pass** — neither `/d/f/page.tsx` (the all-firms picker) nor `/d/f/[slug]/page.tsx` (the firm workspace). This is safe to honor without any workaround: `/d/f/[slug]/page.tsx` and its loader (`getClients`, `frontend/lib/actions/hierarchy.ts:234-243`) key purely off `Firm.slug`, with no dependency on `Group` at all. The new group-scoped route is purely additive — it resolves a `Group` by slug, lists that group's `Firm`s, and links to the existing unmodified `/d/f/{firmSlug}` URLs. No shared code path needs to change.

## Scope for this pass

- No button/menu/link anywhere in the app points to `/d/g` — reachable only by typing the URL while signed in.
- `/d/f` (list) and `/d/f/[slug]` (workspace) are **not modified** — confirmed no shared dependency forces a change.
- No changes to `AddFirmModal`, `firm-creation-gate.ts`, or the `/d/onboarding` redirect — real end-user behavior is untouched.
- Reuses `/api/onboarding/create-sandbox` as-is for creation (no new creation endpoint).

## Changes

### 1. Add `slug` to `Group` (schema + migration)

**`frontend/prisma/schema.prisma`** — add to `Group` model (~line 182-197):
```prisma
slug String @unique
```

**Migration** (new folder via `npx prisma migrate dev --name add_group_slug --create-only`, per CLAUDE.md rule — never apply directly): `Group` already has production rows (created via 5 call sites below), so the migration must, in this order (mirroring the existing pattern in `20260608000000_brand_standalone/migration.sql`):
1. `ALTER TABLE "platform"."groups" ADD COLUMN "slug" TEXT;` (nullable first)
2. Hand-written `UPDATE` backfilling a slug for existing rows (e.g. derived from `name` + row id fragment, since Prisma can't run the TS slug util at migration time)
3. `ALTER TABLE "platform"."groups" ALTER COLUMN "slug" SET NOT NULL;`
4. `CREATE UNIQUE INDEX "groups_slug_key" ON "platform"."groups"("slug");`

**New slug helper** — `frontend/lib/slug-utils.ts`: add `generateGroupSlug(name)`, mirroring `generateFirmSlug` (`slug-utils.ts:62-64`, itself `generateUniqueSlug(name, 7, 4)` — base+4-char random suffix, no DB collision-retry loop, relying on the unique constraint + randomness like the existing Firm/Client/Project/Share slug helpers).

**Wire into all 5 existing `Group` creation sites** (none currently set a slug):
- `frontend/app/api/onboarding/create-sandbox/route.ts:45` (the path this plan's page will call)
- `frontend/app/api/provision/route.ts:99`
- `frontend/lib/firm-service.ts:154` (`createOrGetFirm`)
- `frontend/lib/connectors/pockett-structure.service.ts:414`
- `frontend/lib/onboarding/onboarding-helper.ts:435`

Each gets `slug: await generateGroupSlug(groupName)` added to its `data` object, same pattern as existing `generateFirmSlug` call sites (`firm-service.ts:83-84`).

### 2. New route: `frontend/app/(app)/d/g/page.tsx` — group picker (only route added)

This is the **only** new page in this pass. No `/d/g/[slug]/f` or any other nested route — that only makes sense once `/d/f/[slug]` and everything nested under it (clients, engagements, etc.) actually moves to live under `/d/g/`. Until then, a group-scoped firm-listing page would just be a redundant filtered list that dead-ends back into `/d/f/{firmSlug}` anyway — no testing value, so it's deferred.

- Authenticated client page, same session-check pattern as `frontend/app/(app)/d/f/page.tsx`.
- Fetch groups via a new server action `getUserGroups()` in `frontend/lib/actions/firms.ts` (sibling to `getUserFirms`) — query `firmMember.findMany({ where: { userId }, include: { firm: { include: { group: true } } } })`, dedupe by `groupId`, and for each group resolve **one representative firm slug** to link to (see resolution rule below). Return `{ id, slug, name, firmSlug }[]`.
- Render one card per group (reuse `/d/f`'s card visual language — icon, name, "Continue" affordance).
- Clicking a group navigates directly to the existing, unmodified `/d/f/{firmSlug}` for that group's resolved firm — **not** a new intermediate page. `/d/f` itself stays completely untouched.
  - **Firm resolution rule per group** (needed since a group can in theory hold multiple firms): prefer the firm where `FirmMember.isDefault = true` if it happens to fall in that group; otherwise fall back to the group's earliest-created firm (mirrors the existing ordering already used by `getUserFirms()`, `frontend/lib/actions/firms.ts:61` — `orderBy: { firm: { createdAt: 'asc' } }`). For this testing tool, in practice every group created via `/d/g` (sandbox path) has exactly one firm, so this rule only matters for the pre-existing group(s) a real invited user already belongs to.
- **"Add Firm Group" button**, not gated on admin-anywhere (the point is letting a non-admin create their first group). Opens a small form: firm/group display name input → "Create".
- On submit: `POST /api/onboarding/create-sandbox` (unmodified) with `{ sandboxFirmName }`. This creates a new `Group` (now with a slug, per change #1) + sandbox `Firm`, makes the user `firm_admin`/`GROUP_ADMIN`, sets it as default firm, seeds sample data.
- On success: refresh the group list in place (new card appears) and/or redirect straight to `/d/f/{newFirmSlug}`.

### Out of scope / explicitly not touched

- `/d/f/page.tsx` and `/d/f/[slug]/page.tsx` — zero modifications.
- `getClients` / `hierarchy.ts` firm-workspace loader — zero modifications.
- `AddFirmModal`, `firm-creation-gate.ts`, `/d/onboarding` redirect logic — zero modifications; real end-user flows unaffected.
- No `/d/g/[slug]/...` nested routes yet — folding `/d/f` under `/d/g/` is a distinct future migration, not part of this pass.
- No end-user-facing "create your own firm" entry point yet — this stays a hidden manual-testing tool.

## Verification

1. Run `npm run build` locally to apply the new migration (per CLAUDE.md — migrations are created `--create-only` and applied via the normal build step, never `prisma migrate dev` directly).
2. Confirm existing `Group` rows in local DB got a backfilled, non-null, unique `slug` after migration.
3. Sign in as a user with a `firm_member` (non-admin) membership in some firm (e.g. via accepted engagement invite).
4. Visit `/d/g` directly (unlinked) → confirm the existing group is listed.
5. Click "Add Firm Group" → submit a name → confirm a new `Group` (with slug) + sandbox `Firm` is created, user is `firm_admin` on it, and the original `FirmMember` row in the inviting firm is untouched.
6. Confirm `/d/g` now lists both groups; clicking each navigates directly to `/d/f/{firmSlug}` for that group's resolved firm — no intermediate page.
7. Confirm `/d/f` (no slug) still lists all firms across both groups exactly as before — unaffected by this change.
