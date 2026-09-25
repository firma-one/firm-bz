import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { AI_MODEL } from './client'

export type AiFeature = 'brief' | 'summary' | 'chat' | 'searchInterpret'

/**
 * Credits charged per action.
 *
 * Derived by the standard anchoring rule (one credit = the cheapest action sold) applied to
 * measured costs. The four actions span only ~2.7x, so whole-number weights stay honest without
 * a token-conversion formula users could not reason about. Search interpretation is weighted
 * below 1 because it is genuinely cheaper (~0.37x a chat answer) and the highest-frequency action.
 *
 * Recorded per row at call time, so re-weighting later does not retroactively change history.
 */
export const CREDIT_WEIGHTS: Record<AiFeature, number> = {
    brief: 1,
    summary: 1,
    chat: 1,
    searchInterpret: 0.5,
}

/**
 * Appends one row to the usage ledger.
 *
 * Never throws: metering must not be able to fail a user-facing AI action. A dropped row costs
 * accounting accuracy; a thrown error would cost the user their result.
 */
export async function recordAiUsage(params: {
    firmId?: string | null
    groupId?: string | null
    userId?: string | null
    feature: AiFeature
    inputTokens: number
    outputTokens: number
    model?: string
}): Promise<void> {
    try {
        let groupId = params.groupId ?? null
        if (!groupId && params.firmId) {
            const firm = await prisma.firm.findUnique({
                where: { id: params.firmId },
                select: { groupId: true },
            })
            groupId = firm?.groupId ?? null
        }
        if (!groupId) {
            logger.warn(`AI usage not recorded (${params.feature}): no billing group resolved`)
            return
        }

        await prisma.platformAiUsage.create({
            data: {
                groupId,
                firmId: params.firmId ?? null,
                userId: params.userId ?? null,
                feature: params.feature,
                model: params.model ?? AI_MODEL,
                inputTokens: params.inputTokens,
                outputTokens: params.outputTokens,
                credits: CREDIT_WEIGHTS[params.feature],
            },
        })
    } catch (error) {
        logger.error(`Failed to record AI usage (${params.feature}):`, error as Error)
    }
}

/** Credits consumed by a billing group since a given instant. Read-only; nothing enforces it yet. */
export async function creditsUsedSince(groupId: string, since: Date): Promise<number> {
    const agg = await prisma.platformAiUsage.aggregate({
        where: { groupId, createdAt: { gte: since } },
        _sum: { credits: true },
    })
    return Number(agg._sum.credits ?? 0)
}

/**
 * Start of the current billing period, derived from its end.
 *
 * `Subscription` stores `currentPeriodEnd` but no start, so a month is stepped back from the end
 * rather than adding a column. Using calendar months (not 30 days) keeps the window aligned with
 * the invoice the customer is reading. With no subscription — free plan — the calendar month is
 * the honest fallback: there is no billing period to align to.
 */
export function creditPeriodStart(periodEnd: Date | null | undefined, now: Date = new Date()): Date {
    if (!periodEnd) return new Date(now.getFullYear(), now.getMonth(), 1)
    const start = new Date(periodEnd)
    start.setMonth(start.getMonth() - 1)
    return start
}

export interface AiCreditUsage {
    /** Total credits consumed in the period. */
    used: number
    /** Per-feature split, so the page can show WHERE the credits went, not just how many. */
    byFeature: Record<AiFeature, number>
    periodStartIso: string
}

/**
 * Credits consumed by a billing group in the current period, with a per-feature breakdown.
 *
 * Read-only. Nothing is capped yet: the point of showing this is to gather the real distribution
 * that a cap should later be set from, rather than guessing a number now.
 */
export async function aiCreditUsageForGroup(
    groupId: string,
    periodEnd: Date | null | undefined,
): Promise<AiCreditUsage> {
    const since = creditPeriodStart(periodEnd)
    const rows = await prisma.platformAiUsage.groupBy({
        by: ['feature'],
        where: { groupId, createdAt: { gte: since } },
        _sum: { credits: true },
    })

    const byFeature: Record<AiFeature, number> = { brief: 0, summary: 0, chat: 0, searchInterpret: 0 }
    let used = 0
    for (const r of rows) {
        const feature = r.feature as AiFeature
        const credits = Number(r._sum.credits ?? 0)
        if (feature in byFeature) byFeature[feature] = credits
        used += credits
    }

    return { used, byFeature, periodStartIso: since.toISOString() }
}
