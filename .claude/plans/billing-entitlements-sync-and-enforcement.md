# Plan: Entitlement Sync, System Admin Overrides, and Enforcement Consolidation

**Status:** Not started. Written 2026-10-04.

**Supersedes** `billing-entitlement-interceptor.md`, which covered only §4 of this plan. That
document's analysis still stands and is carried forward here — in particular its correction of two
wrong objections to the interceptor pattern, which must not be re-derived.

---

## 0. Why this plan exists now

A live bug found the gap that this plan closes.

`entitledAiCredits` was added to all three Polar sandbox products (Free, Standard Monthly, Standard
Yearly). The billing page still read **"no limit applied"**, and AI credits were **not being
capped** despite `ENFORCE_BILLING_GATES=true` in both local and production.

The database row tells the story:

```
plan              : Standard
polarSubId        : 5849989d-9bc3-43c4-a8d2-ebbda8412344
updatedAt         : 2026-09-24T10:30:18Z      ← 10 days stale
entitledAiCredits : undefined
entitled* keys    : entitledFirms, entitledClients, entitledAuditDays, entitledDocuments,
                    entitledEngagements, entitledClientContacts, entitledCommentHistoryDays
```

Seven entitlements present, `entitledAiCredits` absent. The chain that follows is all correct code
behaving as designed:

```
entitledAiCredits: undefined
  → parseEntitledAiCredits()  → null
  → allowanceForGroup()       → UNCONFIGURED_ALLOWANCE = Infinity
  → aiCreditEntitlement()     → { allowance: null }
  → UI                        → "no limit applied"
```

**Nothing is broken in the enforcement path. The data is stale.**

### The mechanism, stated plainly

`platform.subscriptions.settings.metadata` is a **point-in-time snapshot** of Polar product
metadata, captured when a subscription is created or when a webhook fires. It is never re-read.

- Polar fires **no webhook for product metadata edits**. Its subscription webhooks cover lifecycle
  events (created / updated / canceled / revoked). Editing a *product's* metadata is not a
  subscription event.
- Firma **never polls**. `allowanceForGroup()` reads the DB snapshot. The only writers are
  free-plan provisioning (`polar-free-plan.ts`) and the webhook sync (`polar-webhook-sync.ts`).

So editing entitlements in the Polar dashboard has **zero effect on existing subscribers**, until
something unrelated happens to fire a lifecycle webhook. There is no error, no retry, no alert —
one `logger.warn` that nobody reads, and a cap that fails open:

```ts
logger.warn(`No entitledAiCredits configured for group ${groupId}; AI credits not capped`)
```

This is a **recurring** failure mode, not a one-off. Every future tier-number change will drift the
same way. It must be fixed as a mechanism, not patched as a row.

### Scope note

`entitledAiCredits` is the one *published* entitlement with no hardcoded floor in
`polar-free-plan.ts`; a conditional fallback of 25 was added there on 2026-10-04. That helps new
free provisioning only — it does not touch existing rows, and the row above is a paid Standard
subscription, so the fallback would never have covered it.

---

## 1. Goals

1. **Manual resync** of entitlements from Polar, per firm-group, from the `/system` admin UI.
2. **Manual override** of individual entitlement values, per firm-group, persisted so a later
   resync does not silently discard them.
3. **Visibility**: make a paid subscription missing a published entitlement *loud*, not a log line.
4. **Consolidate enforcement** so a new cap is a table entry rather than a copied 25-line function,
   and so a cap breach is a typed error rather than a prose `Error`.

Explicitly **out of scope** (deferred, per the request):

- Bulk resync across all accounts at once. Build the per-group path first; the loop is trivial once
  the single-group operation is correct and audited.
- Live-reading entitlements from Polar on every check (discussed in §3, deliberately not chosen).

---

## 2. Where this lives: `/system/user-data-map`

The existing user-data-map page is the right host, not a new page. It already:

- resolves `groupId` via `resolveGroupId(firm.id)` — [`lib/system/user-data-map.ts:289`]
- loads the active subscription via `getActiveSubscriptionForGroup(groupId)` — line 295
- exposes a per-firm `billing: { groupId, anchorExists, status, … }` block — line 319
- renders a per-firm **"Firm map"** section — [`page.tsx:314`]
- has a **Findings** section with evidence + remediation SQL, which is exactly the right shape for
  reporting a stale or missing entitlement

