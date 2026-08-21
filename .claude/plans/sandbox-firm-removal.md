# Remove Per-User Sandbox Demo Firm from Onboarding

## Status (as of 2026-08-21)

**Steps 0–5: shipped.** Route restructure to `/d/[groupSlug]/f/[firmSlug]`, group-native billing,
silent auto-provisioning (`lib/onboarding/auto-provision.ts`), `/demo` topbar link, sandbox-firm
deletion + `sandboxOnly` UI purge, pricing page cleanup — all committed on `remove-sandbox-firm`
(commits `694b41e`, `eb81f64`, `f1df762`). Also shipped in the same branch, beyond the original
plan: Group/Firm slugs are now fully random/word-based (no name derivation, for privacy — see
`generateWordSlug` in `lib/slug-utils.ts`), a `/d` landing-transition loader + first-login welcome
overlay (`components/app/landing-blocker-modal.tsx`, `landing-arrival-overlay.tsx`), a fix for a
Next.js/React App Router bug where `redirect()` inside a Suspense boundary throws "rendered more
hooks than during the previous render" (upgraded `next` 16.0.10 → 16.3.1, plus moved `/d`'s
landing page into its own `(landing)` route group so its `loading.tsx` doesn't leak onto sibling
`/d/[groupSlug]/f/...` routes), and an `AppSidebar`/`FirmClientsView` fix for a permissions-loading
race that caused a visible tab-flash (Clients → Overview) and missing admin-only nav items on
first paint.

**Step 6 (group picker, breadcrumb nav): not started.** The `/d/` route has no page today —
`resolveDefaultFirmLandingPath` already returns the literal string `/d/` for the 2+-groups case,
but nothing renders there. This is the next slice of work; see the expanded Step 6 section below
for what changed in scope since this plan was first written (a "create your own workspace" action
for non-admin users, confirmed `GroupMember.role` semantics, the broken Profile-menu "Switch Firm"
link found during testing).

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

### Step 6 — Group Picker at `/d/` (not started — expanded scope as of 2026-08-21)

**Status:** `resolveDefaultFirmLandingPath` already returns the literal string `/d/` for the
2+-distinct-groups case (implemented as part of Steps 0/2's rewrite), but **no page exists at
that route today** — there is no `app/(app)/d/(landing)/../page.tsx` sibling handling bare `/d/`
with a trailing slash distinctly from bare `/d`. This is the actual remaining work.

**Confirmed via testing tonight:** the Profile menu (`components/ui/profile-section.tsx:245`) has
a "Switch Firm" link hardcoded to the dead pre-restructure `/d/f/` route (404s). This needs to
become the entry point into the group-level picker built in this step — see "Switch Workspace
entry point" below.

**Card view, same visual pattern as the existing firm picker.** `/d/` should look and behave like
`app/(app)/d/[groupSlug]/f/page.tsx` (`WorkspacePickerPage`) one level up — a card grid, same
`Tabs`/header/breadcrumb shell, same `TooltipProvider` wrapper — showing one card per **group**
instead of per **firm**. Reuse that file's structure as the template rather than building from
scratch; the firm-picker's `firms.map(...)` card-rendering block (`WorkspacePickerPage`
lines ~137-196) is the closest existing reference for the group cards' layout, though groups have
no `logoUrl`/`themeColor` today so the card content needs a plainer treatment (name + avatar
initial, no brand accent corner decoration) — a real design decision, not just a reuse.

