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

## Critical Files

- `app/(app)/d/onboarding/page.tsx` (deleted or drastically reduced)
- `app/api/onboarding/create-sandbox/route.ts` (deleted)
- `lib/billing/effective-billing-caps.ts`, `firm-creation-gate.ts`, `polar-free-plan.ts`, `polar-billing-lifecycle.ts`, `billing-profile.ts`
- `lib/actions/firms.ts` (new silent auto-provision path)
- `lib/onboarding/onboarding-helper.ts` (seeding removed)
- `app/(marketing)/pricing/page.tsx`, `config/pricing.ts`
- Wherever the app topbar lives (add `/demo` link)

## Verification

- New signup: lands directly in the app with an auto-created real firm, zero onboarding steps, can create clients/engagements immediately with no Drive connector, sees the upgrade banner once relevant caps are hit.
- Billing: free-tier caps still apply correctly (now via `Subscription.plan`, not a firm flag); creating a firm/client/engagement still respects group caps.
- `/demo` link reachable from the topbar in the authenticated app.
- Existing sandbox firms no longer appear anywhere (firm switcher, `/d/f`, sidebar) for any user.
- `npx tsc --noEmit` clean.
- Grep sweep confirms no remaining references to deleted functions/routes before each deletion.

---

## Future Improvement (separate follow-up, not part of this refactor): Group Picker at `/d/`

**Problem:** today, `resolveDefaultFirmLandingPath` only ever reasons about *firms*, never *groups* — a user who has access to firms across multiple distinct groups (e.g. via `FirmMember` invites into someone else's group) has no way to see/pick "which group am I working in" as a first-class step; they just land wherever firm-count logic sends them.

**Design:**
- If a signing-in user's accessible firms span **2+ distinct `Group`s** (derived from `getUserFirms()`'s existing `firm.group` fan-out, deduped by `groupId` — not `GroupMember` rows, which today only ever number 1 per user and aren't the right signal for this), they land on a new group-picker page at `/d/` showing one card per group, reusing the card visual design from `firm-list.tsx`'s grid mode (icon avatar, name, active/default indicators) — labeled by group name, e.g. "Deepak's Firm Group," "Shubham's Firm Group." Picking a card routes into that group's firm(s) via the existing `/d/f/` firm-picker logic (if the group has 1 firm, go straight in; if 2+, show the existing firm picker scoped to that group).
- If the user belongs to exactly **1 distinct group** (the common case, and the only case that exists in prod today per current research), behavior is **unchanged** — they land on `/d/f` exactly as they do now. This must be a true no-op passthrough for single-group users, not a new page they click through.
- **JWT / `UserSettingsPlus` / session logic does not change.** The group picker is purely a routing/selection layer sitting *above* today's firm-scoped session logic — once a firm is actually selected (whether via the new group picker → firm picker chain, or directly for single-group users), `app_metadata`, `UserSettingsPlus`, and all downstream permission/session logic continue to be built exactly as today, keyed off the selected firm. Nothing about how the JWT or session state is constructed should be touched.
- **Sidebar (`AppSidebar`) needs to handle landing on `/d/`** — today's sidebar assumes it's always rendered inside a firm-scoped layout (`d-layout-client.tsx`, wrapped around a specific firm). A bare `/d/` group-picker landing has no "current firm" yet, so the sidebar chrome for that page needs its own reduced/adapted state (e.g. no firm switcher showing a specific firm, no firm-scoped nav tree) until a firm is actually selected — similar in spirit to how `/d/f`'s picker page already renders without being deep in a specific firm's context.
- Insertion point: add the group-count branch inside `resolveDefaultFirmLandingPath` (`lib/actions/firms.ts`) as an early rule, before the existing firm-count rules — centralizing it there means `d/layout.tsx` and `/d/f/page.tsx`'s existing calls to this function pick up the new behavior with no changes needed on their end.
- **Not included in this refactor's scope** — file as its own follow-up plan/task once the sandbox-removal work above ships, since it's an additive feature rather than part of removing the sandbox firm.
