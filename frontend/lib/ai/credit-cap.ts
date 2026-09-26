import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseEntitledAiCredits } from '@/lib/billing/subscription-metadata'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { CREDIT_WEIGHTS, creditsUsedSince, creditPeriodStart, type AiFeature } from './usage'

/**
 * AI credit enforcement — two windows with different jobs.
 *
 * **Period** is the budget. It comes from `entitledAiCredits` in Polar product metadata and is the
 * limit that legitimately binds: a group using more than its tier grants should be on a higher
 * tier. This is not a revenue lever — there is deliberately no top-up product, because selling
 * extra credits would create pressure to keep the base allowance tight, which is the wrong
 * direction for a feature that only earns its keep when people reach for it without hesitating.
 *
 * **Burst** is a tripwire, not a ration. Sized ABOVE anything a person can do by hand, so in
 * normal use it never fires. Its only job is catching a retry storm or a runaway loop, where a
 * monthly cap alone would not notice until the whole allowance was gone. If it fires, something is
 * broken and that is worth knowing.
 *
 * Both are read from the same ledger with different time ranges — no counters to keep in sync.
 */

/** Rolling burst window. Three of these span a 12-hour day, so it maps to a work block. */
const BURST_WINDOW_MS = 4 * 60 * 60 * 1000

/**
 * Burst limit as a share of the period allowance, so it scales with the tier instead of needing a
 * number per plan. Ten percent means: one bad afternoon costs at most a tenth of the month.
 */
const BURST_PERCENT = 0.1

/**
 * Below this allowance, 10% is too small to be a tripwire — on the 25-credit free tier it would be
 * 2.5, low enough to fire during ordinary exploration. Those groups are governed by the period cap
 * alone; their allowance is already small enough that a loop cannot do real damage.
 */
const MIN_ALLOWANCE_FOR_BURST = 100

/**
 * Fallback for a group whose Polar metadata has no `entitledAiCredits` — a safety net, not a tier.
 *
 * EVERY tier including free configures its own allowance in its Polar product, so in a correctly
 * configured account this is never used. It exists so that enabling enforcement cannot silently
 * zero out AI for a group whose metadata has not been updated yet.
 *
 * Set to the intended free-tier figure: enough to generate summaries for a few engagements, ask
 * real questions about them and search properly — roughly a week of exploration, so the value
 * lands before the wall does. Not enough to run a firm on, where active use is ~130 credits/month.
 */
export const DEFAULT_AI_CREDITS = 25

function enforceAiCreditCaps(): boolean {
    return process.env.ENFORCE_BILLING_GATES === 'true'
}

export class AiCreditLimitError extends Error {
    constructor(
        message: string,
        readonly kind: 'period' | 'burst',
        readonly limit: number,
        readonly used: number,
    ) {
        super(message)
        this.name = 'AiCreditLimitError'
    }
}

export interface AiCreditStatus {
    allowance: number
    usedThisPeriod: number
    remaining: number
    /** Null when the allowance is too small for a burst window to be meaningful. */
    burstLimit: number | null
    usedThisBurst: number
    /** Whether ENFORCE_BILLING_GATES is on — the UI should not imply a hard limit when it is off. */
    enforced: boolean
}

async function allowanceForGroup(groupId: string): Promise<number> {
    const sub = await getActiveSubscriptionForGroup(groupId)
    const meta = ((sub?.settings as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>
    const entitled = parseEntitledAiCredits(meta)
    return entitled ?? DEFAULT_AI_CREDITS
}

/** Reads both windows without consuming anything. Safe to call for display. */
export async function aiCreditStatus(groupId: string): Promise<AiCreditStatus> {
    const sub = await getActiveSubscriptionForGroup(groupId)
    const allowance = await allowanceForGroup(groupId)

    const [usedThisPeriod, usedThisBurst] = await Promise.all([
        creditsUsedSince(groupId, creditPeriodStart(sub?.currentPeriodEnd ?? null)),
        creditsUsedSince(groupId, new Date(Date.now() - BURST_WINDOW_MS)),
    ])

    const burstLimit = allowance >= MIN_ALLOWANCE_FOR_BURST
        ? Math.ceil(allowance * BURST_PERCENT)
        : null

    return {
        allowance,
        usedThisPeriod,
        remaining: Math.max(0, allowance - usedThisPeriod),
        burstLimit,
        usedThisBurst,
        enforced: enforceAiCreditCaps(),
    }
}

/**
 * Throws when the next call would breach either window. Call BEFORE the model call.
 *
 * Checks the burst window first: a group that has tripped it is more likely to be looping than
 * over budget, and the message should say so rather than telling them to upgrade.
 */
export async function assertWithinAiCreditCap(params: {
    groupId?: string | null
    firmId?: string | null
    feature: AiFeature
}): Promise<void> {
    if (!enforceAiCreditCaps()) return

    let groupId = params.groupId ?? null
    if (!groupId && params.firmId) {
        const firm = await prisma.firm.findUnique({
            where: { id: params.firmId },
            select: { groupId: true },
        })
        groupId = firm?.groupId ?? null
    }
    // No resolvable billing group means no entitlement to check against. Allowing the call matches
    // how recordAiUsage handles the same case, and failing closed here would block AI on any data
    // shape we have not anticipated.
    if (!groupId) {
        logger.warn(`AI credit cap not checked (${params.feature}): no billing group resolved`)
        return
    }

    const cost = CREDIT_WEIGHTS[params.feature]
    const status = await aiCreditStatus(groupId)

    if (status.burstLimit !== null && status.usedThisBurst + cost > status.burstLimit) {
        throw new AiCreditLimitError(
            'Too many AI requests in a short time. This usually clears within a few hours.',
            'burst',
            status.burstLimit,
            status.usedThisBurst,
        )
    }

    if (status.usedThisPeriod + cost > status.allowance) {
        throw new AiCreditLimitError(
            `You have used your ${status.allowance} AI credits for this billing period. Upgrade your plan for more.`,
            'period',
            status.allowance,
            status.usedThisPeriod,
        )
    }
}

