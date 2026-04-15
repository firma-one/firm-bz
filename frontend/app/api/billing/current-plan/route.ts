import { Polar } from '@polar-sh/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'

function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

export async function GET(request: Request) {
    const supabase = await createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reqUrl = new URL(request.url)
    const firmId = reqUrl.searchParams.get('firmId')?.trim()
    if (!firmId) {
        return NextResponse.json({ error: 'Missing firmId' }, { status: 400 })
    }

    const membership = await prisma.firmMember.findFirst({
        where: {
            firmId,
            userId: session.user.id,
            firm: { deletedAt: null },
        },
        select: { id: true, role: true },
    })
    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const anchorId = await resolveBillingAnchorFirmId(firmId)
    const anchorSub = await getActiveSubscriptionForFirm(anchorId)

    let periodEnd = anchorSub?.currentPeriodEnd ?? null
    let normalizedStatus = (subscriptionAccessStatusLabel(anchorSub) ?? '').toLowerCase()
    let subscriptionPlan = anchorSub?.plan ?? null
    let canOpenCustomerPortal = Boolean(anchorSub?.polarCustomerId)
    let subscriptionProductId: string | null = null
    let pricingModel =
        anchorSub?.pricingModel === 'recurring_subscription' || anchorSub?.pricingModel === 'one_time_purchase'
            ? anchorSub.pricingModel
            : null
    const shouldBackfillFromPolar =
        (!periodEnd || !subscriptionPlan || !canOpenCustomerPortal || !pricingModel) &&
        Boolean(anchorSub?.polarSubscriptionId) &&
        ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none', ''].includes(normalizedStatus)
    if (shouldBackfillFromPolar && anchorSub?.polarSubscriptionId) {
        const token = process.env.POLAR_ACCESS_TOKEN?.trim()
        if (token) {
            try {
                const polar = new Polar({ accessToken: token, server: polarServer() })
                const sub = await polar.subscriptions.get({ id: anchorSub.polarSubscriptionId })
                const subRecord = asRecord(sub)
                const subProduct = asRecord(subRecord?.product)
                const subCustomer = asRecord(subRecord?.customer)
                const statusFromPolar = asString(subRecord?.status)?.toLowerCase() ?? null
                const statusForPeriod = statusFromPolar || normalizedStatus
                periodEnd =
                    statusForPeriod === 'trialing'
                        ? (sub.trialEnd ?? sub.currentPeriodEnd ?? null)
                        : (sub.currentPeriodEnd ?? null)
                subscriptionPlan =
                    subscriptionPlan ??
                    asString(subProduct?.name) ??
                    asString(subRecord?.productName) ??
                    asString(subRecord?.productId)
                subscriptionProductId =
                    asString(subProduct?.id) ??
                    asString(subRecord?.productId) ??
                    asString(subRecord?.product_id)
                if (statusFromPolar) normalizedStatus = statusFromPolar
                canOpenCustomerPortal =
                    canOpenCustomerPortal ||
                    Boolean(
                        asString(subRecord?.customerId) ??
                            asString(subRecord?.customer_id) ??
                            asString(subCustomer?.id)
                    )
                if (!pricingModel) pricingModel = 'recurring_subscription'
            } catch {
                // Best-effort fallback only.
            }
        }
    }

    const stillMissingPaidContext =
        (!subscriptionPlan || !pricingModel || !['active', 'trialing', 'past_due'].includes(normalizedStatus)) &&
        Boolean(process.env.POLAR_ACCESS_TOKEN?.trim())
    if (stillMissingPaidContext) {
        try {
            const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN!.trim(), server: polarServer() })
            const state = await polar.customers.getStateExternal({ externalId: anchorId })
            const stateRecord = asRecord(state)
            const freeProductId = process.env.POLAR_FREE_PRODUCT_ID?.trim() || null
            const activeSubsRaw = asArray(stateRecord?.activeSubscriptions)
            const activeSubs = activeSubsRaw
                .map((sub) => asRecord(sub))
                .filter((sub): sub is Record<string, unknown> => Boolean(sub))
            const chosenPaidSub =
                activeSubs.find((sub) => {
                    const pid = asString(sub.productId) ?? asString(asRecord(sub.product)?.id)
                    if (freeProductId && pid === freeProductId) return false
                    const s = (asString(sub.status) ?? '').toLowerCase()
                    return ['active', 'trialing', 'past_due'].includes(s)
                }) ??
                activeSubs.find((sub) => {
                    const pid = asString(sub.productId) ?? asString(asRecord(sub.product)?.id)
                    return !freeProductId || pid !== freeProductId
                }) ??
                activeSubs[0]

            if (chosenPaidSub) {
                const chosenProduct = asRecord(chosenPaidSub.product)
                const chosenStatus = (asString(chosenPaidSub.status) ?? normalizedStatus).toLowerCase()
                normalizedStatus = chosenStatus || normalizedStatus
                pricingModel = 'recurring_subscription'
                subscriptionPlan =
                    subscriptionPlan ??
                    asString(chosenProduct?.name) ??
                    asString(chosenPaidSub.productName) ??
                    asString(chosenPaidSub.productId)
                subscriptionProductId =
                    subscriptionProductId ??
                    asString(chosenProduct?.id) ??
                    asString(chosenPaidSub.productId)
                periodEnd =
                    periodEnd ??
                    (chosenStatus === 'trialing'
                        ? (chosenPaidSub.trialEnd as Date | null | undefined) ?? null
                        : (chosenPaidSub.currentPeriodEnd as Date | null | undefined) ?? null)
                canOpenCustomerPortal = true
            }
        } catch {
            // Best-effort only: if Polar state lookup fails, keep DB-derived values.
        }
    }

    const isFirmBillingAdmin = membership.role === 'firm_admin'

    return NextResponse.json(
        {
            current: {
                subscriptionStatus: normalizedStatus || null,
                subscriptionPlan,
                subscriptionProductId,
                pricingModel,
                periodEndIso: periodEnd?.toISOString() ?? null,
                canOpenCustomerPortal: canOpenCustomerPortal || ['active', 'trialing', 'past_due'].includes(normalizedStatus),
                isFirmBillingAdmin,
            },
        },
        {
            headers: {
                // Critical: users may return from Polar after changing plans; don't show stale state.
                'Cache-Control': 'no-store',
            },
        }
    )
}
