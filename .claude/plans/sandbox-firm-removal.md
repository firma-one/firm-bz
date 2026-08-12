# Remove Per-User Sandbox Demo Firm from Onboarding

## Context

Onboarding currently creates a per-user "sandbox" demo firm (`Firm.sandboxOnly: true`) seeded with fixture clients/engagements, and this *is* the entire onboarding flow — there is no other path to create a real firm at signup. Now that a separate static, unauthenticated `/demo` route replicates the product-preview purpose the sandbox firm served, the DB-backed sandbox firm is redundant for that purpose and should be retired from onboarding.

This turned out to be more entangled than a simple deletion: sandbox-firm creation is also the sole trigger for Polar billing provisioning, and `lib/billing/firm-creation-gate.ts` requires a `sandboxOnly:true` firm to exist per group before a user can create any *real* firm. Removing it requires building a genuine "create your first firm" onboarding step and re-anchoring billing lookups — a full refactor, not a quick cleanup.

**Explicitly out of scope / must not touch:** the ~20 `SandboxInfoBanner` call sites and other `sandboxOnly`/`isSandboxFirm` conditional branches elsewhere in the authenticated app (e.g. `sandbox-file-preview.tsx`, `sandbox-board-comments-preview.tsx`) — these stay exactly as-is for existing sandbox firms; they'll simply never trigger for new users going forward, which is intentional. Do not delete `lib/services/sandbox-hierarchy.json` or `lib/services/sample-file-service.ts` — still consumed by those components.

## Current State (research findings)

- **Onboarding IS sandbox creation.** `app/(app)/d/onboarding/page.tsx` Step 1 auto-fires (via `useEffect`, no user input) a POST to `app/api/onboarding/create-sandbox/route.ts`, which creates a `Group` + `Firm` (`sandboxOnly: true`), calls `ensurePolarFreePlanForSandboxFirm` (`lib/billing/polar-free-plan.ts`) to anchor Polar billing, and calls `seedSandboxClientsInDb` (`lib/onboarding/onboarding-helper.ts:690-768`) to seed fixture data from `lib/services/sandbox-hierarchy.json`. Step 2 = billing (optional, stays as-is). Step 3 = Drive connect (mandatory). Step 4 re-POSTs to `create-sandbox` idempotently, then finishes.
- **`resolveDefaultFirmLandingPath`** (`lib/actions/firms.ts:171-214`) sends zero-firm users to `/d/onboarding` unconditionally — there is no `/d/f` "Add Firm" fallback reachable by a brand-new user (its Add Firm button only renders for admins-on-a-firm, never true with zero firms).
- **Billing anchor entanglement:** `lib/billing/firm-creation-gate.ts` (`getEligibleGroups`, `getFirmCreationGateReason`) and `lib/billing/effective-billing-caps.ts` (`loadAnchorForCaps`, `assertWithinFirmGroupCap`) all do `prisma.firm.findFirst({ groupId, sandboxOnly: true })` to find "the anchor firm for this group's billing/caps." The firm-creation gate **hard-fails** (excludes the group) if none exists; the cap assertion **fails open** (soft, unenforced) if none exists. `billing-profile.ts` already has a soft fallback to the workspace firm itself.
- **`entitledFirms`/plan-cap counting is already correct** — `countBillableFirmsInBillingGroup` (`lib/billing/billing-group.ts:55-59`) already filters `sandboxOnly: false` everywhere it's used for cap enforcement. No change needed there; only the *anchor lookup* (not the count) needs re-plumbing.
- **Dead code found (out of scope, flag only):** `runSandboxOnboarding`/`provisionSandboxHierarchyForFirm` (`onboarding-helper.ts:314-688`) have zero live callers. Legacy routes `create-org`, `create-client`, `create-project`, `create-custom-workspace`, `test-org` are unreferenced by any current frontend code.
- **Pricing page** (`app/(marketing)/pricing/page.tsx`, `config/pricing.ts`) has a full "Sandbox" comparison-table column (`PRICING_SANDBOX_COLUMN_ID`), a dedicated free-sandbox plan card (lines ~321-360), and footer CTA copy mentioning "Demo firm" — this is a column/layout change, not a one-line copy edit.

## Approach

### Phase A — build new real-firm onboarding + re-anchor billing (sandbox creation still exists in parallel)

