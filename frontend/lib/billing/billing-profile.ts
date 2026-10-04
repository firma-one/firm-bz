import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForGroup,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { createPolarClient } from '@/lib/billing/polar-client'

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

    // Billing anchor display fields (name/slug) come from the workspace firm itself —
    // there's no dedicated "anchor firm" concept anymore now that sandbox firms are
    // retired (see .claude/plans/sandbox-firm-removal.md, Step 1). The actual
    // subscription/plan data is looked up by groupId, which is genuinely group-scoped.
    const groupId = await resolveGroupId(workspaceFirm.id)
    const activeSub = await getActiveSubscriptionForGroup(groupId)
    let periodEnd = activeSub?.currentPeriodEnd ?? null
    const polarSubscriptionId = activeSub?.polarSubscriptionId ?? null
    const shouldFetchPolarPeriod = Boolean(polarSubscriptionId) && !periodEnd
    if (shouldFetchPolarPeriod && polarSubscriptionId) {
        const token = process.env.POLAR_ACCESS_TOKEN?.trim()
        if (token) {
            try {
                const polar = createPolarClient(token)
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
            id: workspaceFirm.id,
            name: workspaceFirm.name,
            slug: workspaceFirm.slug,
            sandboxOnly: workspaceFirm.sandboxOnly,
            subscriptionStatus: subscriptionAccessStatusLabel(activeSub),
            subscriptionPlan: activeSub?.plan ?? null,
            pricingModel: activeSub?.pricingModel ?? null,
            subscriptionCurrentPeriodEnd: periodEnd,
            polarCustomerId: activeSub?.polarCustomerId ?? null,
            polarSubscriptionId: activeSub?.polarSubscriptionId ?? null,
        },
    }
}
