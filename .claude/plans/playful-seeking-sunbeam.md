# Plan: Hard Lock Non-Sandbox Firms on Subscription Revocation

## Context

When a user cancels their paid subscription, Polar fires `subscription.revoked` at period end. At that point the anchor's subscription row becomes `active: false`. Currently nothing prevents users from continuing to access non-sandbox (satellite) firms after revocation — a bookmarked URL bypasses any UI-only check.

This plan implements a **server-enforced** hard lock that blocks access at the layout and API layer.

No data export feature exists, so the lock page must communicate clearly that data is safe and accessible again on reactivation.

---

## Architecture Decision

### Why NOT JWT `allowed_firm_slugs`

Previously considered storing `allowed_firm_slugs` in Supabase JWT `app_metadata`. **Rejected** for the following reasons:

- `supabase-jwt-metadata.ts` enforces `MAX_STRING_LEN = 256` per key — a user with even 3–4 firm slugs would saturate this limit
- JWT claims are refreshed on session renewal (~1hr window); a user could retain access to a revoked firm for up to an hour after `subscription.revoked` fires, with no way to force-invalidate active sessions
- Adding `allowed_firm_slugs` to `JWT_APP_METADATA_KEYS` would require updating `mergeLeanAppMetadata` allowlist and every call site that refreshes JWT metadata — broad blast radius for an approach that still has the lag window problem
- Next.js middleware (Edge runtime) has no Prisma access — any middleware-only solution would be JWT-dependent and inherit the lag window

**Conclusion**: JWT is the wrong layer for this. Use the existing DB-backed server utility pattern.

### Chosen Approach: Server utility + layout enforcement

Matches existing patterns (`checkFeatureAccess`, `getFirmRowForBillingGate` in `subscription-gate.ts` / `billing-group.ts`). Works for both page renders and API calls. Enforcement happens inside the server, not at the edge.

---

## Implementation Plan

### 1. Extend `assertFirmSubscriptionAccess` in `subscription-gate.ts`

**File:** `frontend/lib/billing/subscription-gate.ts`

Add a new exported function:

```ts
export async function assertFirmSubscriptionAccess(firmId: string): Promise<void>
```

Logic (reuses existing `getFirmRowForBillingGate`):
- If `ENFORCE_BILLING_GATES !== 'true'` → return (dev bypass preserved)
- Call `getFirmRowForBillingGate(firmId)` — this already resolves satellite → anchor
- If `sandboxOnly: true` → return (sandbox always accessible)
- If `subscriptionStatus` is in `ACCESS_GRANTED_SUBSCRIPTION_STATUSES` (`active`, `trialing`, `past_due`) → return
- Otherwise → throw `{ code: 'subscription_revoked' }` or return a discriminated union

Optionally a non-throwing variant:
```ts
export async function checkFirmSubscriptionAccess(firmId: string): Promise<boolean>
```

---

### 2. Firm slug layout enforcement (closes bookmarked-URL bypass)

**File:** `frontend/app/(app)/d/f/[slug]/layout.tsx`

Currently a pass-through `<>{children}</>`. Change to:

1. Read `params.slug` from route params
2. Resolve `firmId` via `prisma.firm.findUnique({ where: { slug }, select: { id: true } })`
3. Call `checkFirmSubscriptionAccess(firmId)`
4. If locked → `redirect('/d/f/${slug}/subscription-locked')`

This closes the bypass for every page under `/d/f/[slug]/` — dashboard, clients, engagements, connectors, audit, board, and any future routes.

---

### 3. Locked page

**File:** `frontend/app/(app)/d/f/[slug]/subscription-locked/page.tsx` (new)

Full-page interstitial. No sidebar access to locked firm content.

Content:
- Heading: "Subscription ended"
- Body: "Your paid subscription has ended. This workspace is locked — your data is safe and will be restored immediately on reactivation."
- CTA: "Reactivate" → links to `/d/billing` (sandbox/anchor firm is always accessible)
- Note: firm name shown so user knows which workspace is locked

Pattern reference: `frontend/app/(app)/d/f/[slug]/maintenance/page.tsx` (existing lock-style page).

---

### 4. API route enforcement

**File:** `frontend/lib/api-handler.ts`

In the `apiHandler` wrapper, add an optional `requireFirmAccess?: true` flag. When set and `firmId` is resolvable from the request, call `assertFirmSubscriptionAccess(firmId)` and return `403 { error: 'subscription_revoked' }` if locked.

