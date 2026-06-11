import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'

/**
 * Firm that holds the Polar subscription and billing state for this workspace.
 * Satellites inherit access from their anchor.
 */
export async function resolveBillingAnchorFirmId(firmId: string): Promise<string> {
    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { anchorFirmId: true },
    })
    if (!firm) return firmId
    return firm.anchorFirmId ?? firmId
}

export type BillingAnchorRow = {
    id: string
    subscriptionStatus: string | null
    sandboxOnly: boolean
    anchorFirmId: string | null
}

/**
 * Load the firm row used for subscription / gating (anchor if this firm is a satellite).
 */
export async function getFirmRowForBillingGate(firmId: string): Promise<BillingAnchorRow | null> {
    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, sandboxOnly: true, anchorFirmId: true },
    })
    if (!firm) return null

    const anchorId = firm.anchorFirmId ?? firm.id
    if (anchorId === firm.id) {
        const sub = await getActiveSubscriptionForFirm(firm.id)
        return { id: firm.id, sandboxOnly: firm.sandboxOnly, anchorFirmId: firm.anchorFirmId, subscriptionStatus: subscriptionAccessStatusLabel(sub) }
    }

    const anchor = await prisma.firm.findUnique({
        where: { id: anchorId },
        select: { id: true, sandboxOnly: true, anchorFirmId: true },
    })
    if (!anchor) return null
    const sub = await getActiveSubscriptionForFirm(anchor.id)
    return { id: anchor.id, sandboxOnly: anchor.sandboxOnly, anchorFirmId: anchor.anchorFirmId, subscriptionStatus: subscriptionAccessStatusLabel(sub) }
}

/** Total firms in this billing group (anchor + satellites). */
export async function countFirmsInBillingGroup(anchorFirmId: string): Promise<number> {
    return prisma.firm.count({
        where: {
            OR: [{ id: anchorFirmId }, { anchorFirmId }],
            deletedAt: null,
        },
    })
}

/**
 * Non-sandbox firms in this billing group counted against the plan's firm cap.
 * The sandbox/anchor firm itself does not consume a firm slot.
 */
export async function countBillableFirmsInBillingGroup(anchorFirmId: string): Promise<number> {
    return prisma.firm.count({
        where: {
            OR: [{ id: anchorFirmId }, { anchorFirmId }],
            deletedAt: null,
            sandboxOnly: false,
        },
    })
}

/** Returns firm ids under this anchor umbrella (anchor + one-level satellites). */
export async function listFirmIdsInBillingGroup(anchorFirmId: string): Promise<string[]> {
    const rows = await prisma.firm.findMany({
        where: {
            OR: [{ id: anchorFirmId }, { anchorFirmId }],
            deletedAt: null,
        },
        select: { id: true },
    })
    return rows.map((row) => row.id)
}

/**
 * Non-sandbox firm IDs in this billing group for entity cap counting.
 * Sandbox firms are excluded so their demo data never counts against plan limits.
 */
export async function listBillableFirmIdsInBillingGroup(anchorFirmId: string): Promise<string[]> {
    const rows = await prisma.firm.findMany({
        where: {
            OR: [{ id: anchorFirmId }, { anchorFirmId }],
            deletedAt: null,
            sandboxOnly: false,
        },
        select: { id: true },
    })
    return rows.map((row) => row.id)
}
