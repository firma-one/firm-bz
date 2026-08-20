# Remove Per-User Sandbox Demo Firm from Onboarding

## Context

Onboarding currently creates a per-user "sandbox" demo firm (`Firm.sandboxOnly: true`) seeded with fixture clients/engagements, and this *is* the entire onboarding flow — there's no other path to create a real firm at signup. Now that the static, unauthenticated `/demo` route replicates the product-preview/learning purpose the sandbox firm served, the DB-backed sandbox firm is redundant and should be retired.

**Revised scope (no paying customers on prod, so no backward-compat burden):**
- No legacy-branch preservation, no data migration, no burn-in period — replace outright.
- No new onboarding wizard needed. A firm+group is auto-created silently on first login; there's no user-facing "create your first firm" step at all.
- Google Drive connection is **not** required for Firm/Client/Engagement creation — this is already the live architecture today (confirmed: `createClient`/`createEngagement`/`createFirm` never require a connector; folder provisioning is optional/deferred, with existing "Connect Drive" / "Set up Drive Folder" empty states already shipped in the Files UI and a graceful no-op in the member-join flow). Nothing to build here — just stop routing new users through the mandatory Drive-connect onboarding step.
- `/demo` becomes the self-guided "learn the app" surface, linked from the topbar (same treatment as the guided-tour entry point already on the `/demo` page itself) — available to all users, not just new ones.

**Existing sandbox firms for current users: stop fetching/displaying them entirely.** Unlike the earlier draft of this plan, existing sandbox firms are not preserved for continuity — `sandboxOnly:true` firms should simply be excluded from firm lists/switchers/routing for all users going forward, not just no-longer-created for new ones. This means the `SandboxInfoBanner` call sites, `sandbox-file-preview.tsx`, `sandbox-board-comments-preview.tsx`, and any other `sandboxOnly`/`isSandboxFirm` UI branches become fully dead (never rendered, since no sandbox firm will ever be fetched/shown) — safe to delete outright rather than leave inert. `lib/services/sandbox-hierarchy.json` / `sample-file-service.ts` can be deleted once those consuming components are removed.

## Current State (research findings)

- **Onboarding IS sandbox creation.** `app/(app)/d/onboarding/page.tsx` Step 1 auto-fires a POST to `app/api/onboarding/create-sandbox/route.ts`, which creates a `Group` + `Firm` (`sandboxOnly: true`), anchors Polar billing via `ensurePolarFreePlanForSandboxFirm`, and seeds fixture clients/engagements via `seedSandboxClientsInDb` (`lib/onboarding/onboarding-helper.ts:690-768`). Steps 2-4 are billing/Drive/finish, all scaffolded around that sandbox firm.
- **Billing is already group-native where it matters.** `platform.subscriptions` is keyed by `groupId` (not `firmId`) — `polarCustomerId`, `plan`, `pricingModel`, entitlements all live there. This part of the earlier "groups as billing root" refactor is done.
- **The one real remaining coupling:** `loadAnchorForCaps` (`lib/billing/effective-billing-caps.ts:68-93`) and `ensurePolarFreePlanForSandboxFirm` (`lib/billing/polar-free-plan.ts`) take a `firmId` parameter by signature (not `groupId`), and `anchorUsesSandboxCapDefaults()` (`effective-billing-caps.ts:100-104`) decides free-vs-paid cap defaults by reading a specific firm row's `sandboxOnly` flag — a real dependency, not a formality. `getEligibleGroups`/`getFirmCreationGateReason` (`lib/billing/firm-creation-gate.ts`) and `resyncSandboxFreePlanAfterPaidSubscriptionEnd` (`lib/billing/polar-billing-lifecycle.ts:70-74`) all do `prisma.firm.findFirst({ groupId, sandboxOnly: true })` purely to obtain a `firmId` to hand to those two functions.
- **`entitledFirms`/plan-cap counting is already correct** — `countBillableFirmsInBillingGroup` (`lib/billing/billing-group.ts:55-59`) already filters `sandboxOnly: false`. No change needed there.
- **Drive is already decoupled from Firm/Client/Engagement creation** (confirmed live, not aspirational): `createClient`/`createEngagement` attempt Drive folder provisioning post-creation in a try/catch, skipped entirely if no connector exists; `EngagementFileList` already renders "No Google Drive connected" / "Set up Drive Folder" empty states; `joinEngagementForUser` grants Drive access as an optional no-op step. Nothing to build.
- **Dead code, no action needed:** `runSandboxOnboarding`/`provisionSandboxHierarchyForFirm` (`onboarding-helper.ts:314-688`) have zero live callers already. Leave as-is or delete opportunistically — not required for this refactor.
- **Pricing page** (`app/(marketing)/pricing/page.tsx`, `config/pricing.ts`) has a full "Sandbox" comparison-table column, a dedicated free-sandbox plan card, and footer CTA copy mentioning "Demo firm" — needs rework once sandbox onboarding is gone.