For routes where the wrapper doesn't cleanly provide `firmId`, add the check inline after the existing `firmMember` lookup — pattern:

```ts
const access = await checkFirmSubscriptionAccess(firmId)
if (!access) return NextResponse.json({ error: 'subscription_revoked' }, { status: 403 })
```

**Priority routes** (highest risk if bypassed):
- `app/api/projects/` — creates/modifies engagements
- `app/api/drive-action/` — Google Drive mutations
- `app/api/connectors/` — connector operations
- `app/api/firms/[firmId]/` — admin actions

---

### 5. No webhook changes needed

`onSubscriptionRevoked` already calls `refreshBillingPlanForFirmGroupUsers` which invalidates `UserSettingsPlus` cache for all members across the billing group. The layout check uses `getFirmRowForBillingGate` → `getActiveSubscriptionForFirm` which reads from DB directly — it will see the updated `active: false` immediately after webhook sync, no additional invalidation needed.

---

## Files to Modify / Create

| File | Change |
|---|---|
| `frontend/lib/billing/subscription-gate.ts` | Add `assertFirmSubscriptionAccess()` + `checkFirmSubscriptionAccess()` |
| `frontend/app/(app)/d/f/[slug]/layout.tsx` | Add firm slug resolution + access check + redirect |
| `frontend/app/(app)/d/f/[slug]/subscription-locked/page.tsx` | New locked page (new file) |
| `frontend/lib/api-handler.ts` | Add optional `requireFirmAccess` flag |
| Priority API routes (projects, drive-action, connectors, firms) | Add `assertFirmSubscriptionAccess` after membership check |

---

## Regression Risk Analysis

This is the highest-risk section. Incorrect access denial on launch is a fatal perception issue.

### Risk 1 — False lock on free sandbox firm (CRITICAL)
**Scenario**: Anchor firm is `sandboxOnly: true`. It has no paid subscription. `subscriptionStatus` resolves to `'none'`. Access denied incorrectly — the only firm the user ever has is now locked.

**Why it exists**: `checkFeatureAccess` already handles this with `if (org.sandboxOnly) return true` as the first check. But if `getFirmRowForBillingGate` returns `null` for a deleted/missing firm, we fall through to a lock.

**Mitigation**:
- `checkFirmSubscriptionAccess` must treat `org === null` as `allowed` (fail-open on DB miss, not fail-closed) to avoid locking out users due to transient DB errors
- The `sandboxOnly` check must be the **first** check after null guard — before any subscription status check
- Write an explicit test: sandbox firm with `active: false` subscription → access granted

---

### Risk 2 — False lock during grace period / past_due (HIGH)
**Scenario**: Subscription is `past_due` (payment failed, Polar retrying). We should not lock — Polar retries for several days. `ACCESS_GRANTED_SUBSCRIPTION_STATUSES` already includes `past_due`, so this is handled. But if webhook fires with an intermediate status we don't recognise, we could over-lock.

**Mitigation**: Double-check `syncFirmSubscriptionFromPolarEvent` status mapping covers all Polar states. Add a `logger.warn` when `checkFirmSubscriptionAccess` triggers a lock so it's visible in prod logs immediately.

---

### Risk 3 — Satellite firm false lock when anchor is healthy (HIGH)
**Scenario**: Satellite firm `anchorFirmId` points to anchor. `getFirmRowForBillingGate` correctly resolves to anchor for billing check. But if `anchorFirmId` was set to `null` (e.g. via cascading `SetNull` on anchor deletion), the satellite becomes its own anchor — and has no subscription → locks out.

**Why it exists**: Schema has `onDelete: SetNull` on `anchorFirmId` FK. If anchor is deleted, satellite's `anchorFirmId` becomes null. `getFirmRowForBillingGate` falls back to checking the satellite itself for a subscription, finds none, → lock.

**Mitigation**: This is an existing edge case (no new risk introduced). Document it and add a guard: if satellite has `anchorFirmId = null` AND `sandboxOnly = false` AND has no subscription, treat as locked (which is correct — orphaned satellite should be inaccessible). Log it loudly for ops visibility.

---

### Risk 4 — Layout DB query on every page render (MEDIUM — latency, not correctness)
**Scenario**: `firm.findUnique` by slug + `getActiveSubscriptionForFirm` adds ~2–5ms per page render. Under DB load this could spike.