**Routing rules** (replaces today's rule #2 in `resolveDefaultFirmLandingPath`; groups are the
top-level unit, firms are the second-level unit within a group — already implemented in
`lib/actions/firms.ts`, just needs the actual `/d/` page to exist so `/d/` isn't a dead link):

1. Zero groups → auto-provision (Step 2, shipped) — never reaches this page.
2. **2+ distinct groups** → land on `/d/` (this page), one card per group. Picking a card routes to `/d/{groupSlug}/f/` (or straight to the firm if that group has only 1).
3. **Exactly 1 group, 2+ firms** → skip straight to `/d/{groupSlug}/f/` (shipped, existing `WorkspacePickerPage`).
4. **Exactly 1 group, exactly 1 firm** → skip straight to `/d/{groupSlug}/f/{firmSlug}` (shipped).
5. Admin/onboarding/domain-org sub-rules unchanged, apply within whichever firm is ultimately reached.

**Switch Workspace entry point (new scope, decided in conversation tonight — not part of the
original plan draft):** the Profile menu's "Switch Firm" link becomes "Switch Workspace," pointing
at `/d/` instead of the dead `/d/f/`. Visibility rule, distinct from the auto-routing rules above
(this is a user-initiated *navigation* action, available even when auto-routing wouldn't normally
land them on `/d/`):

- Show the menu item when the user belongs to **2+ distinct groups** (the ordinary "switch between
  workspaces I'm already in" case), **or** when they belong to **exactly 1 group and are NOT that
  group's `GROUP_ADMIN`** (an invited firm member with no group of their own — give them a
  standing opportunity to bootstrap one).
- Hide it when the user belongs to exactly 1 group and IS that group's `GROUP_ADMIN` — nothing to
  switch to, nothing useful to create (they already own their only group).
- `GroupMember.role === 'GROUP_ADMIN'` is confirmed reliable for this check — every group-creation
  call site (`lib/firm-service.ts`, `lib/connectors/pockett-structure.service.ts`,
  `lib/onboarding/auto-provision.ts`, `app/api/provision/route.ts`) writes exactly one
  `GroupMember` row with this role for the creator; it's already read elsewhere for billing-actor
  resolution (`lib/billing/subscription-audit.ts`, `lib/billing/polar-billing-lifecycle.ts`). A
  user invited into someone else's firm (`FirmMember`, not `GroupMember`) correctly has no
  `GroupMember` row in that group at all, so the "not admin" check is just "no `GROUP_ADMIN`
  `GroupMember` row for this user in this group" — no new schema needed.

**"Create your own workspace" action on the `/d/` page itself** (new scope): when the picker is
reached by a single-group non-admin user (via the Switch Workspace entry point above — this
condition can't be reached via ordinary auto-routing, since rule 2 only fires at 2+ groups), show
an additional card/action alongside their existing group's card, explicitly labeled as creating a
new, independent workspace (and, implicitly, a new Polar subscription — this is NOT the same
action as "Add Firm" on the firm-picker page, which adds a satellite firm to an *existing*
group/subscription). Implementation note: `lib/onboarding/auto-provision.ts`'s
`autoProvisionFirstFirm` is the right logic to reuse, but its current precondition
(`allFirms.length === 0`, checked by its only caller in `resolveDefaultFirmLandingPath`) doesn't
fit this case — the user calling this action already has firms. Needs either a relaxed/parameterized
entry point into the same group+firm+billing creation logic, or extracting that logic into a
callable helper that doesn't assume zero prior membership.

**Breadcrumb "navigate back up" (new scope, decided tonight):** the leading segment of every
firm/client/engagement breadcrumb (`firm-clients-view.tsx`, `client-project-view.tsx`,
`engagement-workspace.tsx`) is today a static, non-clickable `Home` icon. Make it a real link back
to `/d/{groupSlug}/f/` (the firm-card picker) whenever the current group has 2+ firms; leave it
non-interactive when the group has only 1 firm. This is scoped to ONE level (firm picker), not
the group picker — per discussion tonight, going all the way back to the group level from deep
inside a firm is the Profile menu's job (Switch Workspace), not the breadcrumb's; a breadcrumb
segment for "current group name, clickable back to `/d/`" was considered and explicitly NOT
adopted, since for the common (single-group) case it would show a permanently-non-interactive
crumb with no purpose. Factor into one shared breadcrumb component during implementation rather
than duplicating the conditional logic across the three view files.

**Unchanged from the original draft:**

- JWT / `UserSettingsPlus` / session logic does not change — the picker (and Switch Workspace
  entry point) sit purely above the existing firm-scoped session logic; once a firm is selected,
  `app_metadata`/`UserSettingsPlus` build exactly as today, keyed off that firm.
- `AppSidebar` needs a reduced state for a bare `/d/` landing (no current firm yet) — not yet
  designed in detail; the existing firm-picker page already renders standalone without being deep
  in a specific firm's context, use that as the reference for how little sidebar chrome is needed.

## Critical Files

**Shipped (Steps 0-5):**
- `prisma/schema.prisma` + migrations (`Group.slug`, word-based slug re-backfills)
- `lib/navigation/firm-paths.ts`, `lib/slug-utils.ts` (`generateWordSlug`)
- `app/(app)/d/[groupSlug]/f/[firmSlug]/...` route tree
- `lib/onboarding/auto-provision.ts`, `lib/actions/firms.ts` (`resolveDefaultFirmLandingPath`)
- `lib/billing/effective-billing-caps.ts`, `firm-creation-gate.ts`, `polar-free-plan.ts`, `polar-billing-lifecycle.ts`, `billing-profile.ts`
- `lib/firm-service.ts` (`getUserFirms` sandbox filter)
- `app/(marketing)/pricing/page.tsx`, `config/pricing.ts`
- `app/(app)/d/(landing)/page.tsx` + `loading.tsx` (bare `/d` landing-resolution, isolated route group)
- `components/app/landing-blocker-modal.tsx`, `landing-arrival-overlay.tsx`, `d-loading-fallback.tsx`, `app-shell-skeleton.tsx`

**Remaining (Step 6):**
- `app/(app)/d/page.tsx` (new — the actual `/d/` group-picker page; does not exist yet, `resolveDefaultFirmLandingPath` already points at it)
- `app/(app)/d/[groupSlug]/f/page.tsx` (`WorkspacePickerPage` — template/reference for the new page's card-grid pattern)
- `components/ui/profile-section.tsx` (fix dead `/d/f/` link → `/d/`, rename "Switch Firm" → "Switch Workspace", add the visibility condition)
- `lib/onboarding/auto-provision.ts` (extract a callable "create group+firm+billing" helper usable outside the zero-firm precondition, for the "create your own workspace" action)
- `components/app/app-sidebar.tsx` (reduced state for bare `/d/` landing)
- `components/projects/firm-clients-view.tsx`, `client-project-view.tsx`, `engagement-workspace.tsx` (breadcrumb `Home` icon → real link back to `/d/{groupSlug}/f/`, factor into a shared component)

## Verification

- New signup: lands directly in the app with an auto-created real firm, zero onboarding steps, can create clients/engagements immediately with no Drive connector, sees the upgrade banner once relevant caps are hit. **[Verified]**
- Billing: free-tier caps still apply correctly (now via `Subscription.plan`, not a firm flag); creating a firm/client/engagement still respects group caps. **[Verified]**
- `/demo` link reachable from the topbar in the authenticated app. **[Verified]**
- Existing sandbox firms no longer appear anywhere (firm switcher, `/d/{groupSlug}/f/`, sidebar) for any user. **[Verified]**
- Single-group, single-firm user: signs in, lands directly on `/d/{groupSlug}/f/{firmSlug}` — no picker shown at all. **[Verified]**
- Single-group, multi-firm user: signs in, lands on `/d/{groupSlug}/f/` (group-scoped firm picker) — no group picker shown. Not yet re-tested since Step 6 groundwork; should still hold since rule 3 is unchanged.
- **Multi-group user — blocked on Step 6.** `resolveDefaultFirmLandingPath` returns `/d/`, but no page exists there yet (404/not-found today). Cannot verify until the `/d/` picker page is built.
- All migrated call sites produce correct `/d/{groupSlug}/f/{firmSlug}/...` URLs — spot-checked via the sandbox-firm-removal Step 4 sweep; one live gap found tonight (Profile menu's "Switch Firm" link, `components/ui/profile-section.tsx:245`, still hardcoded to dead `/d/f/`) and captured in Step 6's scope above. Worth another grep sweep for `/d/f/` literals before considering this fully closed.
- Stale pre-migration reminders: admin script not yet written — no real prod users to affect yet, low urgency, but still open.
- `npx tsc --noEmit` clean. **[Verified, repeatedly, throughout tonight's session]**
- Full `npm run build` clean, including postbuild Prisma migrate + seed. **[Verified]**
- Grep sweep confirms no remaining references to deleted functions/routes/old URL shape before each deletion. **[Verified for Steps 0-5; the `/d/f/` literal above is the one known exception, now tracked]**
