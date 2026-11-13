import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ASSISTANT } from './assistant'
import { AI_PERSON_LIMITS, type AiFeature } from './features'
import { AiCreditLimitError } from './credit-cap'

/**
 * Per-person limits on AI calls (AI_PERSON_LIMITS in ./features): calls a minute and calls a day
 * across every Brio feature, and a day's cap on some features. Checked in the one gate,
 * getGuardedAnthropic, for every call a person starts, free or paid, on every plan.
 *
 * The credit windows (credit-cap.ts) are per billing group and count credits from the usage ledger,
 * which is written when a call finishes. That leaves three holes this closes:
 * - a free action (Your day) skips them, so nothing bounded it;
 * - one person, or a script with their session, could spend the whole group's allowance;
 * - requests sent at once all read the same count before any of them is recorded.
 *
 * So each call is written when it starts (AiCallStart) and then counted, oldest first: of requests
 * sent together, the first ones within the limit go and the rest are refused. A refused call deletes
 * its own row, so trying again doesn't keep someone locked out. The windows are rolling.
 *
 * Calls without a person (the daily RAID check, charged to the firm) aren't limited here; their own
 * schedule bounds them. If the table can't be read or written, the call goes ahead and the failure is
 * logged: like the credit cap, a guard that broke must not take Brio down with it.
 */

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** What a person is told when a limit stops them: which limit, and when it frees up. */
const FEATURE_WORDS: Partial<Record<AiFeature, (n: number) => string>> = {
    dayBrief: () => `Your day has already been written twice today. ${ASSISTANT.name} writes a new one tomorrow.`,
    dayBriefRewrite: (n) => `You've rewritten Your day ${n} times today, the most for one day. ${ASSISTANT.name} writes a new one tomorrow.`,
}

function featureWords(feature: AiFeature, n: number): string {
    return FEATURE_WORDS[feature]?.(n) ?? `You've reached today's limit for this ${ASSISTANT.name} action. Try again tomorrow.`
}

export const PERSON_MINUTE_WORDS = `That's a lot of ${ASSISTANT.name} requests in a minute. Wait a moment and try again.`
export const personDayWords = (n: number) =>
    `You've used ${ASSISTANT.name} ${n} times in the last 24 hours, the most for one person. Try again in a few hours.`

/**
 * Throws AiCreditLimitError (kind 'person', answered as 429 by aiFailureResponse) when this call would
 * go over one of the person's limits. Call BEFORE the model call; the call then counts as started.
 */
export async function assertWithinPersonLimits(params: { userId?: string | null; feature: AiFeature }): Promise<void> {
    const { userId, feature } = params
    if (!userId) return

    let started: { id: bigint; createdAt: Date }
    try {
        started = await prisma.aiCallStart.create({ data: { userId, feature }, select: { id: true, createdAt: true } })
    } catch (error) {
        logger.error(`AI person limit not checked (${feature}): the call couldn't be recorded`, error as Error)
        return
    }

    let refusal: { words: string; limit: number; used: number } | null = null
    try {
        // Counted against the row's own time (the database clock), up to and including this call.
        const at = started.createdAt.getTime()
        const upTo = { userId, id: { lte: started.id } }
        const featureCap = AI_PERSON_LIMITS.perFeaturePerDay[feature]
        const [lastMinute, lastDay, featureDay] = await Promise.all([
            prisma.aiCallStart.count({ where: { ...upTo, createdAt: { gt: new Date(at - MINUTE_MS) } } }),
            prisma.aiCallStart.count({ where: { ...upTo, createdAt: { gt: new Date(at - DAY_MS) } } }),
            featureCap !== undefined
                ? prisma.aiCallStart.count({ where: { ...upTo, feature, createdAt: { gt: new Date(at - DAY_MS) } } })
                : Promise.resolve(0),
        ])

        if (featureCap !== undefined && featureDay > featureCap) {
            refusal = { words: featureWords(feature, featureCap), limit: featureCap, used: featureDay - 1 }
        } else if (lastMinute > AI_PERSON_LIMITS.perMinute) {
            refusal = { words: PERSON_MINUTE_WORDS, limit: AI_PERSON_LIMITS.perMinute, used: lastMinute - 1 }
        } else if (lastDay > AI_PERSON_LIMITS.perDay) {
            refusal = { words: personDayWords(AI_PERSON_LIMITS.perDay), limit: AI_PERSON_LIMITS.perDay, used: lastDay - 1 }
        }

        if (refusal) {
            // A refused call didn't happen: it doesn't count against the next try.
            await prisma.aiCallStart.delete({ where: { id: started.id } })
        } else {
            // This person's rows older than any window: nothing reads them again.
            await prisma.aiCallStart.deleteMany({ where: { userId, createdAt: { lt: new Date(at - DAY_MS) } } })
        }
    } catch (error) {
        logger.error(`AI person limit not checked (${feature}): the count failed`, error as Error)
        return
    }

    if (refusal) {
        logger.info(`AI person limit reached (${feature}) for user ${userId}: ${refusal.used}/${refusal.limit}`)
        throw new AiCreditLimitError(refusal.words, 'person', refusal.limit, refusal.used)
    }
}
