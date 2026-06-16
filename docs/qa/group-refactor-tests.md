# QA Test Scenarios — Groups Billing Refactor

Covers the migration of `platform.subscriptions.firmId` → `subscriptions.groupId` and introduction of `platform.groups` as the billing root entity (`dev` branch).

---

## 1. New User Signup / First-Time Sandbox Onboarding

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 1.1 | Sign up as brand-new user → complete onboarding | `platform.groups` has 1 row; `platform.group_members` has 1 row (role=GROUP_ADMIN); `platform.firms` row has `groupId` FK pointing to that group | **Critical** — NOT NULL on `firms.groupId` |
| 1.2 | New user's sandbox firm subscription | `platform.subscriptions` row has `groupId` matching the group, not a `firmId` | **Critical** — column no longer exists |
| 1.3 | Two users sign up independently | Each gets their own separate group; subscriptions are isolated | High |
| 1.4 | `/d/billing` for new user shows Free plan | Plan page renders; `current-plan` API returns `subscriptionStatus: "active"` with free plan metadata | High |

---

## 2. Subscription Reads — Group Boundary Isolation

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 2.1 | Firm A in Group 1 reads billing caps | Gets Group 1's subscription metadata | **Critical** |
| 2.2 | Firm B (satellite) in Group 1 reads billing caps | Gets the same Group 1 subscription — NOT its own | High |
| 2.3 | Firm C in Group 2 reads billing caps | Gets Group 2's subscription, completely isolated from Group 1 | **Critical** — isolation regression risk |
| 2.4 | `effective-billing-caps.ts:loadAnchorForCaps(firmB.id)` | Returns `AnchorCapsRow` with `groupId = group1.id`, subscription from Group 1 | High |
| 2.5 | `user-settings-plus.ts:computePlanEntitlementsByFirm` for a user in 2 firms across 2 groups | Returns correct metadata per firm — each keyed by `firm.groupId` | High |

---

## 3. Gate Routes — Cap Enforcement

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 3.1 | `GET /api/billing/client-gate?firmSlug=X` — under cap | `{ allowed: true, groupId: "<uuid>" }` | Medium |
| 3.2 | `GET /api/billing/client-gate?firmSlug=X` — at cap | `{ allowed: false, cap: N, count: N }` | Medium |
| 3.3 | `GET /api/billing/engagement-gate?firmSlug=X` — satellite firm in group | Count includes engagements across ALL billable firms in the group, not just the querying firm | **High** — regression: used to count only anchor |
| 3.4 | `GET /api/billing/document-gate?projectId=X&count=5` — would exceed cap | `{ allowed: false, available: M }` | Medium |
| 3.5 | `GET /api/billing/firm-gate` — user at firm cap | `{ reason: "at_cap" }` | Medium |
| 3.6 | Response shape for `client-gate` and `engagement-gate` contains `groupId` (not `anchorFirmId`) | Callers reading `response.groupId` work correctly | Low |

---

## 4. Polar Webhook — Subscription Sync

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 4.1 | `subscription.created` webhook fires with `customerExternalId = groupId` | Subscription row created with `groupId`, not `firmId` | **Critical** |
| 4.2 | `subscription.updated` → status change | Existing subscription row updated; `groupId` unchanged | High |
| 4.3 | `subscription.canceled` with future `endsAt` | Row kept active with `scheduledCancelAt` set; cancellation reminder created for all firm admins in group with `entityKey='platform.groups'` | High |
| 4.4 | `subscription.revoked` | Row deactivated; free plan re-provisioned; cancellation reminder cleared | High |
| 4.5 | Webhook with no `customerExternalId` — falls back to `customerId` lookup | `findGroupIdByPolarCustomerId` returns correct groupId; sync proceeds | Medium |
| 4.6 | Webhook with no `customerExternalId` or `customerId` — falls back to `subscriptionId` lookup | `findGroupIdByPolarSubscriptionId` returns correct groupId | Medium |
| 4.7 | Webhook for unknown customer (all three lookups fail) | Returns `null`; webhook returns 200 (no crash); warning logged | Medium |

---

## 5. Polar Lifecycle — Free Plan Resync

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 5.1 | Paid subscription ends → `resyncSandboxFreePlanAfterPaidSubscriptionEnd(groupId)` | Finds sandbox firm in group; looks up GROUP_ADMIN email; calls `ensurePolarFreePlanForSandboxFirm({ firmId: sandboxFirm.id })` | High |
| 5.2 | Group has no sandbox firm | `resyncSandboxFreePlanAfterPaidSubscriptionEnd` returns early — no error | High |
| 5.3 | GROUP_ADMIN not found in `groupMember` table | Falls back to synthetic email `billing-resync+<groupId>@sandbox.invalid`; Polar finds existing customer by `externalId=groupId` | Medium |
| 5.4 | `ensurePolarFreePlanForSandboxFirm` called with sandbox firm id | `resolveGroupId(sandboxFirm.id)` resolves the group; Polar `getStateExternal({ externalId: groupId })` uses the group UUID | High |