1. **Schema (optional but recommended):** add nullable `Group.anchorFirmId` via `npx prisma migrate dev --create-only` (do not apply — per CLAUDE.md). Purely additive, zero backfill needed.
2. **New anchor resolver:** `resolveBillingAnchorFirmId(groupId)` in `lib/billing/billing-group.ts`, precedence: (1) `group.anchorFirmId` if set → (2) legacy `sandboxOnly:true` lookup (existing groups, unchanged) → (3) earliest-created firm in group (safety net; makes the migration optional).
3. **Refactor call sites** to use the resolver instead of inline `sandboxOnly:true` lookups: `firm-creation-gate.ts` (`getEligibleGroups`, `getFirmCreationGateReason`), `effective-billing-caps.ts` (`loadAnchorForCaps`, `assertWithinFirmGroupCap`), `billing-profile.ts`, `polar-billing-lifecycle.ts` (`resyncSandboxFreePlanAfterPaidSubscriptionEnd`). `ensurePolarFreePlanForSandboxFirm` itself needs no internal change — it's already keyed on `firmId`/`groupId`, not `sandboxOnly`.
4. **New "create your first firm" flow:** a bespoke lightweight onboarding step (not a reuse of the heavier `AddFirmModal`, which assumes an existing billed group and pre-checks a cap inappropriate for the very first firm). New server action `createFirstFirmForNewGroup({ name })` + `app/api/onboarding/create-firm/route.ts`, mirroring `findOrCreateSandboxShellFirm` minus `sandboxOnly: true`, setting `Group.anchorFirmId` at creation time.
5. Replace onboarding Step 1's silent auto-fire with a real firm-name input + submit. Step 4's Drive-attach no longer needs to re-POST anything — just link the connector to the real firm. Redesign the fixture-hierarchy-flavored finalize animation (`buildFinalizeTerminalSteps`, `SandboxHierarchyPreview`) since there's no seeded hierarchy to animate through.
6. QA: brand-new user end-to-end (real firm created, billing/caps correct); existing sandbox-firm user (zero regression, confirm via legacy anchor branch).
7. Ship, burn in for a few days of real signups before Phase B.

### Phase B — delete sandbox creation (once Phase A is proven in prod)

- Delete `app/api/onboarding/create-sandbox/route.ts`.
- Delete `seedSandboxClientsInDb` + `SANDBOX_CLIENT_PRIMARY_CONTACTS` from `lib/onboarding/onboarding-helper.ts`.
- Clean up any remaining sandbox-specific remnants in `page.tsx` left over from Phase A.
- Final grep sweep for `create-sandbox` / `seedSandboxClientsInDb` references before deleting.

### Phase C — pricing copy + optional dead-code cleanup

- Rework the pricing page's Sandbox comparison column, free-sandbox plan card, and footer CTA copy (`app/(marketing)/pricing/page.tsx`, `config/pricing.ts`) — this is a layout/column change, worth a short design check-in before touching since removing a column affects the whole comparison table, not just text.
- Optional, separate PR: delete confirmed-dead `runSandboxOnboarding`/`provisionSandboxHierarchyForFirm` and the five orphaned legacy onboarding routes. Do not bundle with Phase B.
- Optional cosmetic renames (`ensurePolarFreePlanForSandboxFirm` → `...ForFirm`, etc.) — low priority, defer indefinitely.

## Critical Files

- `app/(app)/d/onboarding/page.tsx`
- `app/api/onboarding/create-sandbox/route.ts`
- `lib/billing/firm-creation-gate.ts`, `effective-billing-caps.ts`, `billing-group.ts`, `billing-profile.ts`, `polar-free-plan.ts`, `polar-billing-lifecycle.ts`
- `lib/actions/firms.ts`
- `prisma/schema.prisma`
- `app/(marketing)/pricing/page.tsx`, `config/pricing.ts`
- `lib/onboarding/onboarding-helper.ts`

## Verification

- End-to-end signup as a brand-new user: real firm created (not `sandboxOnly`), billing anchor resolves, cap enforcement works, Drive connects, lands in app.
- Existing sandbox-firm user: zero behavior change (banners, billing, caps all still resolve via the legacy anchor branch).
- `npx tsc --noEmit` clean across all touched files.
- Grep sweep confirms no remaining references to deleted functions/routes before each deletion step.