So this is an addition to an existing surface, not new infrastructure. Auth, admin gating, and
firm/group resolution all already work.

### Auth

Follow `app/api/system/reprovision-firms/route.ts` verbatim:

```ts
const authHeader = request.headers.get('authorization')          // Bearer token
const { data: { user } } = await supabase.auth.getUser(token)    // service-role client
if (!user?.id || !(await isSysAdminUser(user.id))) return 403
```

`isSysAdminUser` resolves against `SYSTEM_ADMIN_EMAILS`. **Do not invent a second admin check.**

---

## 3. Design decision: snapshot vs live read

Worth settling explicitly, because the bug tempts an over-correction.

| | Snapshot (today) | Live read from Polar | Snapshot + resync (**chosen**) |
|---|---|---|---|
| Accuracy after a dashboard edit | Stale indefinitely | Immediate | Stale until resynced |
| Request-path dependency on Polar | None | **Every AI call** | None |
| Audit: what terms did this firm have? | Preserved | Lost | Preserved |
| Failure mode | Silent drift | Polar outage blocks AI | Drift, but detectable |

**Chosen: keep the snapshot, add resync + detection.**

Reasoning: entitlements are a *contract*, and a subscriber keeping the terms they signed up under
is a feature, not a bug. Coupling every AI call to an external API to fix a once-a-month dashboard
edit is the wrong trade — and `getActiveSubscriptionForGroup` is already on the hot path of every
credit check, where a network call would be felt.

The real defect is not that we snapshot. It is that **drift is invisible and fails open.** Fix
that, and the snapshot is the right design.

---

## 4. Work items

### 4.1 Resync service (`lib/billing/entitlement-resync.ts`)

One function, usable from a route, a script, or a future bulk loop:

```ts
export async function resyncGroupEntitlements(groupId: string, actorUserId: string): Promise<{
    productId: string
    before: JsonRecord       // entitled* keys only
    after: JsonRecord
    changed: string[]        // keys whose value differs
    overridesPreserved: string[]
}>
```

Behaviour:

1. Load the active subscription for the group. No active row → return a typed "nothing to sync".
2. Read `settings.metadata.polarProductId`. **Absent on older rows** — fall back to
   `polarProduct.id` inside the stored snapshot, then to the Polar subscription's product. Report
   which source was used; do not guess silently.
3. `polar.products.get({ id })` via `createPolarClient()` — already version-pinned to `2026-04`.
4. Rebuild `settings.metadata` as:
   `{ ...freshPolarMetadata, ...structuralLiterals, ...manualOverrides }`
5. Write in a transaction, with `updatedBy = actorUserId`.
6. Return a diff for the UI to display.

**Preserve the existing key order semantics.** In `polar-free-plan.ts` the literals come *after*
the Polar spread, so they override the dashboard — that is deliberate for structural caps and must
not be inverted by this refactor. Overrides come last and win over everything.

### 4.2 Overrides: storage

Store under a dedicated key so they survive a resync and are visibly separate from synced values:

```
settings.entitlementOverrides = {
    entitledAiCredits: '1000',
    setBy: '<userId>',
    setAt: '<iso>',
    note: 'Pilot customer — agreed 1000/mo for 3 months',
}
```

Rationale for a separate key rather than editing `metadata` in place: an override written into
`metadata` is indistinguishable from a synced value, so the next resync would either clobber it or
have to guess. A separate layer makes precedence explicit and auditable, and makes "what did we
change by hand?" answerable.

`allowanceForGroup()` and the `parseEntitled*` helpers must then read the **merged** view. Add one
accessor and route all reads through it:

```ts
export function effectiveEntitlements(sub: Subscription): JsonRecord
```

**This is the part most likely to be got wrong**: there are 9 `parseEntitled*` callers today. If
some read raw `metadata` and others read the merged view, overrides apply inconsistently. Audit all
of them in the same change.

### 4.3 API routes

```
POST /api/system/entitlements/resync      { groupId }
GET  /api/system/entitlements             ?groupId=…     → merged view + diff vs Polar + overrides
PUT  /api/system/entitlements/overrides   { groupId, overrides: {…}, note }
```

Per the request: `PUT` **resyncs after saving** so the response shows the final merged state, and
the admin sees in one step what the firm will actually get.

