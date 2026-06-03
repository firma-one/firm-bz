import { prisma } from '@/lib/prisma'
import { countFirmsInBillingGroup, resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import {
    anchorUsesSandboxCapDefaults,
    effectiveFirmGroupCapForAnchor,
    loadAnchorForCaps,
} from '@/lib/billing/effective-billing-caps'

export type EligibleSatelliteAnchor = { anchorId: string; sandboxOnly: boolean }

/**
 * Billing anchors where the user may add another satellite firm (under cap).
 * A paid sandbox firm with recurring Polar checkout is a valid anchor; custom firms
 * should set `anchorFirmId` to that anchor.
 */
export async function getEligibleSatelliteAnchorCandidates(
    userId: string
): Promise<EligibleSatelliteAnchor[]> {
    const memberships = await prisma.firmMember.findMany({
        where: { userId, firm: { deletedAt: null } },
        select: { firmId: true },
    })
    if (memberships.length === 0) return []

    const out: EligibleSatelliteAnchor[] = []
    const seenAnchors = new Set<string>()
    for (const membership of memberships) {
        const anchorId = await resolveBillingAnchorFirmId(membership.firmId)
        if (!anchorId || seenAnchors.has(anchorId)) continue
        seenAnchors.add(anchorId)

        // User must be a firm_admin on the anchor to create satellites under it
        const anchorMembership = await prisma.firmMember.findFirst({
            where: { firmId: anchorId, userId, role: 'firm_admin' },
            select: { id: true },
        })
        if (!anchorMembership) continue

        const anchor = await loadAnchorForCaps(anchorId)
        if (!anchor || anchorUsesSandboxCapDefaults(anchor)) continue

        const cap = effectiveFirmGroupCapForAnchor(anchor)
        const used = await countFirmsInBillingGroup(anchorId)
        if (used < cap) {
            out.push({ anchorId, sandboxOnly: anchor.sandboxOnly })
        }
    }
    return out
}

/**
 * Picks the anchor for a new custom firm: prefer the paid **sandbox** workspace when present,
 * so checkout on the default sandbox folds additional firms into the same subscription.
 */
export async function resolveBillingAnchorForNewSatelliteFirm(userId: string): Promise<string | null> {
    const candidates = await getEligibleSatelliteAnchorCandidates(userId)
    if (candidates.length === 0) return null
    const sandboxPaid = candidates.find((c) => c.sandboxOnly)
    return (sandboxPaid ?? candidates[0]).anchorId
}

/**
 * True if the user belongs to any firm whose billing anchor is `anchorId`.
 */
export async function userHasMembershipUnderAnchor(userId: string, anchorId: string): Promise<boolean> {
    const memberships = await prisma.firmMember.findMany({
        where: { userId, firm: { deletedAt: null } },
        select: { firmId: true },
    })
    for (const m of memberships) {
        const a = await resolveBillingAnchorFirmId(m.firmId)
        if (a === anchorId) return true
    }
    return false
}

/**
 * Non-sandbox firm creation requires at least one paid/trialing subscription
 * on any firm the user belongs to.
 */
export async function canCreateNonSandboxFirm(userId: string): Promise<boolean> {
    const candidates = await getEligibleSatelliteAnchorCandidates(userId)
    return candidates.length > 0
}

export type FirmCreationGateReason = 'free_sandbox' | 'at_cap' | 'allowed'
export type FirmCreationGateResult = { reason: FirmCreationGateReason; cap: number | null }

/**
 * Returns why the user cannot create a firm, or 'allowed' if they can.
 * Also returns the plan's firm cap for messaging purposes.
 * - 'free_sandbox': no active paid subscription — needs to upgrade
 * - 'at_cap': has paid subscription but has reached their firm limit — contact support
 * - 'allowed': under cap, can create
 */
export async function getFirmCreationGateReason(userId: string): Promise<FirmCreationGateResult> {
    const memberships = await prisma.firmMember.findMany({
        where: { userId, firm: { deletedAt: null } },
        select: { firmId: true },
    })
    if (memberships.length === 0) return { reason: 'free_sandbox', cap: null }

    let hasPaidSubscription = false
    const seenAnchors = new Set<string>()

    for (const membership of memberships) {
        const anchorId = await resolveBillingAnchorFirmId(membership.firmId)
        if (!anchorId || seenAnchors.has(anchorId)) continue
        seenAnchors.add(anchorId)

        const anchorMembership = await prisma.firmMember.findFirst({
            where: { firmId: anchorId, userId, role: 'firm_admin' },
            select: { id: true },
        })
        if (!anchorMembership) continue

        const anchor = await loadAnchorForCaps(anchorId)
        if (!anchor) continue

        if (anchorUsesSandboxCapDefaults(anchor)) continue

        hasPaidSubscription = true

        const cap = effectiveFirmGroupCapForAnchor(anchor)
        const used = await countFirmsInBillingGroup(anchorId)
        if (used < cap) return { reason: 'allowed', cap }
        // At cap — return the cap value for messaging
        return { reason: 'at_cap', cap }
    }

    return { reason: hasPaidSubscription ? 'at_cap' : 'free_sandbox', cap: null }
}

export async function requireNonSandboxFirmCreationAccess(userId: string): Promise<void> {
    const ok = await canCreateNonSandboxFirm(userId)
    if (!ok) {
        throw new Error('Upgrade to Standard to create a new firm outside the Free Sandbox.')
    }
}
