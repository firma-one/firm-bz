import { prisma } from '@/lib/prisma'
import { countBillableFirmsInBillingGroup, resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import {
    anchorUsesSandboxCapDefaults,
    effectiveFirmGroupCapForAnchor,
    loadAnchorForCaps,
    type AnchorCapsRow,
} from '@/lib/billing/effective-billing-caps'

/**
 * Cap on non-sandbox firms for this anchor, accounting for free plan entitlements.
 * Free plan (sandbox cap defaults): uses entitledFirms from metadata (default 1).
 * Paid plan: uses effectiveFirmGroupCapForAnchor (which excludes sandbox from cap).
 */
function effectiveCustomFirmCap(anchor: AnchorCapsRow): number {
    if (anchorUsesSandboxCapDefaults(anchor)) {
        // Free plan: entitledFirms covers only non-sandbox (custom) firms
        return anchor.entitledFirms ?? 1
    }
    return effectiveFirmGroupCapForAnchor(anchor)
}

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

    // Resolve all billing anchors in parallel, then deduplicate
    const anchorIds = await Promise.all(memberships.map((m) => resolveBillingAnchorFirmId(m.firmId)))
    const uniqueAnchorIds = Array.from(new Set(anchorIds.filter((id): id is string => !!id)))
    if (uniqueAnchorIds.length === 0) return []

    // Check each unique anchor in parallel: admin membership + caps
    const results = await Promise.all(
        uniqueAnchorIds.map(async (anchorId) => {
            const [anchorMembership, anchor] = await Promise.all([
                prisma.firmMember.findFirst({
                    where: { firmId: anchorId, userId, role: 'firm_admin' },
                    select: { id: true },
                }),
                loadAnchorForCaps(anchorId),
            ])
            if (!anchorMembership || !anchor) return null

            const cap = effectiveCustomFirmCap(anchor)
            const used = await countBillableFirmsInBillingGroup(anchorId)
            if (used < cap) return { anchorId, sandboxOnly: anchor.sandboxOnly }
            return null
        })
    )

    return results.filter((r): r is EligibleSatelliteAnchor => r !== null)
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
    const resolvedAnchorIds = await Promise.all(memberships.map((m) => resolveBillingAnchorFirmId(m.firmId)))
    return resolvedAnchorIds.some((a) => a === anchorId)
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

    // Resolve all anchors in parallel, then deduplicate
    const anchorIds = await Promise.all(memberships.map((m) => resolveBillingAnchorFirmId(m.firmId)))
    const uniqueAnchorIds = Array.from(new Set(anchorIds.filter((id): id is string => !!id)))
    if (uniqueAnchorIds.length === 0) return { reason: 'free_sandbox', cap: null }

    // Check each unique anchor in parallel: admin membership + caps
    const anchorChecks = await Promise.all(
        uniqueAnchorIds.map(async (anchorId) => {
            const [anchorMembership, anchor] = await Promise.all([
                prisma.firmMember.findFirst({
                    where: { firmId: anchorId, userId, role: 'firm_admin' },
                    select: { id: true },
                }),
                loadAnchorForCaps(anchorId),
            ])
            if (!anchorMembership || !anchor) return null

            const cap = effectiveCustomFirmCap(anchor)
            const used = await countBillableFirmsInBillingGroup(anchorId)
            return { cap, allowed: used < cap }
        })
    )

    const paidAnchors = anchorChecks.filter((r): r is { cap: number; allowed: boolean } => r !== null)
    if (paidAnchors.length === 0) return { reason: 'free_sandbox', cap: null }

    const allowedAnchor = paidAnchors.find((r) => r.allowed)
    if (allowedAnchor) return { reason: 'allowed', cap: allowedAnchor.cap }
    return { reason: 'at_cap', cap: paidAnchors[0].cap }
}

export async function requireNonSandboxFirmCreationAccess(userId: string): Promise<void> {
    const ok = await canCreateNonSandboxFirm(userId)
    if (!ok) {
        throw new Error('Upgrade to Standard to create a new firm outside the Free Sandbox.')
    }
}