## Approach

### Step 0 — Introduce `Group.slug` and a centralized firm-path URL builder, restructure routes under `/d/[groupSlug]/f/[firmSlug]/...`

**Decision: the group becomes part of the URL, not just a routing/session concept.** Every `/d/f/{slug}/...` route moves to `/d/{groupSlug}/f/{firmSlug}/...`. Since there are no real production users yet, breaking all existing reminder/invitation links embedded in previously-sent emails is accepted — those get cleared via a one-off admin script (see below) rather than preserved.

**Correction from earlier research:** `Group` does **not** currently have a `slug` field or column — confirmed against both `prisma/schema.prisma` and the live `platform.groups` table (columns: `id`, `name`, `settings`, `createdBy/At`, `updatedBy/At` only). A `slug` needs to be added as new schema work, not adopted from something pre-existing.

- **Prisma migration** (`npx prisma migrate dev --create-only`, not applied — per CLAUDE.md): add `Group.slug String @unique`.
  - **New-group generation**: add a `generateGroupSlug(name: string)` to `lib/slug-utils.ts`, same `base(7 chars) + '-' + random-suffix(4 chars)` shape as `generateFirmSlug`/`generateClientSlug` (via `generateUniqueSlug`) — used going forward at group-creation time (Step 2's silent auto-provisioning).
  - **Backfill for the 6 existing groups**: derived from the **creating user's first name**, not `Group.name` — confirmed `Group.name` is application-encrypted at rest (`v1$...` ciphertext in `platform.groups.name`, via the `lib/encryption.ts`/`lib/prisma.ts` field-encryption extension), so it can't be slugified directly inside a raw-SQL migration anyway. Source instead: `auth.users.raw_user_meta_data->>'first_name'` joined via `Group.createdBy`, same field `create-sandbox/route.ts:141` already reads for the sandbox-firm-group display name. Confirmed live: 3 of the 6 existing groups have a populated `first_name`; the other 3 have `null` (real data, not hypothetical) and need a fallback (e.g. `'group'` + random suffix, matching `SANDBOX_FIRM_NAME_FALLBACK`'s spirit). Migration SQL, conceptually:
    ```sql
    UPDATE platform.groups g
    SET slug = lower(regexp_replace(
          COALESCE(NULLIF(trim(u.raw_user_meta_data->>'first_name'), ''), 'group'),
          '[^a-z0-9]+', '-', 'g'
        )) || '-' || substr(md5(random()::text), 1, 4)
    FROM auth.users u
    WHERE u.id = g."createdBy";
    ```
    (Exact regex/truncation to mirror `generateSlug`'s behavior precisely — implement as a data migration that calls the real TS helper via a one-off script if closer parity to `generateSlug`'s truncation/edge-case handling is wanted, rather than reimplementing its logic in raw SQL.)
- **Route restructure**: move `app/(app)/d/f/[slug]/...` → `app/(app)/d/[groupSlug]/f/[firmSlug]/...` (Next.js file-tree rename). `/d/[groupSlug]/f/` becomes the group-scoped firm picker (replaces today's flat `/d/f/`); `/d/[groupSlug]/f/[firmSlug]/...` replaces every nested client/engagement route.
- **Create `lib/navigation/firm-paths.ts`** with typed builder functions for the new `/d/{groupSlug}/f/{firmSlug}/...` shapes: `firmPath(groupSlug, firmSlug)`, `firmSettingsPath(groupSlug, firmSlug, section?)`, `clientPath(groupSlug, firmSlug, clientSlug)`, `engagementPath(groupSlug, firmSlug, clientSlug, engSlug, tab?)`, plus the doc-comment/doc-file hash-fragment variants used by `entity-registry.ts`. This is now load-bearing, not optional — every one of the ~52 existing inline-template-literal call sites is broken by the route rename and must be updated to call the new builder rather than hand-writing the new shape ad hoc.
- **All ~52 call sites need updating in this pass** (unlike the earlier "adopt opportunistically" framing, which assumed the URL shape wasn't changing) — this is a mechanical, find-and-replace-driven migration since every existing `/d/f/{slug}` construction site already has the firm object in scope, and the firm object already carries `firm.groupId` (just needs the group's `slug` joined in, or `group.slug` selected alongside `group.id` wherever `firm.group` is already included — e.g. `getUserFirms()` and friends).
- **Reminder cleanup**: write a one-off admin script (`scripts/` or `app/api/system/*`, following existing admin-script conventions) that deletes all rows in whatever reminder table stores previously-generated `/d/f/...` deep links, since those are now permanently invalid. Run manually once, post-deploy, not as part of the automated migration.

### Step 1 — Billing: make the free/paid cap check group-native

- Change `loadAnchorForCaps` to accept `groupId` directly instead of `firmId`.
- Replace `anchorUsesSandboxCapDefaults()`'s `firm.sandboxOnly` check with a read of the group's actual `Subscription.plan`/`pricingModel` (free-tier plan → sandbox-equivalent default caps; any paid plan → paid caps). This is the real signal already sitting on `platform.subscriptions` — no schema change needed.
- Change `ensurePolarFreePlanForSandboxFirm` to accept `groupId` directly (it already just round-trips `firmId → resolveGroupId(firmId) → groupId` internally — drop the middleman). Rename to `ensureGroupFreePlan` or similar while touching it.
- Update the 3-4 call sites (`firm-creation-gate.ts`, `polar-billing-lifecycle.ts`, wherever else) to pass `groupId` directly — no more `prisma.firm.findFirst({ sandboxOnly: true })` lookups anywhere in billing.
- `billing-profile.ts`'s cosmetic "anchor firm name/slug" display fallback — just use whichever firm is first/default in the group, no `sandboxOnly` involved.

### Step 2 — Onboarding: replace with silent auto-provisioning

- On first login with zero firms (same trigger point `resolveDefaultFirmLandingPath` uses today), auto-create a `Group` + real `Firm` (`sandboxOnly: false`) silently — reuse `findOrCreateSandboxShellFirm`'s creation logic minus the sandbox flag and fixture seeding, and call the new `ensureGroupFreePlan(groupId)` from Step 1 to anchor billing.
- Delete the `/d/onboarding` multi-step wizard UI entirely (or reduce it to nothing — confirm during implementation whether the route itself can be removed or should redirect straight to `/d/f`). No firm-name input, no billing step, no mandatory Drive step.
- Add the "upgrade to increase limits" banner (mentioned as already-existing pattern) to the group's free-tier state if not already wired to trigger for auto-provisioned firms.

### Step 3 — Add `/demo` link to the authenticated app topbar

- Add a persistent topbar entry point (icon/link) to `/demo`, opened in a new tab — same visual treatment as the `MapPinned` guided-tour icon already on the `/demo` page's own topbar. Available to all users.

### Step 4 — Delete sandbox creation and stop displaying existing sandbox firms

- Delete `app/api/onboarding/create-sandbox/route.ts`.
- Delete `seedSandboxClientsInDb` + `SANDBOX_CLIENT_PRIMARY_CONTACTS` from `lib/onboarding/onboarding-helper.ts`.
- Remove the onboarding page's sandbox-specific UI (`SandboxHierarchyPreview`, `buildFinalizeTerminalSteps`, the `SANDBOX_HIERARCHY` import) along with the rest of the wizard per Step 2.
- **Add `sandboxOnly: false` to `getUserFirms()`'s query filter** (`lib/firm-service.ts`) so existing sandbox firms stop appearing anywhere firms are listed — firm switcher, `/d/f` picker, sidebar, `resolveDefaultFirmLandingPath`. This is the one-line change that makes them fully unreachable for current users, not just for new signups.
- Delete the now-fully-dead `SandboxInfoBanner` call sites, `sandbox-file-preview.tsx`, `sandbox-board-comments-preview.tsx`, `lib/services/sandbox-hierarchy.json`, `sample-file-service.ts` (in that order — components first, then their data dependency).
- Grep sweep for `create-sandbox` / `seedSandboxClientsInDb` / `sandboxOnly` references before each deletion to confirm nothing else calls them.

### Step 5 — Pricing page cleanup

- Remove the "Sandbox" comparison-table column (`PRICING_SANDBOX_COLUMN_ID` in `config/pricing.ts` and its usages in `app/(marketing)/pricing/page.tsx`), the free-sandbox plan card, and footer CTA copy referencing "Demo firm." This reshapes the comparison table layout, not just copy — worth a quick visual check once done.

### Step 6 — Group Picker at `/d/`

**Why it belongs in this refactor:** once onboarding auto-provisions a firm+group silently (Step 2) and sandbox firms stop cluttering firm lists (Step 4), the "which workspace am I in" routing surface (`resolveDefaultFirmLandingPath`) is being touched anyway — this is the moment to also make it group-aware, since a user with access to firms across multiple distinct groups (via `FirmMember` invites into someone else's group) currently has no first-class way to pick "which group am I working in." This scenario doesn't exist in prod yet, but will as soon as cross-group invites happen, and the routing function is already in scope this refactor.

**New routing rules** (replaces today's rule #2, which is firm-count-based; groups become the top-level unit, firms are the second-level unit within a group):

1. Zero groups → `/d/onboarding` (new user, unchanged from today's rule #1).
2. **2+ distinct groups** → land on `/d/` showing one card per group, reusing `firm-list.tsx`'s grid-mode card design (icon avatar, name, active/default indicators) — labeled by group name, e.g. "Deepak's Firm Group," "Shubham's Firm Group." Picking a card routes to `/d/{groupSlug}/f/`.
3. **Exactly 1 group, and that group has 2+ firms** → skip the group picker (nothing to pick, only one group) and land on `/d/{groupSlug}/f/`, the firm picker scoped to that group's firms — same picker UI as today, just group-scoped in the URL now rather than the old flat `/d/f/`.
4. **Exactly 1 group, and that group has exactly 1 firm** → skip both pickers entirely and land straight on `/d/{groupSlug}/f/{firmSlug}`, exactly as today's single-firm fast path, just with the group segment now present in the URL.
5. Existing admin/onboarding-incomplete/domain-org sub-rules (today's rules #4-6) still apply *within* whichever firm is ultimately reached by rules 3-4 above — unchanged.

Every resolved path in rules 2-4 is built via the `firm-paths.ts` helper from Step 0, using the group's newly-added `slug`.

Distinct-group membership is derived from `getUserFirms()`'s existing `firm.group` fan-out, deduped by `groupId` — not `GroupMember` rows, which today only ever number 1 per user and aren't the right signal here.

- **JWT / `UserSettingsPlus` / session logic does not change.** The group picker is purely a routing/selection layer sitting *above* today's firm-scoped session logic — once a firm is actually selected (via any of rules 2-4 above), `app_metadata`, `UserSettingsPlus`, and all downstream permission/session logic continue to be built exactly as today, keyed off the selected firm.
- **`AppSidebar` needs a reduced state for a bare `/d/` landing** (rule 2 only) — today's sidebar assumes it's always rendered inside a firm-scoped layout (`d-layout-client.tsx`). A group-picker landing has no "current firm" yet, so its sidebar chrome needs its own adapted state (no firm switcher showing a specific firm, no firm-scoped nav tree) until a group/firm is actually selected — similar in spirit to how `/d/f`'s existing picker page already renders without being deep in a specific firm's context.
- Insertion point: replace rule #2 inside `resolveDefaultFirmLandingPath` (`lib/actions/firms.ts`) with the group-aware rules 2-4 above — centralizing it there means `d/layout.tsx` and `/d/f/page.tsx`'s existing calls to this function pick up the new behavior automatically, no changes needed on their end.

**Breadcrumb navigation must reflect the new hierarchy.** Today's firm-level breadcrumb (`firm-clients-view.tsx:143-148`, and the equivalent leading segment in `client-project-view.tsx`/`engagement-workspace.tsx`) starts with a static, non-clickable `Home` icon — there's currently no way to navigate "back up" from a firm to a firm list, or from a firm list to a group list. This needs to become real, conditional navigation:
- The leading breadcrumb segment (today's static `Home` icon) becomes a clickable link back to **`/d/{groupSlug}/f/`** (the firm list, group-scoped) whenever the user's current group has **2+ firms** — so a user working inside "Acme Corp" can click back to see all firms in their group. If the group has only 1 firm, this segment stays non-interactive (nothing to go back to at that level).
- When the user belongs to **2+ distinct groups**, breadcrumbs everywhere (firm/client/engagement level) grow one level higher: a new leading segment for the **current group name**, clickable back to **`/d/`** (the group picker) — so a user can navigate all the way back to "pick a different firm group," not just "pick a different firm within this group." If the user belongs to only 1 group, this segment is omitted entirely (nothing to pick between).
- Net effect: breadcrumb depth is dynamic based on the signed-in user's actual group/firm counts, not a fixed shape — a single-group, single-firm user's breadcrumb looks exactly as it does today (no group segment, non-clickable firm segment); a multi-group, multi-firm user sees the full chain: `[Group name] → [Firm name] → [Client] → [Engagement]`, each segment clickable back to its respective picker.
- This touches every breadcrumb render site across the firm/client/engagement views (`firm-clients-view.tsx`, `client-project-view.tsx`, `engagement-workspace.tsx`, and the equivalent demo-static counterparts should NOT be touched — the `/demo` route's breadcrumbs stay as they are, this is authenticated-app-only) — worth factoring into one shared `AppBreadcrumb` component during implementation rather than duplicating the conditional logic four times.

## Critical Files

- `prisma/schema.prisma` (new `Group.slug`, migration `--create-only`)
- `lib/navigation/firm-paths.ts` (new — centralized URL builder, group+firm-slug aware)
- `app/(app)/d/f/[slug]/...` → `app/(app)/d/[groupSlug]/f/[firmSlug]/...` (full route-tree rename)
- ~52 existing `/d/f/{slug}` call sites (components, server actions, API routes, reminder/invitation link generators) — all updated to the new builder/route shape
- `app/(app)/d/onboarding/page.tsx` (deleted or drastically reduced)
- `app/api/onboarding/create-sandbox/route.ts` (deleted)
- `lib/billing/effective-billing-caps.ts`, `firm-creation-gate.ts`, `polar-free-plan.ts`, `polar-billing-lifecycle.ts`, `billing-profile.ts`
- `lib/actions/firms.ts` (silent auto-provision path + group-count routing rule)
- `lib/onboarding/onboarding-helper.ts` (seeding removed)
- `lib/firm-service.ts` (`getUserFirms` sandbox filter)
- `app/(marketing)/pricing/page.tsx`, `config/pricing.ts`
- `app/(app)/d/page.tsx`, `app/(app)/d/layout.tsx` (group-picker landing)
- `components/projects/firm-list.tsx` (card design source for the new group-picker cards)
- `components/app/app-sidebar.tsx` (reduced state for bare `/d/` landing)
- New admin script to clear stale pre-migration reminder deep links
- Wherever the app topbar lives (add `/demo` link)

## Verification

- New signup: lands directly in the app with an auto-created real firm, zero onboarding steps, can create clients/engagements immediately with no Drive connector, sees the upgrade banner once relevant caps are hit.
- Billing: free-tier caps still apply correctly (now via `Subscription.plan`, not a firm flag); creating a firm/client/engagement still respects group caps.
- `/demo` link reachable from the topbar in the authenticated app.
- Existing sandbox firms no longer appear anywhere (firm switcher, `/d/{groupSlug}/f/`, sidebar) for any user.
- Single-group, single-firm user: signs in, lands directly on `/d/{groupSlug}/f/{firmSlug}` — no picker shown at all.
- Single-group, multi-firm user: signs in, lands on `/d/{groupSlug}/f/` (group-scoped firm picker) — no group picker shown.
- Multi-group user (test by manually creating a second group + firm for a test account, or via a cross-group `FirmMember` invite once that exists): signs in, lands on `/d/` group-picker, sees one card per group, picking a card routes correctly into that group's `/d/{groupSlug}/f/...`; JWT/session state is correct for whichever firm is ultimately selected.
- All ~52 migrated call sites produce correct `/d/{groupSlug}/f/{firmSlug}/...` URLs (spot-check invitation accept flow, reminder CTA links, firm switcher, sidebar nav, breadcrumbs).
- Stale pre-migration reminders cleared via the admin script; no lingering references to the old flat `/d/f/{slug}` shape anywhere live.
- `npx tsc --noEmit` clean.
- Grep sweep confirms no remaining references to deleted functions/routes/old URL shape before each deletion.
