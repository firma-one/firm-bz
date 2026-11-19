# Polar organization token — recommended API scopes

Reference for which **Organization Access Token (OAT)** scopes to enable when implementing subscriptions, checkout, webhooks-driven sync, and optional Polar-native entitlements.

**Note:** Receiving webhooks uses a **webhook signing secret** in your app. Scopes `webhooks:read` / `webhooks:write` apply only if you **manage webhook endpoints via Polar’s API** (not required when endpoints are configured in the dashboard).

---

## Core (almost everyone with subscriptions needs these)

| Scope | Why |
| --- | --- |
| `checkouts:read` / `checkouts:write` | Create checkout sessions for your subscription product; any server flow that creates or inspects checkouts. |
| `products:read` | Resolve/validate product IDs, sanity checks, admin/debug; often needed as you harden checkout. `products:write` only if you create or change products via API (many teams only use the dashboard). |
| `subscriptions:read` | Source of truth when reconciling state (cron, support tools, “refresh from Polar”), and for any UI that reads subscription status from Polar. |
| `subscriptions:write` | Cancel, uncancel, or change subscriptions from your backend (if you don’t rely solely on the customer portal). |
| `customers:read` / `customers:write` | Map Polar customer ↔ your user/firm (`externalCustomerId`, metadata), lookups, and updates when billing identity changes. |

---

## Feature flags / “access” in Polar

Pick **one** model (or combine them deliberately).

### A) Feature flags driven only by your DB, updated from webhooks

You only need the scopes that let you trust your **sync path** (usually `subscriptions:read` for backfill/repair). Webhook handling uses the **webhook secret**, not these scopes.

### B) Polar-native entitlements (“benefits”)

If you grant/revoke product access or perks through Polar’s benefits/entitlements APIs:

| Scope | Why |
| --- | --- |
| `benefits:read` / `benefits:write` | Define and attach benefits to products and reason about entitlement state via API. |

If you’re **not** using Polar benefits and only store `plan` / `subscriptionStatus` yourself, you can skip `benefits:*`.

---

## Payments, receipts, and money-side operations

| Scope | Why |
| --- | --- |
| `orders:read` | Orders / receipts in-app, support, accounting hooks. |
| `payments:read` | Payment status and history where exposed separately from orders. |
| `refunds:read` / `refunds:write` | Issue or inspect refunds from your tools (support/admin). Read-only is enough if you only view refunds. |
| `disputes:read` | Optional: surface chargebacks/disputes in admin. |

---

## Self-serve billing (recommended for SaaS)

| Scope | Why |
| --- | --- |
| `customer_sessions:write` | Create Customer Portal sessions (update payment method, cancel, etc.). Required for **Profile → Manage payment methods** (in-app portal link). |
| `customer_portal:read` / `customer_portal:write` | If your integration or dashboard automation configures portal behavior via API (enable if Polar’s docs or errors ask for it; otherwise you may only need `customer_sessions:write`). |

---

## Onboarding: free (sandbox) plan

- Set **`POLAR_FREE_PRODUCT_ID`** to your Polar **free recurring product** UUID (same product you show as “Free” in the catalog). On sandbox firm creation, the app creates a Polar **customer** (`external_id` = firm id) and a **subscription** via `POST /v1/subscriptions/` (free products only).
- **`POLAR_ACCESS_TOKEN`** and **`POLAR_FREE_PRODUCT_ID`** are **required** for sandbox onboarding to succeed. If either is missing, **`POST /api/onboarding/create-sandbox`** fails and the UI should stay on the sandbox step.
- **`POLAR_ALLOW_ONBOARDING_WITHOUT_BILLING=true`** — opt-out for local/CI only: skips Polar provisioning (firm will not show as billing-linked; do not use in production).
- Optional **`POLAR_FREE_PLAN_DISPLAY_NAME`**: label stored on the firm when syncing from an existing active free subscription (defaults to `Free plan`).
- Token needs **`customers:write`**, **`subscriptions:write`**, and **`products:read`** (for catalog elsewhere).
- Server logs prefixed with **`[polar-free-plan]`** trace provisioning and post-write verification.

### Webhook-driven lifecycle (implemented in-app)

- **Payload shape:** Handlers unwrap **`data`** from Polar events (`{ type, timestamp, data: Subscription }`) before reading `id`, `status`, `productId`, etc.
- **Status sync:** `subscription.created` / `subscription.updated` map **`data.status`** into the firm row (with sensible fallbacks for `incomplete` → `trialing`, etc.). `subscription.active` / `subscription.uncanceled` force **`active`**; `subscription.canceled` / `subscription.revoked` force **`canceled`** (so the DB does not stay stuck on `trialing` from generic update events).
- **Paid upgrade:** When a subscription is **`active` or `trialing`** and its **`productId` ≠ `POLAR_FREE_PRODUCT_ID`**, the server calls Polar **`subscriptions.revoke`** on any *other* active subscription for that customer on the **free** product so you do not keep a parallel free sub after checkout.
- **Paid ends:** On **`subscription.canceled`**, **`subscription.revoked`**, or **`subscription.updated`** with status **`canceled`**, if the billing anchor firm is **`sandboxOnly`**, the app runs **`ensurePolarFreePlanForSandboxFirm`** again to recreate or re-link the free Polar subscription and refresh the firm row.
- **Scopes:** Revoke requires **`subscriptions:write`** (same as free-plan create). Logs: **`[polar-billing-lifecycle]`**.

---

## Promotions

| Scope | Why |
| --- | --- |
| `discounts:read` / `discounts:write` | Promo codes applied programmatically or managed from your app. Skip if all discounts are configured only in the Polar UI. |

---

## Alternative checkout surface

| Scope | Why |
| --- | --- |
| `checkout_links:read` / `checkout_links:write` | If you use Checkout Links (shareable URLs) created/managed via API instead of (or in addition to) dynamic checkout creation. |

---

## Webhooks via API (optional)

| Scope | Why |
| --- | --- |
| `webhooks:read` / `webhooks:write` | Only if you register or rotate webhook endpoints through the API. **Not** required just to receive events if endpoints are set in the dashboard. |

---

## Usage-based AI credits

| Scope | Why |
| --- | --- |
| `events:write` | Send AI usage ledger rows as `ai_usage` events (`lib/billing/polar-ai-usage-sync.ts`, on when `POLAR_AI_EVENTS=true`). |
| `meters:read` | Monthly reconciliation of ledger credits against the AI credits meter (`POLAR_AI_CREDITS_METER_ID`). |
