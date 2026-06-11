# Refactor: Replace `sandboxOnly` with `isAnchorFirm()`

## Background

The Prisma `Firm` model has a field `sandboxOnly` which maps to the DB column `isAnchor`. The two names are used interchangeably across the codebase, making it easy to forget that `sandboxOnly === true` means "this firm is the platform anchor/demo firm" — not a general sandbox concept.

A utility function `isAnchorFirm(firm)` has been added to `lib/billing/effective-billing-caps.ts` (exported) to encapsulate this mapping. All new code should use `isAnchorFirm()` instead of reading `.sandboxOnly` directly.

## Goal

Replace all 165+ raw `.sandboxOnly` reads with `isAnchorFirm()` so:
- The `isAnchor` ↔ `sandboxOnly` mapping is documented in one place
- Reviewers don't need to know the DB column alias
- Future renames or schema changes only require updating one function

## Scope

Files with `.sandboxOnly` reads (conditions/checks only — not writes or type definitions):

### Billing / Server
- `lib/billing/subscription-gate.ts` — lines 50, 111
- `lib/billing/polar-billing-lifecycle.ts` — line 73
- `lib/billing/billing-profile.ts` — line 113, 142
- `lib/billing/firm-creation-gate.ts` — line 58
- `lib/billing/billing-group.ts` — lines 40, 49

### Actions / Services
- `lib/actions/invitations.ts` — line 30
- `lib/actions/firm-members.ts` — lines 85
- `lib/actions/client-members.ts` — line 84
- `lib/onboarding/onboarding-helper.ts` — lines 87, 345
- `lib/onboarding/workspace-onboarding-complete.ts` — line 28
- `lib/services/auto-import.ts` — lines 118, 284
- `lib/connectors/pockett-structure.service.ts` — lines 172, 370
- `app/api/drive-action/route.ts` — line 110
- `app/api/connectors/google-drive/linked-files/route.ts` — line 554

### Frontend / UI
- `components/projects/firm-settings-form.tsx` — line 90
- `components/projects/engagement-settings-form.tsx` — line 66
- `components/projects/client-contacts-tab.tsx` — line 49
- `components/projects/engagement-file-list.tsx` — line 120
- `components/projects/document-doc-comments-pane.tsx` — line 65
- `components/projects/add-client-modal.tsx` — line 94
- `components/projects/add-engagement-modal.tsx` — line 94
- `components/projects/client-settings-form.tsx` — line 90
- `components/projects/hooks/use-engagement-file-ops.ts` — line 140
- `components/files/document-share-modal.tsx` — line 90
- `components/projects/members/invite-member-modal.tsx` — line 42
- `components/projects/members/firm-invite-modal.tsx` — line 25
- `components/projects/members/client-invite-modal.tsx` — line 25
- `components/projects/firm-list.tsx` — lines 112, 167
- `components/projects/firm-selector.tsx` — lines 123, 155, 225
- `components/app/app-sidebar.tsx` — line 418
- `components/onboarding/onboarding-sidebar.tsx` — line 62
- `app/(app)/d/f/page.tsx` — lines 121, 125, 143, 144, 150, 157, 170

## Approach

1. Move `isAnchorFirm` export from `effective-billing-caps.ts` to a dedicated `lib/billing/anchor-firm.ts` (no dependencies, no circular risk) once `firm-service.ts` circular dep is resolved
2. Migrate files in batches — billing/server layer first, then UI
3. Leave type definitions (`sandboxOnly: boolean` in interfaces) as-is — only replace read-time checks
4. Update tests in `subscription-gate.test.ts` last

## Pre-conditions

- `isAnchorFirm()` currently exported from `lib/billing/effective-billing-caps.ts`
- Circular dependency: `firm-service.ts` → `effective-billing-caps.ts` → (would be) `firm-service.ts` prevents putting it in `firm-service.ts` for now
