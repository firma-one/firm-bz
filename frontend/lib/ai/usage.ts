import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { AI_MODEL } from './client'

export type AiFeature = 'brief' | 'summary' | 'chat' | 'searchInterpret' | 'filesAgent'

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
    // The first feature whose cost is NOT one row per user action: an agent run records one row
    // per model turn, so a single review may write several. Weighted at 1 so the unit stays "a
    // credit is an answer" rather than introducing a second pricing concept — the run's total is
    // bounded by MAX_AGENT_TURNS and shown to the user before it starts.
    filesAgent: 1,
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
 * `anchor` moved by whole calendar months in UTC, keeping its time of day. The day of the month is
 * clamped to the target month's length, and always taken from the anchor rather than from the
 * previous step, so a subscription billed on the 31st gets Feb 28 (or 29) and then the 31st again,
 * never drifting to the 28th for good.
 */
function addMonthsUtc(anchor: Date, months: number): Date {
    const target = new Date(Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + months,
        1,
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
    ))
    const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(anchor.getUTCDate(), daysInMonth))
    return target
}

/** Far enough for any real subscription (a century of months); only a corrupt date gets near it. */
const MAX_MONTH_STEPS = 1200

/**
 * The monthly credit window that contains `now`: when this month's allowance started counting, and
 * when it refills.
 *
 * Every plan's allowance is monthly, whatever the billing interval. `Subscription` stores
 * `currentPeriodEnd` but no start, so the window is found from the end: for a monthly plan it is the
 * month before it; for an annual plan, whose period end is up to a year away, it steps back whole
 * months from the end until the window holds `now`. Calendar months (not 30 days), anchored to the
 * billing day, keep the window aligned with the invoice the customer is reading. A period end that
 * has already passed (the renewal webhook is late) steps forward instead, so credits still refill on
 * time rather than staying spent until the sync lands.
 *
 * With no subscription — free plan — the calendar month is the honest fallback: there is no billing
 * period to align to.
 */
export function creditPeriod(periodEnd: Date | null | undefined, now: Date = new Date()): { start: Date; end: Date } {
    if (!periodEnd || Number.isNaN(periodEnd.getTime())) {
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        }
    }
    // Window i runs from (periodEnd + i - 1 months) to (periodEnd + i months); i = 0 is the month
    // that ends at the period end.
    let i = 0
    while (addMonthsUtc(periodEnd, i - 1) > now && i > -MAX_MONTH_STEPS) i--
    while (addMonthsUtc(periodEnd, i) <= now && i < MAX_MONTH_STEPS) i++
    return { start: addMonthsUtc(periodEnd, i - 1), end: addMonthsUtc(periodEnd, i) }
}

/** Start of the monthly credit window that contains `now`. See {@link creditPeriod}. */
export function creditPeriodStart(periodEnd: Date | null | undefined, now: Date = new Date()): Date {
    return creditPeriod(periodEnd, now).start
}

export interface AiCreditUsage {
    /** Total credits consumed in the period. */
    used: number
    /** Per-feature split, so the page can show WHERE the credits went, not just how many. */
    byFeature: Record<AiFeature, number>
    periodStartIso: string
    /**
     * Period allowance from `entitledAiCredits`, and whether it is actually enforced.
     *
     * Both are needed to say anything honest on the billing page. `allowance` null means no
     * entitlement resolved, so there is nothing to count down to; `enforced` false means a cap
     * exists on paper but `ENFORCE_BILLING_GATES` is off, so no request will be refused.
     *
     * Added because the page previously showed usage with the fixed caption "no limit applied",
     * which stopped being true the moment enforcement was switched on — a user could be refused
     * by the API and told on this page that nothing was capped.
     */
    allowance: number | null
    enforced: boolean
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
    /**
     * Allowance and enforcement state, resolved by the caller.
     *
     * Passed in rather than read here to keep the import direction one-way: `credit-cap` already
     * imports this module, so reading the entitlement from it would create a cycle.
     */
    entitlement?: { allowance: number | null; enforced: boolean },
): Promise<AiCreditUsage> {
    const since = creditPeriodStart(periodEnd)
    const rows = await prisma.platformAiUsage.groupBy({
        by: ['feature'],
        where: { groupId, createdAt: { gte: since } },
        _sum: { credits: true },
    })

    const byFeature: Record<AiFeature, number> = { brief: 0, summary: 0, chat: 0, searchInterpret: 0, filesAgent: 0 }
    let used = 0
    for (const r of rows) {
        const feature = r.feature as AiFeature
        const credits = Number(r._sum.credits ?? 0)
        if (feature in byFeature) byFeature[feature] = credits
        used += credits
    }

    return {
        used,
        byFeature,
        periodStartIso: since.toISOString(),
        allowance: entitlement?.allowance ?? null,
        enforced: entitlement?.enforced ?? false,
    }
}

/**
 * Rate-limit windows. A cap is meaningless without a window: "500 credits" only means something
 * paired with "per what".
 *
 * `period` is the billing entitlement — it protects margin and aligns with the invoice. The
 * shorter windows are rate limits, which are a different job: they protect against a retry storm
 * or a runaway loop burning a month's allowance in an hour, which a monthly cap would not notice
 * until it was gone. Both can apply at once; the tightest binding window wins.
 */
export type CreditWindow = 'sixHours' | 'day' | 'week' | 'period'

export const CREDIT_WINDOW_LABEL: Record<CreditWindow, string> = {
    sixHours: '6 hours',
    day: 'day',
    week: 'week',
    period: 'month',
}

/** Start instant for a window, relative to now (or the billing period for `period`). */
export function creditWindowStart(
    window: CreditWindow,
    periodEnd: Date | null | undefined,
    now: Date = new Date(),
): Date {
    switch (window) {
        case 'sixHours':
            return new Date(now.getTime() - 6 * 60 * 60 * 1000)
        case 'day':
            return new Date(now.getTime() - 24 * 60 * 60 * 1000)
        case 'week':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        case 'period':
            return creditPeriodStart(periodEnd, now)
    }
}

export interface CreditLimitCheck {
    window: CreditWindow
    limit: number
    used: number
    /** Credits the next call would need; a call is blocked when used + cost > limit. */
    remaining: number
    exceeded: boolean
}

/**
 * Checks one window without consuming anything.
 *
 * Rolling windows deliberately, not calendar buckets: a calendar-day limit resets at midnight, so
 * a burst at 23:59 plus another at 00:01 passes twice the intended rate. A rolling window cannot
 * be gamed that way.
 */
export async function checkCreditWindow(
    groupId: string,
    window: CreditWindow,
    limit: number,
    cost: number,
    periodEnd: Date | null | undefined,
): Promise<CreditLimitCheck> {
    const since = creditWindowStart(window, periodEnd)
    const used = await creditsUsedSince(groupId, since)
    return {
        window,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        exceeded: used + cost > limit,
    }
}
