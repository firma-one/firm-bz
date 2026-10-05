import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { aiCreditStatus } from '@/lib/ai/credit-cap'
import { creditPace } from '@/lib/ai/credit-pace'
import { creditPeriodStart } from '@/lib/ai/usage'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/credits
 *
 * This billing group's AI credit balance and burn rate, for the top-bar indicator.
 *
 * Credits are a GROUP-level resource — chat, Doc Search, summaries and briefs all draw on the same
 * pool — so this is deliberately one global endpoint rather than a figure threaded through each AI
 * surface. A per-surface counter would also move while the user was nowhere near that surface.
 *
 * ## Access
 *
 * Gated like the AI features themselves. The engagement assistant renders only for internal firm
 * roles (`isInternalViewer`) and its API enforces `canViewProjectInternalTabs`; the group-level
 * equivalent here is an `internal` firm membership. External collaborators cannot use AI, so they
 * are not shown its balance — and that is enforced here rather than by hiding the icon, since a
 * client-side check is not an access control.
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // The user's default firm, and with it the billing group. An external collaborator has no
        // internal membership and so gets no balance.
        const membership = await prisma.firmMember.findFirst({
            where: { userId: user.id, membershipType: 'internal' },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: { firm: { select: { groupId: true } } },
        })
        const groupId = membership?.firm?.groupId
        if (!groupId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const [status, sub] = await Promise.all([
            aiCreditStatus(groupId),
            getActiveSubscriptionForGroup(groupId),
        ])

        const periodEnd = sub?.currentPeriodEnd ?? null
        const pace = periodEnd
            ? creditPace({
                allowance: status.allowance,
                used: status.usedThisPeriod,
                periodStart: creditPeriodStart(periodEnd),
                periodEnd,
            })
            : null

        return NextResponse.json({
            data: {
                // Infinity does not survive JSON, so an unresolved entitlement is reported as null
                // and the UI says the allowance is unknown rather than inventing "unlimited" — the
                // same honesty the billing page needs. In practice this means Polar metadata has
                // not synced, which the /system resync tools exist to fix.
                allowance: Number.isFinite(status.allowance) ? status.allowance : null,
                used: status.usedThisPeriod,
                remaining: Number.isFinite(status.allowance) ? status.remaining : null,
                enforced: status.enforced,
                periodEndIso: periodEnd?.toISOString() ?? null,
                aheadOfPace: pace?.aheadOfPace ?? false,
                projectedExhaustionIso: pace?.projectedExhaustion?.toISOString() ?? null,
            },
        })
    } catch (error) {
        logger.error('[ai/credits] GET failed:', error as Error)
        return NextResponse.json({ error: 'Could not load AI credits' }, { status: 500 })
    }
}