Validation: reject unknown `entitled*` keys (typo protection — a misspelled key silently does
nothing today), reject negative numbers, require a `note` on override (so the "why" survives).

### 4.4 UI: a new section on `/system/user-data-map`

Per firm-group, alongside the existing Firm map:

- Current effective entitlements, each labelled **synced** / **overridden** / **missing**
- `entitledAiCredits` highlighted when absent on a paid plan — this is the live bug
- Snapshot age (`subscription.updatedAt`), flagged when older than the last Polar product edit
- **Resync** button → shows the diff, including "no changes"
- **Override** editor → per-key value + required note, saves then resyncs

### 4.5 Detection: make drift loud

The quiet `logger.warn` is the reason this went unnoticed for 10 days. Add:

1. A **Finding** in user-data-map (that section already carries evidence + remediation) when an
   active paid subscription is missing any published entitlement.
2. Keep the request path **fail-open** — do not throttle a paying customer over a sync gap. This is
   correct and should stay. But the warn should carry the group and the missing key, and be
   surfaced somewhere a human looks.

---

## 5. Enforcement consolidation (carried over, still valid)

Independent of sync, and can proceed in parallel. The analysis from the superseded plan holds; what
follows adds what the AI-credit work since has revealed.

### 5.1 Current state

8 assert functions, ~25 call sites:

| Cap | Sites | Risk |
|---|---|---|
| `assertWithinDocumentCap` | 11 | **High** — many write paths; 2 were missed once already |
| `assertWithinAiCreditCap` | 3 | Medium — see 5.2 |
| `assertWithinActiveEngagementCap` | 2 | Low |
| `assertWithinClientCap` | 2 | Low |
| `assertWithinFirmGroupCap` | 1 | Low |
| `assertWithinClientContactCap` | 1 | Low |
| `assertWithinDeliverableCap` | 1 | Low |
| `assertFirmSubscriptionAccess` | — | Separate concern (access, not caps) |

### 5.2 `getGuardedAnthropic` vs `assertWithinAiCreditCap` — the distinction to generalise

These are not alternatives. They are different *kinds* of guarantee:

| | `assertWithinAiCreditCap` | `getGuardedAnthropic` |
|---|---|---|
| Kind | A check you must **remember** | A check you **cannot avoid** |
| Enforced by | Developer discipline | The type system — no client without it |
| Forget it | Silent bypass | Nothing works |

`getGuardedAnthropic` is better **because it owns the resource**. That is the whole lesson of the
metering incident (3 of 4 sites wired, 2 days unnoticed).

The 5 structural caps have no equivalent, because there is no object you must hold to create a
client or a document. **That** is the problem — not the number of functions.

(Note: `generateFirmBrief` now asserts internally as well as at its route. The route gates *before*
fetching insights so a cached read costs nothing; the inner assert makes the model unreachable
without a check. Both are intentional; neither alone is sufficient.)

### 5.3 Typed error — highest value, lowest risk

Today only AI has a typed error. The 7 structural caps throw bare `Error` with user-facing prose:

```ts
throw new AiCreditLimitError(msg, 'period', limit, used)                          // good
throw new Error(`Your plan allows ${cap} client${cap === 1 ? '' : 's'}. Upgrade…`) // ×7
```

Consequences: no route can map a breach to 402/429 without string-matching; the client cannot tell
"upgrade" from "wait"; copy is welded into business logic.

```ts
export class EntitlementError extends Error {
    constructor(
        readonly resource: 'firm' | 'client' | 'clientContact' | 'engagement'
            | 'deliverable' | 'document' | 'aiCredits',
        readonly kind: 'limit' | 'burst',
        readonly limit: number,
        readonly used: number,
        message: string,
    ) { super(message); this.name = 'EntitlementError' }
}

export function entitlementResponse(e: unknown): Response | null
```

Migrate `AiCreditLimitError` to extend it, keeping the existing 429 + `kind` contract intact.

### 5.4 Table-driven caps

The 7 structural asserts repeat the same 5 steps: check flag → load anchor → sandbox escape →
resolve cap → count → compare → throw. The duplication is where the bugs are. Two found by reading:

- **Inconsistent fail direction**: `assertWithinClientCap` does `if (!anchor) return` (fail open);
  `assertWithinActiveEngagementCap` does `if (!anchor) throw` (fail closed). Almost certainly
  unintentional. **Settle this deliberately** — probably fail-open with a loud finding, matching
  §4.5.
