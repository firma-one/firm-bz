import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import {
    resolveBillingAnchorFirmId,
    countBillableFirmsInBillingGroup,
    listFirmIdsInBillingGroup,
} from '@/lib/billing/billing-group'
import { pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { parseEntitledFirms, parseEntitledEngagements } from '@/lib/billing/subscription-metadata'

const RECURRING_PRICING_MODEL = pricingModelFromRecurringFlag(true)

const SANDBOX_ENGAGEMENT_CAP = 100_000
const SANDBOX_FIRM_CAP = 1

function enforceBillingCaps(): boolean {
    return (
        process.env.ENFORCE_BILLING_CAPS === 'true' ||
        process.env.ENFORCE_BILLING_GATES === 'true'
    )
}

function planFirmCapFallback(plan: string | null): number {
    const p = (plan ?? '').toLowerCase()
    if (/enterprise/.test(p)) return 100
    if (/business/.test(p)) return 10
    if (/pro/.test(p)) return 5
    return 1  // Standard + unknown
}

function planEngagementCapFallback(plan: string | null): number {
    const p = (plan ?? '').toLowerCase()
    if (/enterprise/.test(p)) return 100
    if (/business/.test(p)) return 50
    if (/pro/.test(p)) return 25
    return 10  // Standard + unknown
}

export type AnchorCapsRow = {
    id: string
    sandboxOnly: boolean
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    pricingModel: string | null
    entitledFirms: number | null
    entitledEngagements: number | null
    capsLocked: boolean
}

export async function loadAnchorForCaps(firmId: string): Promise<AnchorCapsRow | null> {
    const anchorId = await resolveBillingAnchorFirmId(firmId)
    const firm = await prisma.firm.findUnique({
        where: { id: anchorId },
        select: { id: true, sandboxOnly: true },
    })
    if (!firm) return null
    const sub = await getActiveSubscriptionForFirm(anchorId)
    const settings = (sub?.settings ?? {}) as Record<string, unknown>
    const meta = (settings.metadata ?? {}) as Record<string, unknown>
    return {
        id: firm.id,
        sandboxOnly: firm.sandboxOnly,
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
        subscriptionPlan: sub?.plan ?? null,
        pricingModel: sub?.pricingModel ?? null,
        entitledFirms: parseEntitledFirms(meta),
        entitledEngagements: parseEntitledEngagements(meta),
        capsLocked: settings.capsLocked === true,
    }
}

/** True when anchor should use sandbox demo caps (free sandbox), not paid graduation on same row. */
export function anchorUsesSandboxCapDefaults(anchor: AnchorCapsRow): boolean {
    if (!anchor.sandboxOnly) return false
    if (anchor.pricingModel === RECURRING_PRICING_MODEL) return false
    return true
}

export function effectiveActiveEngagementCap(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) return SANDBOX_ENGAGEMENT_CAP
    if (anchor.entitledEngagements != null && anchor.entitledEngagements >= 0) {
        return anchor.entitledEngagements
    }
    return planEngagementCapFallback(anchor.subscriptionPlan)
}

export function effectiveFirmGroupCapForAnchor(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) return SANDBOX_FIRM_CAP
    if (anchor.entitledFirms != null && anchor.entitledFirms >= 1) return anchor.entitledFirms
    return planFirmCapFallback(anchor.subscriptionPlan)
}

export async function assertWithinActiveEngagementCap(workspaceFirmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(workspaceFirmId)
    if (!anchor) throw new Error('Firm not found')
    if (anchorUsesSandboxCapDefaults(anchor)) return

    const cap = effectiveActiveEngagementCap(anchor)
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
    const n = await countBillableFirmsInBillingGroup(anchorFirmId)
    if (n >= cap) {
        throw new Error(
            `Your subscription allows ${cap} firm workspace${cap === 1 ? '' : 's'}. Upgrade or contact support to add more.`
        )
    }
}
