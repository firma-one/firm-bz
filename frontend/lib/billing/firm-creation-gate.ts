import { prisma } from '@/lib/prisma'
import { countBillableFirmsInBillingGroup } from '@/lib/billing/billing-group'
import {
    anchorUsesSandboxCapDefaults,
    effectiveFirmGroupCapForAnchor,
    loadAnchorForCapsByGroupId,
    type AnchorCapsRow,
} from '@/lib/billing/effective-billing-caps'

function effectiveCustomFirmCap(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) {
        return anchor.entitledFirms ?? 1
    }
    return effectiveFirmGroupCapForAnchor(anchor)
}

export type EligibleGroup = { groupId: string }

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

            const anchor = await loadAnchorForCapsByGroupId(groupId)
            const cap = effectiveCustomFirmCap(anchor)
            const used = await countBillableFirmsInBillingGroup(groupId)
            if (used < cap) return { groupId }
            return null
        })
    )

    return results.filter((r): r is EligibleGroup => r !== null)
}

/**
 * Picks the groupId for a new satellite firm when the caller has no specific group in
 * context (e.g. the top-level /d/ fallback view) — arbitrarily uses the first eligible
 * group. Callers that DO have a specific group in context (e.g. the group-scoped firm
 * picker at /d/[groupSlug]/f) must use `resolveGroupForNewFirmInGroup` instead, so a new
 * firm always attaches to the group whose page the user was actually on.
 */
export async function resolveGroupForNewFirm(userId: string): Promise<string | null> {
    const candidates = await getEligibleGroups(userId)
    if (candidates.length === 0) return null
    return candidates[0].groupId
}

/**
 * Validates that `groupId` is itself an eligible group for the user to add a new firm to
 * (admin on at least one firm there + under the group's firm cap) and returns it if so.
 * Use this whenever the caller has a specific group in context, instead of
 * `resolveGroupForNewFirm`'s arbitrary "first eligible group" pick.
 */
export async function resolveGroupForNewFirmInGroup(userId: string, groupId: string): Promise<string | null> {
    const candidates = await getEligibleGroups(userId)
    return candidates.find((c) => c.groupId === groupId)?.groupId ?? null
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

            const anchor = await loadAnchorForCapsByGroupId(groupId)
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

/**
 * Group-scoped counterpart to getFirmCreationGateReason() — reports entitlement status for
 * ONE specific group, instead of "allowed" if ANY group the user belongs to is under cap.
 * Use this whenever the caller has a specific group in context (e.g. the "Add Firm" button
 * on /d/[groupSlug]/f) — the unscoped version would misleadingly show "allowed" for a group
 * that's actually at cap, as long as the user has room in some other, unrelated group.
 */
export async function getFirmCreationGateReasonForGroup(userId: string, groupSlug: string): Promise<FirmCreationGateResult> {
    const group = await prisma.group.findUnique({ where: { slug: groupSlug }, select: { id: true } })
    if (!group) return { reason: 'free_sandbox', cap: null }

    const adminMembership = await prisma.firmMember.findFirst({
        where: { userId, role: 'firm_admin', firm: { groupId: group.id, deletedAt: null } },
        select: { id: true },
    })
    if (!adminMembership) return { reason: 'free_sandbox', cap: null }

    const anchor = await loadAnchorForCapsByGroupId(group.id)
    const cap = effectiveCustomFirmCap(anchor)
    const used = await countBillableFirmsInBillingGroup(group.id)
    return used < cap ? { reason: 'allowed', cap } : { reason: 'at_cap', cap }
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
