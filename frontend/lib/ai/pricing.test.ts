import { describe, it, expect } from 'vitest'
import { CREDIT_UNIT_MICROS, costMicrosOf, creditsForCost, priceOf, MODEL_PRICES } from './pricing'

/** Credits follow tokens (.claude/plans/ai-metering-by-tokens.md): cost ÷ 0.25¢, rounded up, at least 1. */
describe('costMicrosOf', () => {
    it('prices Haiku 5.5 at $0.10 / $0.50 per million tokens', () => {
        // 10,000 in, 2,000 out: 1,000 + 1,000 micro-dollars.
        expect(costMicrosOf('claude-haiku-5-5', { inputTokens: 10_000, outputTokens: 2_000 })).toBe(2_000)
    })

    it('prices cache reads at a tenth of input and cache writes at 1.25×', () => {
        expect(costMicrosOf('claude-haiku-5-5', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 10_000 })).toBe(100)
        expect(costMicrosOf('claude-haiku-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 10_000 })).toBe(1_250)
    })

    it('bills a prompt over 100K tokens at the long-context rates', () => {
        expect(costMicrosOf('claude-haiku-5-5', { inputTokens: 100_001, outputTokens: 0 })).toBe(Math.ceil(100_001 * 0.5))
    })

    it('prices an unlisted model as the dearest listed, so a forgotten model overcharges rather than gives away', () => {
        const dearest = Math.max(...Object.values(MODEL_PRICES).map((p) => p.output))
        expect(priceOf('claude-unknown-9').output).toBe(dearest)
    })
})

describe('creditsForCost', () => {
    it('is nothing when nothing was spent (a call the API turned away)', () => {
        expect(creditsForCost(0)).toBe(0)
    })

    it('is at least one credit for any spend, and rounds up', () => {
        expect(creditsForCost(1)).toBe(1)
        expect(creditsForCost(CREDIT_UNIT_MICROS)).toBe(1)
        expect(creditsForCost(CREDIT_UNIT_MICROS + 1)).toBe(2)
    })

    it('keeps typical answers at one credit and a long memo read at a few', () => {
        // From the local ledger, 2026-11-19: a chat answer ~6,500 in / 900 out; a memo read ~21,500 in / 8,400 out.
        expect(creditsForCost(costMicrosOf('claude-haiku-5-5', { inputTokens: 6_550, outputTokens: 914 }))).toBe(1)
        expect(creditsForCost(costMicrosOf('claude-haiku-5-5', { inputTokens: 21_542, outputTokens: 8_392 }))).toBe(3)
    })
})
