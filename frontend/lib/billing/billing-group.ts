import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForGroup,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'

/** Resolve the groupId for a given firmId. */
export async function resolveGroupId(firmId: string): Promise<string> {
    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { groupId: true },
    })
    if (!firm) throw new Error(`Firm not found: ${firmId}`)
    return firm.groupId
}

export type BillingGroupRow = {
    id: string
    subscriptionStatus: string | null
    sandboxOnly: boolean
    groupId: string
}

/**
 * Load the firm row used for subscription / gating.
 * Subscription is looked up on the sandbox firm in the group (the billing root).
 */
export async function getFirmRowForBillingGate(firmId: string): Promise<BillingGroupRow | null> {
    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, sandboxOnly: true, groupId: true },
    })
    if (!firm) return null

    const sub = await getActiveSubscriptionForGroup(firm.groupId)
    return {
        id: firm.id,
        sandboxOnly: firm.sandboxOnly,
        groupId: firm.groupId,
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
    }
}

/** Total firms in this billing group. */
export async function countFirmsInBillingGroup(groupId: string): Promise<number> {
    return prisma.firm.count({
        where: { groupId, deletedAt: null },
    })
}

/**
 * Non-sandbox firms counted against the plan's firm cap.
 * The sandbox firm does not consume a firm slot.
 */
export async function countBillableFirmsInBillingGroup(groupId: string): Promise<number> {
    return prisma.firm.count({
        where: { groupId, deletedAt: null, sandboxOnly: false },
    })
}

/** All firm IDs in this billing group. */
export async function listFirmIdsInBillingGroup(groupId: string): Promise<string[]> {
    const rows = await prisma.firm.findMany({
        where: { groupId, deletedAt: null },
        select: { id: true },
    })
    return rows.map((row) => row.id)
}

/**
 * Non-sandbox firm IDs for entity cap counting.
 * Sandbox firms are excluded so demo data never counts against plan limits.
 */
export async function listBillableFirmIdsInBillingGroup(groupId: string): Promise<string[]> {
    const rows = await prisma.firm.findMany({
        where: { groupId, deletedAt: null, sandboxOnly: false },
        select: { id: true },
    })
    return rows.map((row) => row.id)
}
