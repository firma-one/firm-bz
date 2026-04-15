/**
 * Server-only: list public Polar products for in-app plan selection.
 * Requires POLAR_ACCESS_TOKEN with products:read (and org context).
 */

import type { BillingCatalogPlan, BillingCatalogRecurringInterval } from '@/lib/billing/billing-catalog.types'
import { inferIntervalFromCatalogPriceLabel } from '@/lib/billing/catalog-plan-helpers'

export type { BillingCatalogPlan }

type PolarListResponse = {
    items?: unknown[]
}

function polarApiBase(): string {
    return process.env.POLAR_SERVER === 'production'
        ? 'https://api.polar.sh'
        : 'https://sandbox-api.polar.sh'
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null
}

const INTERVAL_SUFFIX: Record<string, string> = {
    day: '/day',
    week: '/week',
    month: '/month',
    year: '/year',
}

function formatMoney(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(cents / 100)
    } catch {
        return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
    }
}

const VALID_RECURRING_INTERVALS: ReadonlySet<string> = new Set(['day', 'week', 'month', 'year'])

function normalizePolarIntervalString(raw: unknown): BillingCatalogRecurringInterval | null {
    if (typeof raw !== 'string') return null
    const n = raw.trim().toLowerCase()
    if (!n || !VALID_RECURRING_INTERVALS.has(n)) return null
    return n as BillingCatalogRecurringInterval
}

/** Amount in smallest currency unit (Polar: cents). */
function polarPriceAmountCents(price: Record<string, unknown>): number | null {
    if (typeof price.price_amount === 'number' && Number.isFinite(price.price_amount)) {
        return price.price_amount
    }
    if (typeof price.priceAmount === 'number' && Number.isFinite(price.priceAmount)) {
        return price.priceAmount
    }
    return null
}

function polarPriceCurrency(price: Record<string, unknown>): string {
    const c =
        (typeof price.price_currency === 'string' ? price.price_currency : null) ??
        (typeof price.priceCurrency === 'string' ? price.priceCurrency : null) ??
        'usd'
    return c.trim().toLowerCase() || 'usd'
}

/**
 * Prefer structured Polar fields (product + price). Product-level `recurring_interval` is authoritative
 * when each purchasable tier is its own Product (e.g. Standard monthly vs Standard yearly).
 */
function polarRecurringIntervalFromApi(
    price: Record<string, unknown>,
    product: Record<string, unknown>
): BillingCatalogRecurringInterval | null {
    let fromNested: BillingCatalogRecurringInterval | null = null
    if (isRecord(price.recurring)) {
        fromNested =
            normalizePolarIntervalString(price.recurring.recurring_interval) ??
            normalizePolarIntervalString(price.recurring.recurringInterval) ??
            normalizePolarIntervalString(price.recurring.interval)
    }
    return (
        normalizePolarIntervalString(product.recurring_interval) ??
        normalizePolarIntervalString(product.recurringInterval) ??
        normalizePolarIntervalString(price.recurring_interval) ??
        normalizePolarIntervalString(price.recurringInterval) ??
        normalizePolarIntervalString(price.interval) ??
        fromNested
    )
}

function toPositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    return null
}

function trialDaysFromRecord(record: Record<string, unknown> | null): number | null {
    if (!record) return null
    return (
        toPositiveInt(record.trial_interval_count) ??
        toPositiveInt(record.trialIntervalCount) ??
        toPositiveInt(record.trial_days) ??
        toPositiveInt(record.trialDays) ??
        toPositiveInt(record.free_trial_days) ??
        toPositiveInt(record.freeTrialDays) ??
        toPositiveInt(record.trial_period_days) ??
        toPositiveInt(record.trialPeriodDays)
    )
}

function extractTrialDays(product: Record<string, unknown>): number | null {
    const prices = Array.isArray(product.prices) ? product.prices.filter(isRecord) : []
    for (const price of prices) {
        const direct = trialDaysFromRecord(price)
        if (direct) return direct
        const recurring = isRecord(price.recurring) ? trialDaysFromRecord(price.recurring) : null
        if (recurring) return recurring
    }
    const productDirect = trialDaysFromRecord(product)
    if (productDirect) return productDirect
    const metadata = isRecord(product.metadata) ? trialDaysFromRecord(product.metadata) : null
    return metadata
}

function isRecurringLikePrice(price: Record<string, unknown>, product: Record<string, unknown>): boolean {
    return (
        product.is_recurring === true ||
        price.type === 'recurring' ||
        price.amount_type === 'fixed' ||
        polarRecurringIntervalFromApi(price, product) !== null
    )
}

/**
 * Subscription line item from Polar JSON: `price_amount` (cents), `price_currency`, `recurring_interval`
 * on product and/or price — **not** derived from formatted price strings.
 */