- **Comparison drift**: caps use `count >= cap` (pre-insert), AI uses `used + cost > allowance`.
  Both correct; they read as inconsistent and the next one added is a coin flip.

Collapse into one table + one helper, so a new cap is an entry:

```ts
const CAPS = {
    client: {
        entitlement: 'entitledClients',
        count: (firmIds) => prisma.client.count({ where: { firmId: { in: firmIds }, deletedAt: null } }),
        message: (cap) => `Your plan allows ${cap} client${cap === 1 ? '' : 's'}. Upgrade to add more.`,
    },
    // …
} as const
```

**Do not** unify the *check* behind one `assertEntitlement(resource, scope)` facade. The semantics
genuinely differ — document cap takes a batch size, AI cap has two rolling windows, engagement cap
excludes sandbox firms. One signature would grow a union-typed options bag and read worse than 7
honest functions. **Unify the error and the plumbing; keep the domain logic distinct.**

### 5.5 Document cap: make it structural

11 call sites because document creation has 11 entry points.
`lib/services/indexing-interceptor.ts` already hints at the right shape. If every creation path
went through one guarded service function, the other 10 sites disappear and cannot be forgotten.

Preserve the upsert fix (`5ef8072e`): only genuinely new `externalId`s count, or re-indexing at the
cap breaks.

### 5.6 The two-flag problem

AI reads `ENFORCE_BILLING_GATES`. Structural caps read `enforceBillingCaps()`, which accepts
`ENFORCE_BILLING_CAPS` **or** `ENFORCE_BILLING_GATES`. They can diverge, and the difference is
undocumented in both files.

Both are `true` in local and production today (set since the Polar integration). Decide: one flag,
or two with an explicit comment in each file saying why.

---

## 6. Sequencing

Billing-critical code with gates live in production, so: additive first, behaviour changes last.
Respects the standing "no bulk changes" rule.

| # | Step | Risk | Unblocks |
|---|---|---|---|
| 1 | `resyncGroupEntitlements` + `GET` route (read-only) | None | Diagnosis of the live bug |
| 2 | user-data-map section: show effective entitlements + drift finding | None | Visibility |
| 3 | `POST /resync` + button | Low — writes metadata | **Fixes the live bug** |
| 4 | `effectiveEntitlements()` + audit all 9 `parseEntitled*` callers | Medium | Overrides |
| 5 | Override storage + `PUT` + editor | Low | Per-account exceptions |
| 6 | `EntitlementError` + `entitlementResponse` (additive) | None | Typed 402/429 |
| 7 | Migrate `AiCreditLimitError` to extend it | Low | Consistency |
| 8 | Convert 7 cap asserts to the table, **one commit each** | Medium | Extensibility |
| 9 | Consolidate document-cap entry points | Medium | Removes 10 forgettable sites |

Steps 1–3 fix the live bug and are worth doing on their own. 4–5 deliver the override request.
6–9 are the refactor and can wait.

---

## 7. Verification

**Sync**
- Resyncing the known-stale group populates `entitledAiCredits` and the billing page switches from
  "no limit applied" to a live countdown.
- A resync with no Polar change reports "no changes" and does not bump `updatedAt` needlessly.
- A group with no active subscription returns a typed no-op, not a 500.
- A row lacking `polarProductId` resolves via fallback, and the response says which source was used.

**Overrides**
- An override survives a subsequent resync.
- Removing an override reverts to the Polar value on the next resync.
- An unknown or misspelled `entitled*` key is rejected, not silently stored.
- Overrides are visible as overrides in the UI, never indistinguishable from synced values.

**Enforcement**
- Every `engagementDocument` write path is reachable only through a guarded path.
- Re-indexing existing documents at the cap still succeeds (regression guard for `5ef8072e`).
- An unauthorised user gets 403, not a cap message — a cap must never leak that a firm exists or is
  at its limit.
- A batch straddling the cap is rejected whole, not partially applied.
- With `ENFORCE_BILLING_GATES=false`, no cap refuses a request and the UI does not claim a limit.

**Admin surface**
- A non-system-admin gets 403 from all three routes.
- Every write records `setBy` / `setAt` / `note`, and `updatedBy` on the subscription row.
