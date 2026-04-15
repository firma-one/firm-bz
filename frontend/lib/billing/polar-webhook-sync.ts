import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import {
    findFirmIdByPolarCustomerId,
    findFirmIdByPolarSubscriptionId,
} from '@/lib/billing/active-billing-subscription'
import { pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { applyBillingCapsAfterPolarSubscriptionSync } from '@/lib/billing/effective-billing-caps'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
import { resolveSubscriptionAuditUserId } from '@/lib/billing/subscription-audit'
import { advanceOnboardingPastSubscribeForBillingAnchor } from '@/lib/onboarding/advance-past-subscribe-on-paid'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
    if (!value || typeof value !== 'object') return null
    return value as UnknownRecord
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asDate(value: unknown): Date | null {
    const str = asString(value)
    if (!str) return null
    const date = new Date(str)
    return Number.isNaN(date.getTime()) ? null : date
}

function metadataFirmId(payload: UnknownRecord): string | null {
    const metadata = asRecord(payload.metadata)
    if (!metadata) return null
    return asString(metadata.firmId)
}

function couponCodeFromDiscountRecord(discount: UnknownRecord | null): string | null {
    if (!discount) return null
    const nestedCoupon = asRecord(discount.coupon)
    return (
        asString(discount.couponCode) ??
        asString(discount.coupon_code) ??
        asString(discount.code) ??
        asString(discount.promotionCode) ??
        asString(discount.promotion_code) ??
        asString(nestedCoupon?.code) ??
        asString(nestedCoupon?.name) ??
        asString(nestedCoupon?.id)
    )
}

function extractCouponCode(body: UnknownRecord): string | null {
    const direct =
        asString(body.couponCode) ??
        asString(body.coupon_code) ??
        asString(body.promotionCode) ??
        asString(body.promotion_code)
    if (direct) return direct

    const discount = couponCodeFromDiscountRecord(asRecord(body.discount))
    if (discount) return discount

    const discounts = Array.isArray(body.discounts) ? body.discounts : []
    for (const row of discounts) {
        const code = couponCodeFromDiscountRecord(asRecord(row))
        if (code) return code
    }
    return null
}

/**
 * Polar Next.js webhooks pass `{ type, timestamp, data: Subscription }`.
 * Accept either that shape or a bare subscription-like object.
 */
export function getSubscriptionBodyFromWebhookPayload(payload: unknown): UnknownRecord | null {
    const raw = asRecord(payload)
    if (!raw) return null
    const nested = asRecord(raw.data)
    if (nested && typeof nested.id === 'string') {
        return nested
    }
    if (typeof raw.id === 'string') {
        return raw
    }
    return nested
}

export function mapPolarSubscriptionStatusToDb(status: unknown): SubscriptionStatus {
    const raw = status == null ? '' : String(status)
    const n = raw.toLowerCase().replace(/-/g, '_')
    if (n === 'active') return 'active'
    if (n === 'trialing') return 'trialing'
    if (n === 'past_due') return 'past_due'
    if (n === 'canceled' || n === 'cancelled') return 'canceled'
    if (n === 'unpaid') return 'unpaid'
    if (n === 'incomplete') return 'trialing'
    if (n === 'incomplete_expired') return 'canceled'
    return 'none'
}

function extractSubscriptionDetails(body: UnknownRecord) {
    const customer = asRecord(body.customer)
    const product = asRecord(body.product)

    const productMetadata =
        asRecord(product?.metadata) ??
        asRecord(body.productMetadata) ??
        asRecord(body.product_metadata) ??
        {}

    return {
        subscriptionId: asString(body.id) ?? asString(body.subscriptionId),
        customerId:
            asString(body.customerId) ??
            asString(body.customer_id) ??
            asString(customer?.id),
        customerExternalId:
            asString(body.customerExternalId) ??
            asString(body.customer_external_id) ??
            asString(body.externalCustomerId) ??
            asString(customer?.externalId) ??
            asString(customer?.external_id) ??
            metadataFirmId(body),
        productId: asString(body.productId) ?? asString(product?.id),
        planName:
            asString(body.productName) ??
            asString(product?.name) ??
            asString(body.productId),
        periodEnd:
            asDate(body.currentPeriodEnd) ??
            asDate(body.current_period_end) ??
            asDate(body.endsAt) ??
            asDate(body.endedAt),
        couponCode: extractCouponCode(body),
        productMetadata,
    }
}

function isSubscriptionAccessActive(status: SubscriptionStatus): boolean {
    return status === 'active' || status === 'trialing' || status === 'past_due'
}

async function resolveFirmForPayload(details: ReturnType<typeof extractSubscriptionDetails>) {
    if (details.customerExternalId) {
        const firm = await prisma.firm.findUnique({
            where: { id: details.customerExternalId },
            select: { id: true },
        })
        if (firm) return firm.id
    }

    if (details.customerId) {
        const id = await findFirmIdByPolarCustomerId(details.customerId)
        if (id) return id
    }

    if (details.subscriptionId) {
        const id = await findFirmIdByPolarSubscriptionId(details.subscriptionId)
        if (id) return id
    }

    return null
}

export type PolarSubscriptionSyncResult = {
    anchorFirmId: string
    subscriptionId: string | null
    productId: string | null
    status: SubscriptionStatus
}

/**
 * Maps Polar subscription webhooks → billing anchor firm row.
 * Returns context for post-sync hooks (revoke free tier, resync sandbox free, etc.).
 */
export async function syncFirmSubscriptionFromPolarEvent(
    payload: unknown,
    options?: { statusOverride?: SubscriptionStatus }
): Promise<PolarSubscriptionSyncResult | null> {
    const body = getSubscriptionBodyFromWebhookPayload(payload)
    if (!body) {
        logger.warn('Polar webhook: could not parse subscription payload')
        return null
    }

    const details = extractSubscriptionDetails(body)
    const resolvedFirmId = await resolveFirmForPayload(details)
    if (!resolvedFirmId) {
        logger.warn('Polar webhook: no firm mapping found', {
            customerExternalId: details.customerExternalId,
            customerId: details.customerId,
            subscriptionId: details.subscriptionId,
        })
        return null
    }

    const anchorFirmId = await resolveBillingAnchorFirmId(resolvedFirmId)
    const status = options?.statusOverride ?? mapPolarSubscriptionStatusToDb(body.status)

    const active = isSubscriptionAccessActive(status)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
        const auditUserId = await resolveSubscriptionAuditUserId(tx, anchorFirmId, null)
        if (!auditUserId) {
            logger.warn('Polar webhook: could not resolve subscription audit user id', { anchorFirmId })
        }
        // Must clear every active row for this firm first. Partial unique index
        // `subscriptions_one_active_per_firm` allows only one active row per firmId.
        // The previous NOT: polarSubscriptionId filter skipped rows with NULL polarSubscriptionId
        // (sandbox free tier), so create() hit P2002 when adding a paid Polar subscription.
        if (active) {
            await tx.subscription.updateMany({
                where: {
                    firmId: anchorFirmId,
                    active: true,
                    deletedAt: null,
                },
                data: {
                    active: false,
                    deactivatedAt: now,
                    ...(auditUserId ? { updatedBy: auditUserId } : {}),
                },
            })
        }

        const existing = details.subscriptionId
            ? await tx.subscription.findFirst({
                  where: { firmId: anchorFirmId, polarSubscriptionId: details.subscriptionId, deletedAt: null },
                  select: { id: true },
              })
            : null

        const settingsPayload = {
            metadata: details.productMetadata ?? {},
        } as const

        const recurringModel = pricingModelFromRecurringFlag(true)
        if (existing) {
            await tx.subscription.update({
                where: { id: existing.id },
                data: {
                    status,
                    plan: details.planName ?? null,
                    provider: 'polar',
                    pricingModel: recurringModel,
                    currentPeriodEnd: details.periodEnd ?? null,
                    couponCode: details.couponCode ?? null,
                    polarCustomerId: details.customerId ?? null,
                    polarSubscriptionId: details.subscriptionId ?? null,
                    polarOrderId: null,
                    active,
                    deactivatedAt: active ? null : now,
                    settings: settingsPayload,
                    ...(auditUserId ? { updatedBy: auditUserId } : {}),
                },
            })
        } else {
            await tx.subscription.create({
                data: {
                    firmId: anchorFirmId,
                    status,
                    plan: details.planName ?? null,
                    provider: 'polar',
                    pricingModel: recurringModel,
                    currentPeriodEnd: details.periodEnd ?? null,
                    couponCode: details.couponCode ?? null,
                    polarCustomerId: details.customerId ?? null,
                    polarSubscriptionId: details.subscriptionId ?? null,
                    polarOrderId: null,
                    active,
                    deactivatedAt: active ? null : now,
                    settings: settingsPayload,
                    ...(auditUserId ? { createdBy: auditUserId, updatedBy: auditUserId } : {}),
                },
            })
        }
    })

    await applyBillingCapsAfterPolarSubscriptionSync({
        anchorFirmId,
        productId: details.productId,
        planName: details.planName,
        status,
    })

    if (active) {
        await advanceOnboardingPastSubscribeForBillingAnchor(anchorFirmId, details.productId ?? null)
    }

    logger.warn('Polar webhook synced firm subscription', {
        status,
        resolvedFirmId,
        anchorFirmId,
        subscriptionId: details.subscriptionId,
        customerId: details.customerId,
        productId: details.productId,
    })

    await refreshBillingPlanForFirmGroupUsers(anchorFirmId)

    return {
        anchorFirmId,
        subscriptionId: details.subscriptionId,
        productId: details.productId,
        status,
    }
}
