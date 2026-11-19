import { describe, it, expect } from 'vitest'
import { AI_FEATURES, AI_MAX_TOKENS, type AiFeature } from './features'
import { AI_EFFORT, AI_MODEL } from './client'
import { MODEL_PRICES, costMicrosOf } from './pricing'
import { PRICING_PLANS } from '@/config/pricing'

/**
 * Every feature's token cap fits its work (.claude/plans/ai-metering-by-tokens.md, step 4):
 *
 * - Big enough for the thinking. Haiku 5.5 thinks before it writes, and thinking counts toward the
 *   cap: the engagement summary at medium effort and 3,000 tokens spent all of it thinking on a busy
 *   engagement and wrote nothing, every time (2026-11-19).
 * - Small enough that one call can't cost more than a credit earns: the worst case (the cap, all of
 *   it output, after the largest input the feature sends) stays under 15% of what one Standard credit
 *   brings in.
 */

/** Which effort level each feature's call runs at (lib/ai/client.ts AI_EFFORT). */
const EFFORT_OF: Record<AiFeature, keyof typeof AI_EFFORT> = {
    brief: 'brief',
    summary: 'summary',
    chat: 'chat',
    searchInterpret: 'interpret',
    filesAgent: 'filesAgent',
    firmChat: 'chat',
    statusUpdate: 'draft',
    replyDraft: 'draft',
    nudgeDraft: 'draft',
    notesProposals: 'proposals',
    reviewerChat: 'chat',
    dayBrief: 'dayBrief',
    dayBriefRewrite: 'dayBrief',
    raidCheck: 'raid',
    memoRaid: 'raid',
    memoMinutes: 'minutes',
}

/** The least room a cap leaves for thinking plus the answer, by effort. */
const MIN_CAP: Record<'low' | 'medium' | 'high', number> = { low: 1024, medium: 6000, high: 12_000 }

/**
 * The largest input each feature sends, in tokens: generous bounds from the ledger (2026-11-19) and
 * each feature's own trimming. A feature that starts sending more must raise this deliberately.
 */
const MAX_INPUT: Record<AiFeature, number> = {
    brief: 10_000,
    summary: 20_000,
    chat: 40_000,
    searchInterpret: 10_000,
    filesAgent: 60_000,
    firmChat: 40_000,
    statusUpdate: 20_000,
    replyDraft: 20_000,
    nudgeDraft: 10_000,
    notesProposals: 40_000,
    reviewerChat: 20_000,
    dayBrief: 10_000,
    dayBriefRewrite: 10_000,
    raidCheck: 40_000,
    memoRaid: 40_000,
    memoMinutes: 40_000,
}

const standard = PRICING_PLANS.find((p) => p.id === 'Standard')!
/** What one Standard credit brings in, in micro-dollars: the annual price ÷ the allowance. */
const CREDIT_REVENUE_MICROS = (standard.priceBilledAnnually! * 1_000_000) / standard.entitlements!.aiCredits!

describe('token caps', () => {
    it('prices the model every call uses', () => {
        expect(MODEL_PRICES[AI_MODEL]).toBeDefined()
    })

    it.each(AI_FEATURES)('%s leaves room for its thinking', (feature) => {
        const effort = AI_EFFORT[EFFORT_OF[feature]]
        expect(AI_MAX_TOKENS[feature]).toBeGreaterThanOrEqual(MIN_CAP[effort])
    })

    it.each(AI_FEATURES)('%s costs at most 15% of what a credit earns, at its worst', (feature) => {
        const worst = costMicrosOf(AI_MODEL, { inputTokens: MAX_INPUT[feature], outputTokens: AI_MAX_TOKENS[feature] })
        expect(worst).toBeLessThanOrEqual(CREDIT_REVENUE_MICROS * 0.15)
    })
})
