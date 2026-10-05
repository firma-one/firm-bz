import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { creditPace } from './credit-pace'
import type { AiCreditStatus } from './credit-cap'

/**
 * Tells the group admin when AI credits are being spent faster than the billing period is passing.
 *
 * ## Why the admin, and only the admin
 *
 * The notification asks someone to act — upgrade, or look at how the team is using the feature —
 * and a firm member cannot do either. Sending it to whoever happened to trip the threshold would
 * notify a person with no lever to pull.
 *
 * ## Why this cannot notify repeatedly
 *
 * Being ahead of pace is a standing condition, not an event: it stays true for every subsequent
 * question in a long chat. So this runs on every metered call and relies on `dedupeKey` to discard
 * all but the first write — one notification per group per billing period, enforced by a unique
 * index rather than a read-then-write, which two concurrent turns could both pass.
 *
 * The key carries the period end, so it resets by itself when the subscription rolls over. No
 * stored flag, no cleanup job.
 */

/** Scoped to the platform: this is about a billing group, not any one firm or engagement. */
const NOTIFICATION_TYPE = 'AI_CREDITS_PACE'

function formatRunOut(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

/**
 * Emits the pace warning if it is warranted. Never throws.
 *
 * Diagnostics-grade, exactly like `recordAiUsage`: a failure here must not fail the AI call the
 * user is waiting on. Called after the cap check passes, so a request that was refused outright
 * does not also generate a "running low" notification.
 */
export async function maybeNotifyCreditPace(params: {
    groupId: string
    status: AiCreditStatus
    periodStart: Date
    periodEnd: Date | null
}): Promise<void> {
    try {
        const { groupId, status, periodStart, periodEnd } = params

        // No period end means no subscription dates to measure against — there is no "pace" without
        // a period. The monthly cap still applies; only this warning is skipped.
        if (!periodEnd) return
        if (!status.enforced) return

        const pace = creditPace({
            allowance: status.allowance,
            used: status.usedThisPeriod,
            periodStart,
            periodEnd,
        })
        if (!pace.aheadOfPace || !pace.projectedExhaustion) return

        const admin = await prisma.groupMember.findFirst({
            where: { groupId, role: 'GROUP_ADMIN' },
            orderBy: { createdAt: 'asc' },
            select: { userId: true },
        })
        if (!admin) return

        const remaining = Math.max(0, status.allowance - status.usedThisPeriod)

        await prisma.notification.createMany({
            data: [{
                userId: admin.userId,
                scope: 'PLATFORM',
                // Null firmId: the warning is about the billing group, which spans every firm in it.
                firmId: null,
                type: NOTIFICATION_TYPE,
                priority: 'WARNING',
                title: 'AI credits are running ahead of schedule',
                body: `You have used ${pace.usedPct}% of this period's AI credits with ${pace.elapsedPct}% of the period elapsed. At this rate they will run out around ${formatRunOut(pace.projectedExhaustion)} — ${remaining} of ${status.allowance} left.`,
                ctaUrl: '/d/billing',
                metadata: {
                    groupId,
                    usedPct: pace.usedPct,
                    elapsedPct: pace.elapsedPct,
                    gapPoints: pace.gapPoints,
                    projectedExhaustion: pace.projectedExhaustion.toISOString(),
                },
                channels: { inApp: true },
                // Once per group per billing period. The unique index on dedupeKey is what enforces
                // this; skipDuplicates silently drops every later attempt.
                dedupeKey: `ai-credits-pace:${groupId}:${periodEnd.toISOString()}`,
            }],
            skipDuplicates: true,
        })
    } catch (error) {
        logger.error('Failed to evaluate AI credit pace:', error as Error)
    }
}