---

## 6. Billing Profile & Current Plan Page

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 6.1 | `/api/billing/current-plan?firmId=<satellite>` | Resolves to group, returns plan from group's subscription | **Critical** |
| 6.2 | `/api/billing/current-plan?firmId=<sandbox>` | Same — subscription lookup uses `groupId`, plan shown correctly | High |
| 6.3 | `billing-profile.ts:buildPayload` for satellite firm | `billingAnchor` in response shows sandbox firm (name, slug) but subscription is from group | High |
| 6.4 | `/d/billing` page for firm admin | Plan name, status, period end, entitlements all render correctly | High |
| 6.5 | `/api/billing/subscription/cancel` | Cancels the group's active subscription; `polarSubscriptionId` from `getActiveSubscriptionForGroup(groupId)` used | High |
| 6.6 | `/api/billing/customer-portal` | Polar session created with `externalCustomerId: groupId`; portal URL returned | Medium |

---

## 7. Cancellation Reminders

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 7.1 | Scheduled cancellation → reminders created | `entityKey='platform.groups'`, `entityValue=groupId`; all firm_admins across the group get a reminder | High |
| 7.2 | Subscription uncanceled → reminders cleared | Filter `entityKey='platform.groups' AND entityValue=groupId` removes the correct reminders | High |
| 7.3 | Reminder email config used | Each admin's actual `firmId` (from `groupMember.firmId`) is passed to `upsertFollowUpReminder` — firm-specific email config resolved correctly ✓ | Medium — **B-1 fixed** |
| 7.4 | Admin in satellite firm gets cancellation reminder | `firmMember.findMany({ where: { firm: { groupId } } })` returns admins of ALL firms in group | Medium |

---

## 8. Subscription Audit Trail

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 8.1 | New subscription created via onboarding | `createdBy` / `updatedBy` set to GROUP_ADMIN userId from `groupMember` table | Medium |
| 8.2 | Subscription updated via webhook | `updatedBy` resolved via `resolveSubscriptionAuditUserId(tx, groupId, null)` | Medium |
| 8.3 | Group has no GROUP_ADMIN member yet | Audit userId resolves to `null`; subscription row created without `createdBy`/`updatedBy`; no crash | Low |

---

## 9. Migration SQL Integrity

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 9.1 | Fresh `npm run build` (applies migration from scratch) | `platform.groups`, `platform.group_members` created before `platform.firms`; FK `firms.groupId → groups.id` satisfied | **Critical** |
| 9.2 | `platform.subscriptions` DDL | Column `groupId UUID NOT NULL`, FK `→ platform.groups(id)`, unique index `subscriptions_one_active_per_group` on `(groupId) WHERE active=true AND deletedAt IS NULL` | **Critical** |
| 9.3 | No `firmId` column on `platform.subscriptions` | Build fails cleanly with TS error if any code references `subscription.firmId` | Verification |

---

## 10. Regression — Existing Features

| # | Scenario | Expected | Risk |
|---|----------|----------|------|
| 10.1 | Existing satellite firm creation flow | Picks up `groupId` from existing group; firm attached correctly | High |
| 10.2 | `upgrade-nudge-status` for admin who skipped upgrade | `sandboxFirm.settings.onboarding.subscription.paidPlan === 'skipped'`; subscription status from `getActiveSubscriptionForGroup(groupId)` | Medium |
| 10.3 | `skip-upgrade` POST | Updates `sandboxFirm.settings`; no subscription lookup needed | Low |
| 10.4 | `assertWithinFirmGroupCap(groupId)` | Finds sandbox firm in group; calls `loadAnchorForCaps(sandboxFirm.id)`; `AnchorCapsRow.groupId` passed to `countBillableFirmsInBillingGroup` | Medium |
| 10.5 | `assertWithinActiveEngagementCap(workspaceFirmId)` | `listBillableFirmIdsInBillingGroup(anchor.groupId)` — uses `anchor.groupId`, NOT `anchor.id` | **High** — was `anchor.id` before fix |
| 10.6 | `user-settings-plus` `computePlanEntitlementsByFirm` | No sandbox firm lookup; queries `subscription WHERE groupId IN [...]` directly | Medium |
| 10.7 | `subscription-gate.test.ts` | Types use `BillingGroupRow` (not `BillingAnchorRow`); `groupId` field present in test data; no `anchorFirmId` field | Low — fixed |

---

## Excluded (Out of Scope for This Refactor)

- OneDrive connector, brand refactor, reminder email templates — unrelated to groups migration
- `sandboxOnly` → `isAnchorFirm()` rename — tracked separately in [refactor-is-anchor-firm.md](../../.claude/plans/refactor-is-anchor-firm.md)
