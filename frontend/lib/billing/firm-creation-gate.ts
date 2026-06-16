import { prisma } from '@/lib/prisma'
import { countBillableFirmsInBillingGroup } from '@/lib/billing/billing-group'
import {
    anchorUsesSandboxCapDefaults,
    effectiveFirmGroupCapForAnchor,
    loadAnchorForCaps,
    type AnchorCapsRow,
} from '@/lib/billing/effective-billing-caps'

function effectiveCustomFirmCap(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) {
        return anchor.entitledFirms ?? 1
    }
    return effectiveFirmGroupCapForAnchor(anchor)
}

export type EligibleGroup = { groupId: string; sandboxOnly: boolean }

/**
 * Groups where the user may add another firm (admin + under cap).
 */
export async function getEligibleGroups(userId: string): Promise<EligibleGroup[]> {
    const memberships = await prisma.firmMember.findMany({
        where: { userId, firm: { deletedAt: null } },
        select: { firm: { select: { groupId: true } } },
    })
    if (memberships.length === 0) return []

    const uniqueGroupIds = Array.from(new Set(memberships.map((m) => m.firm.groupId).filter(Boolean)))
    if (uniqueGroupIds.length === 0) return []

    const results = await Promise.all(
        uniqueGroupIds.map(async (groupId) => {
            // User must be admin on at least one firm in this group
            const adminMembership = await prisma.firmMember.findFirst({
                where: { userId, role: 'firm_admin', firm: { groupId, deletedAt: null } },
                select: { id: true },
            })
            if (!adminMembership) return null

            // Find the sandbox firm in the group for cap checks
            const sandboxFirm = await prisma.firm.findFirst({
                where: { groupId, sandboxOnly: true, deletedAt: null },
                select: { id: true, sandboxOnly: true },
            })
            if (!sandboxFirm) return null

            const anchor = await loadAnchorForCaps(sandboxFirm.id)
            if (!anchor) return null

            const cap = effectiveCustomFirmCap(anchor)
            const used = await countBillableFirmsInBillingGroup(groupId)
            if (used < cap) return { groupId, sandboxOnly: sandboxFirm.sandboxOnly }
            return null
        })
    )

    return results.filter((r): r is EligibleGroup => r !== null)
}

/**
 * Picks the groupId for a new satellite firm.
 */
export async function resolveGroupForNewFirm(userId: string): Promise<string | null> {
    const candidates = await getEligibleGroups(userId)
    if (candidates.length === 0) return null
    return candidates[0].groupId
}

/**
 * True if the user belongs to any firm in this group.
 */
export async function userHasMembershipInGroup(userId: string, groupId: string): Promise<boolean> {
    const membership = await prisma.firmMember.findFirst({
        where: { userId, firm: { groupId, deletedAt: null } },
        select: { id: true },
    })
    return membership !== null
}

export async function canCreateNonSandboxFirm(userId: string): Promise<boolean> {
    const candidates = await getEligibleGroups(userId)
    return candidates.length > 0
}

export type FirmCreationGateReason = 'free_sandbox' | 'at_cap' | 'allowed'
export type FirmCreationGateResult = { reason: FirmCreationGateReason; cap: number | null }

export async function getFirmCreationGateReason(userId: string): Promise<FirmCreationGateResult> {
    const memberships = await prisma.firmMember.findMany({
        where: { userId, firm: { deletedAt: null } },
        select: { firm: { select: { groupId: true } } },
    })
    if (memberships.length === 0) return { reason: 'free_sandbox', cap: null }

    const uniqueGroupIds = Array.from(new Set(memberships.map((m) => m.firm.groupId).filter(Boolean)))
    if (uniqueGroupIds.length === 0) return { reason: 'free_sandbox', cap: null }

    const groupChecks = await Promise.all(
        uniqueGroupIds.map(async (groupId) => {
            const adminMembership = await prisma.firmMember.findFirst({
                where: { userId, role: 'firm_admin', firm: { groupId, deletedAt: null } },
                select: { id: true },
            })
            if (!adminMembership) return null

            const sandboxFirm = await prisma.firm.findFirst({
                where: { groupId, sandboxOnly: true, deletedAt: null },
                select: { id: true },
            })
            if (!sandboxFirm) return null

            const anchor = await loadAnchorForCaps(sandboxFirm.id)
            if (!anchor) return null

            const cap = effectiveCustomFirmCap(anchor)
            const used = await countBillableFirmsInBillingGroup(groupId)
            return { cap, allowed: used < cap }
        })
    )

    const paidGroups = groupChecks.filter((r): r is { cap: number; allowed: boolean } => r !== null)
    if (paidGroups.length === 0) return { reason: 'free_sandbox', cap: null }

    const allowedGroup = paidGroups.find((r) => r.allowed)
    if (allowedGroup) return { reason: 'allowed', cap: allowedGroup.cap }
    return { reason: 'at_cap', cap: paidGroups[0].cap }
}

export async function requireNonSandboxFirmCreationAccess(userId: string): Promise<void> {
    const ok = await canCreateNonSandboxFirm(userId)
    if (!ok) {
        throw new Error('Upgrade to Standard to create a new firm outside the Free Sandbox.')
    }
}

/** @deprecated Use resolveGroupForNewFirm instead */
export async function resolveBillingAnchorForNewSatelliteFirm(userId: string): Promise<string | null> {
    return resolveGroupForNewFirm(userId)
}

/** @deprecated Use userHasMembershipInGroup instead */
export async function userHasMembershipUnderAnchor(userId: string, groupId: string): Promise<boolean> {
    return userHasMembershipInGroup(userId, groupId)
}
