import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
    findGroupIdByPolarCustomerId,
    findGroupIdByPolarSubscriptionId,
} from '@/lib/billing/active-billing-subscription'
import { pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
import { resolveSubscriptionAuditUserId } from '@/lib/billing/subscription-audit'
import { advanceOnboardingPastSubscribeForBillingAnchor } from '@/lib/onboarding/advance-past-subscribe-on-paid'
import { polarServer } from '@/lib/billing/polar-client'
import { PolarWebhookRetryError, withinPolarRetryWindow } from '@/lib/billing/polar-webhook-retry'

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

function metadataGroupId(payload: UnknownRecord): string | null {
    const metadata = asRecord(payload.metadata)
    if (!metadata) return null
    return asString(metadata.groupId) ?? asString(metadata.firmId)
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
        /** The group our checkout route wrote into the checkout's metadata, read on its own as a fallback. */
        metadataGroupId: metadataGroupId(body),
        checkoutId: asString(body.checkoutId) ?? asString(body.checkout_id),
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
            metadataGroupId(body),
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

/** Returns the groupId from the webhook payload. customerExternalId is always groupId. */
async function resolveGroupForPayload(details: ReturnType<typeof extractSubscriptionDetails>): Promise<string | null> {
    if (details.customerExternalId) {
        // customerExternalId is group.id — verify it exists
        const group = await prisma.group.findUnique({
            where: { id: details.customerExternalId },
            select: { id: true },
        })
        if (group) return group.id
    }

    // The customer's external id wins above, so a Polar customer already mapped to a group that no
    // longer exists would miss even though our checkout named the group in its metadata.
    if (details.metadataGroupId && details.metadataGroupId !== details.customerExternalId) {
        const group = await prisma.group.findUnique({
            where: { id: details.metadataGroupId },
            select: { id: true },
        })
        if (group) return group.id
    }

    if (details.customerId) {
        const id = await findGroupIdByPolarCustomerId(details.customerId)
        if (id) return id
    }

    if (details.subscriptionId) {
        const id = await findGroupIdByPolarSubscriptionId(details.subscriptionId)
        if (id) return id
    }

    return null
}

export type PolarSubscriptionSyncResult = {
    groupId: string
    subscriptionId: string | null
    productId: string | null
    status: SubscriptionStatus
    scheduledCancelAt: Date | null
}

/**
 * Maps Polar subscription webhooks → group subscription row.
 * Returns context for post-sync hooks (revoke free tier, resync sandbox free, etc.).
 */
export async function syncFirmSubscriptionFromPolarEvent(
    payload: unknown,
    options?: { statusOverride?: SubscriptionStatus; scheduledCancelAt?: Date | null }
): Promise<PolarSubscriptionSyncResult | null> {
    const body = getSubscriptionBodyFromWebhookPayload(payload)
    if (!body) {
        logger.warn('Polar webhook: could not parse subscription payload')
        return null
    }

    const details = extractSubscriptionDetails(body)
    const status = options?.statusOverride ?? mapPolarSubscriptionStatusToDb(body.status)
    const groupId = await resolveGroupForPayload(details)
    if (!groupId) {
        const ids = {
            customerExternalId: details.customerExternalId,
            metadataGroupId: details.metadataGroupId,
            customerId: details.customerId,
            subscriptionId: details.subscriptionId,
            checkoutId: details.checkoutId,
            productId: details.productId,
            status,
        }
        const freeProductId = process.env.POLAR_FREE_PRODUCT_ID?.trim()
        const isPaid =
            isSubscriptionAccessActive(status) && !(freeProductId && details.productId === freeProductId)
        // A sandbox Polar organization is shared by local, preview and staging, so every endpoint
        // hears about every environment's subscriptions: a miss there is expected, not an alarm.
        if (!isPaid || polarServer() !== 'production') {
            logger.warn('Polar webhook: no group mapping found', ids)
            return null
        }
        // Someone paid and no group gets the plan. Reach an operator (Sentry) and fail, so Polar
        // delivers it again once the mapping is fixed.
        const err = new PolarWebhookRetryError(
            `Paid Polar subscription ${details.subscriptionId ?? '(no id)'} matches no billing group`
        )
        if (!withinPolarRetryWindow(payload)) {
            logger.error('Polar webhook: paid subscription matches no group; retry window over, giving up', err, 'billing', ids)
            return null
        }
        logger.error('Polar webhook: paid subscription matches no group', err, 'billing', ids)
        throw err
    }

    const overrideScheduledCancelAt = options?.scheduledCancelAt

    const active = isSubscriptionAccessActive(status)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
        const auditUserId = await resolveSubscriptionAuditUserId(tx, groupId, null)
        if (!auditUserId) {
            logger.warn('Polar webhook: could not resolve subscription audit user id', { groupId })
        }
        if (active) {
            await tx.subscription.updateMany({
                where: {
                    groupId,
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
                  where: { groupId, polarSubscriptionId: details.subscriptionId, deletedAt: null },
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
                    plan: details.planName ?? null,
                    provider: 'polar',
                    pricingModel: recurringModel,
                    currentPeriodEnd: details.periodEnd ?? null,
                    ...(overrideScheduledCancelAt !== undefined ? { scheduledCancelAt: overrideScheduledCancelAt } : {}),
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
                    groupId,
                    plan: details.planName ?? null,
                    provider: 'polar',
                    pricingModel: recurringModel,
                    currentPeriodEnd: details.periodEnd ?? null,
                    scheduledCancelAt: overrideScheduledCancelAt ?? null,
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

    if (active) {
        await advanceOnboardingPastSubscribeForBillingAnchor(groupId, details.productId ?? null)
    }

    logger.info('Polar webhook synced group subscription', {
        status,
        groupId,
        subscriptionId: details.subscriptionId,
        customerId: details.customerId,
        productId: details.productId,
    })

    await refreshBillingPlanForFirmGroupUsers(groupId)

    return {
        groupId,
        subscriptionId: details.subscriptionId,
        productId: details.productId,
        status,
        scheduledCancelAt: overrideScheduledCancelAt ?? null,
    }
}