function extractStructuredSubscriptionPrice(product: Record<string, unknown>): {
    amountCents: number
    currency: string
    interval: BillingCatalogRecurringInterval
} | null {
    const pricesRaw = product.prices
    if (!Array.isArray(pricesRaw) || pricesRaw.length === 0) return null

    const rows = pricesRaw.filter(isRecord).filter((p) => p.is_archived !== true)
    rows.sort((a, b) => {
        const ra = a.type === 'recurring' ? 1 : 0
        const rb = b.type === 'recurring' ? 1 : 0
        if (ra !== rb) return rb - ra
        const fa = a.amount_type === 'fixed' ? 1 : 0
        const fb = b.amount_type === 'fixed' ? 1 : 0
        return fb - fa
    })

    for (const p of rows) {
        const amount = polarPriceAmountCents(p)
        if (amount == null) continue
        if (!isRecurringLikePrice(p, product)) continue

        const interval = polarRecurringIntervalFromApi(p, product)
        if (interval) {
            return {
                amountCents: amount,
                currency: polarPriceCurrency(p),
                interval,
            }
        }
    }

    /** Product-level interval only (some orgs set recurrence on Product, single fixed price row). */
    const productOnly =
        normalizePolarIntervalString(product.recurring_interval) ??
        normalizePolarIntervalString(product.recurringInterval)
    if (productOnly) {
        for (const p of rows) {
            const amount = polarPriceAmountCents(p)
            if (amount == null) continue
            if (!isRecurringLikePrice(p, product)) continue
            return {
                amountCents: amount,
                currency: polarPriceCurrency(p),
                interval: productOnly,
            }
        }
    }

    return null
}

function labelForPrice(
    price: Record<string, unknown>,
    product: Record<string, unknown>
): string | null {
    if (price.is_archived === true) return null
    const amountType = price.amount_type
    const currency =
        typeof price.price_currency === 'string' ? price.price_currency : 'usd'

    if (amountType === 'free') return 'Free'
    if (amountType === 'custom') return 'Custom pricing'
    if (amountType === 'seat_based') return 'Per seat'
    if (amountType === 'metered_unit') return 'Usage-based'

    const amountNum = polarPriceAmountCents(price)
    const fixedOrRecurring =
        (amountType === 'fixed' && typeof price.price_amount === 'number') ||
        (price.type === 'recurring' && amountNum != null)

    if (fixedOrRecurring && amountNum != null) {
        const base = formatMoney(amountNum, currency)
        const interval = polarRecurringIntervalFromApi(price, product)
        const recurring =
            product.is_recurring === true ||
            price.type === 'recurring' ||
            Boolean(interval)
        if (recurring && interval && INTERVAL_SUFFIX[interval]) {
            return `${base} ${INTERVAL_SUFFIX[interval]}`
        }
        if (recurring) {
            return `${base} / billing period`
        }
        return base
    }

    return null
}

function pickPriceLabel(product: Record<string, unknown>): string {
    const pricesRaw = product.prices
    if (!Array.isArray(pricesRaw) || pricesRaw.length === 0) {
        return 'See checkout'
    }
    for (const p of pricesRaw) {
        if (!isRecord(p)) continue
        const label = labelForPrice(p, product)
        if (label) return label
    }
    return 'See checkout'
}

function isRecommendedProduct(product: Record<string, unknown>): boolean {
    const metadata = isRecord(product.metadata) ? product.metadata : null
    if (!metadata) return false
    const raw = metadata.recommended ?? metadata.isRecommended
    if (raw === true || raw === 1) return true
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase()
        return normalized === 'true' || normalized === '1' || normalized === 'yes'
    }
    if (isRecord(raw) && 'value' in raw) {
        const nested = raw.value
        if (nested === true || nested === 1) return true
        if (typeof nested === 'string') {
            const normalized = nested.trim().toLowerCase()
            return normalized === 'true' || normalized === '1' || normalized === 'yes'
        }
    }
    return false
}

function toPlan(product: unknown): BillingCatalogPlan | null {
    if (!isRecord(product)) return null
    if (product.is_archived === true) return null
    if (product.visibility !== 'public') return null
    const id = typeof product.id === 'string' ? product.id : null
    const name = typeof product.name === 'string' ? product.name : null
    if (!id || !name) return null
    const description = typeof product.description === 'string' ? product.description : null
    const priceLabel = pickPriceLabel(product)
    const extracted = extractStructuredSubscriptionPrice(product)
    const inferred = inferIntervalFromCatalogPriceLabel(priceLabel)
    const intervalFromLabel =
        inferred === 'month' || inferred === 'year' ? inferred : null
    const recurringInterval: BillingCatalogRecurringInterval | null =
        extracted?.interval ?? intervalFromLabel

    /** Polar sometimes omits `is_recurring` on subscription products; infer from price + label. */
    const subscriptionLike =
        product.is_recurring === true ||
        extracted != null ||
        recurringInterval != null ||
        inferred != null ||
        /\$[\d,.]+\s*\/\s*(mo|month|yr|year)\b/i.test(priceLabel)

    return {
        id,
        name,
        description,
        priceLabel,
        isRecurring: subscriptionLike,
        pricingModel: subscriptionLike ? 'recurring_subscription' : 'one_time_purchase',
        isRecommended: isRecommendedProduct(product),
        recurringAmountCents: extracted?.amountCents ?? null,
        priceCurrency: extracted?.currency ?? 'usd',
        recurringInterval,
        trialDays: extractTrialDays(product),
    }
}

export async function fetchBillingCatalogPlans(): Promise<BillingCatalogPlan[]> {
    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) {
        throw new Error('POLAR_ACCESS_TOKEN is not set')
    }

    const url = new URL(`${polarApiBase()}/v1/products`)
    url.searchParams.set('is_archived', 'false')
    url.searchParams.set('visibility', 'public')
    url.searchParams.set('limit', '100')
    url.searchParams.set('sorting', '-created_at')

    const res = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
        cache: 'no-store',
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Polar products ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = (await res.json()) as PolarListResponse
    const items = Array.isArray(data.items) ? data.items : []
    const plans: BillingCatalogPlan[] = []
    for (const item of items) {
        const plan = toPlan(item)
        if (plan) plans.push(plan)
    }
    return plans
}