**Mitigation**: Both queries are indexed (`slug` unique index, `firmId + active` composite index on subscriptions). Acceptable. Consider adding Next.js `unstable_cache` with a short TTL (30s) on the `checkFirmSubscriptionAccess` result keyed by `firmId` — but only if profiling shows it matters. Start without caching.

---

### Risk 5 — `ENFORCE_BILLING_GATES` not set in prod (MEDIUM — silently no lock)
**Scenario**: If `ENFORCE_BILLING_GATES !== 'true'` in prod, `checkFirmSubscriptionAccess` returns `true` for everyone and the lock never fires. This is a silent no-op — users won't be locked but also won't be falsely locked.

**Mitigation**: This is fail-open (no false lock), not fail-closed. Acceptable. The flag is documented as already `true` in prod. Add a startup log warning if `ENFORCE_BILLING_GATES` is not set and we're in `NODE_ENV=production`.

---

### Risk 6 — API routes not patched (LOW — incomplete enforcement, not false lock)
**Scenario**: If some API routes are missed, a user could still hit them directly even with the layout blocked.

**Mitigation**: Layout enforcement covers all page renders and is the primary UX block. API route patching is defence-in-depth. Prioritise the highest-blast-radius routes (projects, documents). The `apiHandler` wrapper approach ensures a single patch point for routes that use it.

---

### Risk 7 — Race between `subscription.revoked` webhook and user request (LOW)
**Scenario**: Webhook fires and sets `active: false`. User has a request in-flight that was authenticated a millisecond earlier. That request reads the now-locked state and gets a 403 mid-operation.

**Mitigation**: This is a fundamental distributed systems race — acceptable. The window is sub-second. The user sees a 403 and can refresh. No data corruption possible since all operations are idempotent or transactional.

---

### Risk 8 — Redirect loop if `subscription-locked` page itself checks access (LOW)
**Scenario**: Layout check runs for `/d/f/[slug]/subscription-locked` → detects locked → redirects to itself → infinite loop.

**Mitigation**: In the layout, explicitly skip the check if the current path ends with `/subscription-locked`:
```ts
if (!pathname.endsWith('/subscription-locked')) {
  // run access check
}
```
Or structure the layout so `subscription-locked` is a sibling route outside the layout scope (parallel route or route group).

---

## Summary: False-Lock Prevention Checklist

Before shipping, verify:
- [ ] `sandboxOnly: true` firms always pass — no subscription needed
- [ ] `org === null` (DB miss) → fail-open (log + allow), never false-lock
- [ ] `past_due` status → access granted (already in `ACCESS_GRANTED_SUBSCRIPTION_STATUSES`)
- [ ] `/subscription-locked` page itself does not re-trigger the layout check
- [ ] Dev environment (`ENFORCE_BILLING_GATES` unset) → no lock applied
- [ ] Satellite firm with healthy anchor → access granted (anchor resolution tested)
- [ ] Reactivation (set `active: true`) → access restored on next request, no cache flush required

---

## Deploy / Release Checklist

- [ ] Migration `20260604100000_multi_connector_schema_rename` renames `googlePermissionId → connectorPermissionId` and `workspaceRootSharedDriveId → workspaceRootSharedStorageId` on live tables. Any Inngest job that completed step 1 (fetched sharing records) BEFORE migration and runs step 2 AFTER is safe (Prisma re-fetches by new name). Risk window: the ~1–5 minutes during migration execution. If jobs are in flight, consider draining the queue before applying the migration.
- [ ] `WorkspaceRootLocation` enum values rename `MY_DRIVE → PERSONAL` / `SHARED_DRIVE → SHARED`. Client sessions that cached the old values mid-deploy will compare correctly on next page load (the `!== 'SHARED'` guard in `google-drive-connector-tab.tsx` degrades safely). Zero-downtime deploy is safe.
- [ ] Confirm `ENFORCE_BILLING_GATES=true` is set in production environment before deploy.

---

## Verification

1. In Polar sandbox: cancel subscription → wait for `subscription.revoked` (or set `active: false` directly in DB)
2. Navigate to satellite firm URL → should hit layout check → redirect to `/subscription-locked`
3. Attempt direct API call to `api/projects/...` with satellite `firmId` → should get `403 subscription_revoked`
4. Navigate to sandbox/anchor firm → should be fully accessible
5. Set subscription `active: true` in DB → satellite firm accessible again immediately (no restart needed)
6. Set `ENFORCE_BILLING_GATES=false` in dev → no lock applied anywhere
7. Create a `sandboxOnly: true` firm with no subscription → confirm always accessible
