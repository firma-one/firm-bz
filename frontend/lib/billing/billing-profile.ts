import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'

export type BillingProfilePayload = {
    /** Viewer’s role on workspace firm; portal/cancel are firm_admin-only. */
    viewerIsFirmBillingAdmin: boolean
    workspaceFirm: {
        id: string
        name: string
        slug: string
        sandboxOnly: boolean
    }
    billingAnchor: {
        id: string
        name: string
        slug: string
        subscriptionStatus: string | null
        subscriptionPlan: string | null
        pricingModel: string | null
        subscriptionCurrentPeriodEnd: Date | null
        polarCustomerId: string | null
        polarSubscriptionId: string | null
        sandboxOnly: boolean
    }
}

export async function getBillingProfileForUser(userId: string): Promise<BillingProfilePayload | null> {
    const membership = await prisma.firmMember.findFirst({
        where: { userId, isDefault: true, firm: { deletedAt: null } },
        include: {
            firm: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    sandboxOnly: true,
                },
            },
        },
    })

    if (!membership?.firm) {
        const fallback = await prisma.firmMember.findFirst({
            where: { userId, firm: { deletedAt: null } },
            orderBy: { createdAt: 'asc' },
            include: {
                firm: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        sandboxOnly: true,
                    },
                },
            },
        })
        if (!fallback?.firm) return null
        return buildPayload(userId, fallback.firm)
    }

    return buildPayload(userId, membership.firm)
}

function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

async function buildPayload(
    userId: string,
    workspaceFirm: {
        id: string
        name: string
        slug: string
        sandboxOnly: boolean
    }
): Promise<BillingProfilePayload> {
    const viewerMembership = await prisma.firmMember.findFirst({
        where: { userId, firmId: workspaceFirm.id },
        select: { role: true },
    })
    const viewerIsFirmBillingAdmin = viewerMembership?.role === 'firm_admin'

    const anchorId = await resolveBillingAnchorFirmId(workspaceFirm.id)
    const anchor = await prisma.firm.findUnique({
        where: { id: anchorId },
        select: {
            id: true,
            name: true,
            slug: true,
            sandboxOnly: true,
        },
    })

    if (!anchor) {
        return {
            viewerIsFirmBillingAdmin,
            workspaceFirm,
            billingAnchor: {
                id: workspaceFirm.id,
                name: workspaceFirm.name,
                slug: workspaceFirm.slug,
                subscriptionStatus: null,
                subscriptionPlan: null,
                pricingModel: null,
                subscriptionCurrentPeriodEnd: null,
                polarCustomerId: null,
                polarSubscriptionId: null,
                sandboxOnly: workspaceFirm.sandboxOnly,
            },
        }
    }

    const activeSub = await getActiveSubscriptionForFirm(anchor.id)
    let periodEnd = activeSub?.currentPeriodEnd ?? null
    const polarSubscriptionId = activeSub?.polarSubscriptionId ?? null
    const shouldFetchPolarPeriod = Boolean(polarSubscriptionId) && !periodEnd
    if (shouldFetchPolarPeriod && polarSubscriptionId) {
        const token = process.env.POLAR_ACCESS_TOKEN?.trim()
        if (token) {
            try {
                const polar = new Polar({ accessToken: token, server: polarServer() })
                const sub = await polar.subscriptions.get({ id: polarSubscriptionId })
                periodEnd = sub.trialEnd ?? sub.currentPeriodEnd ?? null
            } catch {
                // Best-effort fallback only; leave period end null if Polar fetch fails.
            }
        }
    }

    return {
        viewerIsFirmBillingAdmin,
        workspaceFirm,
        billingAnchor: {
            id: anchor.id,
            name: anchor.name,
            slug: anchor.slug,
            sandboxOnly: anchor.sandboxOnly,
            subscriptionStatus: subscriptionAccessStatusLabel(activeSub),
            subscriptionPlan: activeSub?.plan ?? null,
            pricingModel: activeSub?.pricingModel ?? null,
            subscriptionCurrentPeriodEnd: periodEnd,
            polarCustomerId: activeSub?.polarCustomerId ?? null,
            polarSubscriptionId: activeSub?.polarSubscriptionId ?? null,
        },
    }
}
