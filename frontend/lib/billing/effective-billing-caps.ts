import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import {
    resolveBillingAnchorFirmId,
    countFirmsInBillingGroup,
    listFirmIdsInBillingGroup,
    type BillingAnchorRow,
} from '@/lib/billing/billing-group'
import {
    getDefaultCapsForPlanColumn,
    resolvePlanColumnFromSubscription,
} from '@/lib/billing/plan-default-caps'
import { pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { getEntitledEngagementsCapForFirm } from '@/lib/billing/subscription-metadata'

type PolarSubscriptionStatusForCaps = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none'

const RECURRING_PRICING_MODEL = pricingModelFromRecurringFlag(true)

function enforceBillingCaps(): boolean {
    return (
        process.env.ENFORCE_BILLING_CAPS === 'true' ||
        process.env.ENFORCE_BILLING_GATES === 'true'
    )
}

const ELIGIBLE: PolarSubscriptionStatusForCaps[] = ['active', 'trialing']

export type AnchorCapsRow = Pick<
    BillingAnchorRow,
    'id' | 'sandboxOnly' | 'billingGroupFirmCap' | 'billingSharesSubscriptionFromFirmId'
> & {
    billingActiveEngagementCap: number | null
    billingCapsLocked: boolean
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    pricingModel: string | null
}

export async function loadAnchorForCaps(firmId: string): Promise<AnchorCapsRow | null> {
    const anchorId = await resolveBillingAnchorFirmId(firmId)
    const firm = await prisma.firm.findUnique({
        where: { id: anchorId },
        select: {
            id: true,
            sandboxOnly: true,
            billingGroupFirmCap: true,
            billingSharesSubscriptionFromFirmId: true,
            billingActiveEngagementCap: true,
            billingCapsLocked: true,
        },
    })
    if (!firm) return null
    const sub = await getActiveSubscriptionForFirm(anchorId)
    return {
        ...firm,
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
        subscriptionPlan: sub?.plan ?? null,
        pricingModel: sub?.pricingModel ?? null,
    }
}

/** True when anchor should use sandbox demo caps (free sandbox), not paid graduation on same row. */
export function anchorUsesSandboxCapDefaults(anchor: AnchorCapsRow): boolean {
    if (!anchor.sandboxOnly) return false
    if (anchor.pricingModel === RECURRING_PRICING_MODEL) return false
    return true
}

export function effectiveActiveEngagementCap(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) {
        return getDefaultCapsForPlanColumn('sandbox').activeEngagementCap
    }
    if (anchor.billingActiveEngagementCap != null && anchor.billingActiveEngagementCap >= 0) {
        return anchor.billingActiveEngagementCap
    }
    const col = resolvePlanColumnFromSubscription(anchor.subscriptionPlan, null)
    return getDefaultCapsForPlanColumn(col).activeEngagementCap
}

export function effectiveFirmGroupCapForAnchor(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) {
        return getDefaultCapsForPlanColumn('sandbox').firmGroupCap
    }
    const sandboxFirmCap = getDefaultCapsForPlanColumn('sandbox').firmGroupCap
    const capCol = resolvePlanColumnFromSubscription(anchor.subscriptionPlan, null)
    const planFirmCap = getDefaultCapsForPlanColumn(capCol).firmGroupCap
    /** Free sandbox provisioning sets firm cap to 1; ignore that row after recurring checkout until webhook overwrites. */
    const ignoreStaleSandboxFirmCap =
        anchor.sandboxOnly &&
        anchor.pricingModel === RECURRING_PRICING_MODEL &&
        anchor.billingGroupFirmCap === sandboxFirmCap
    if (
        anchor.billingGroupFirmCap != null &&
        anchor.billingGroupFirmCap >= 1 &&
        !ignoreStaleSandboxFirmCap
    ) {
        return anchor.billingGroupFirmCap
    }
    return planFirmCap
}

/**
 * After Polar subscription sync: write defaults onto anchor for grandfathering (unless locked).
 */
export async function applyBillingCapsAfterPolarSubscriptionSync(params: {
    anchorFirmId: string
    productId: string | null
    planName: string | null
    status: PolarSubscriptionStatusForCaps
}): Promise<void> {
    const anchor = await prisma.firm.findUnique({
        where: { id: params.anchorFirmId },
        select: { billingCapsLocked: true, sandboxOnly: true },
    })
    if (!anchor || anchor.billingCapsLocked) return
    const sub = await getActiveSubscriptionForFirm(params.anchorFirmId)
    if (anchor.sandboxOnly && sub?.pricingModel !== RECURRING_PRICING_MODEL) return
    if (!ELIGIBLE.includes(params.status)) return

    const col = resolvePlanColumnFromSubscription(params.planName, params.productId)
    const caps = getDefaultCapsForPlanColumn(col)

    await prisma.firm.update({
        where: { id: params.anchorFirmId },
        data: {
            billingActiveEngagementCap: caps.activeEngagementCap,
            billingGroupFirmCap: caps.firmGroupCap,
        },
    })
}

export async function assertWithinActiveEngagementCap(workspaceFirmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(workspaceFirmId)
    if (!anchor) throw new Error('Firm not found')
    if (anchorUsesSandboxCapDefaults(anchor)) return

    const metadataCap = await getEntitledEngagementsCapForFirm(workspaceFirmId)
    const cap = metadataCap ?? effectiveActiveEngagementCap(anchor)
    const groupFirmIds = await listFirmIdsInBillingGroup(anchor.id)
    const count = await prisma.engagement.count({
        where: {
            firmId: { in: groupFirmIds },
            deletedAt: null,
            isDeleted: false,
        },
    })
    if (count >= cap) {
        throw new Error(
            `Your plan allows ${cap} active engagement${cap === 1 ? '' : 's'}. Close or complete one to add another, upgrade, or contact support for a higher limit.`
        )
    }
}

/** Firm workspaces allowed for this billing anchor (anchor + satellites). */
export async function assertWithinFirmGroupCap(anchorFirmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(anchorFirmId)
    if (!anchor || anchorUsesSandboxCapDefaults(anchor)) return

    const cap = effectiveFirmGroupCapForAnchor(anchor)
    const n = await countFirmsInBillingGroup(anchorFirmId)
    if (n >= cap) {
        throw new Error(
            `Your subscription allows ${cap} firm workspace${cap === 1 ? '' : 's'}. Upgrade or contact support to add more.`
        )
    }
}
