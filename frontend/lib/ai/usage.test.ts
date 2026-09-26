import { describe, it, expect } from 'vitest'
import { CREDIT_WEIGHTS, creditPeriodStart, creditWindowStart } from './usage'

const NOW = new Date('2026-09-26T12:00:00Z')

describe('credit weights', () => {
    it('charges a search less than a generated answer', () => {
        // Search is the highest-frequency action and genuinely cheaper; the rest are one credit
        // so the unit stays legible ("one credit = one AI action").
        expect(CREDIT_WEIGHTS.searchInterpret).toBeLessThan(CREDIT_WEIGHTS.chat)
        expect(CREDIT_WEIGHTS.brief).toBe(CREDIT_WEIGHTS.summary)
        expect(CREDIT_WEIGHTS.summary).toBe(CREDIT_WEIGHTS.chat)
    })
})

describe('creditPeriodStart', () => {
    it('steps back one calendar month from the period end', () => {
        // Calendar months, not 30 days, so the window lines up with the invoice being read.
        expect(creditPeriodStart(new Date('2026-10-24T00:00:00Z'), NOW).toISOString().slice(0, 10))
            .toBe('2026-09-24')
    })

    it('falls back to the start of the calendar month with no subscription', () => {
        // Free plan: there is no billing period to align to, so the month is the honest default.
        const start = creditPeriodStart(null, NOW)
        expect(start.getFullYear()).toBe(2026)
        expect(start.getMonth()).toBe(8)
        expect(start.getDate()).toBe(1)
    })
})

describe('creditWindowStart', () => {
    it.each([
        ['sixHours', 6 * 60 * 60 * 1000],
        ['day', 24 * 60 * 60 * 1000],
        ['week', 7 * 24 * 60 * 60 * 1000],
    ] as const)('rolls %s back from now', (window, ms) => {
        // Rolling, not calendar-bucketed: a calendar-day limit resets at midnight, so a burst at
        // 23:59 plus another at 00:01 would pass twice the intended rate.
        expect(creditWindowStart(window, null, NOW).getTime()).toBe(NOW.getTime() - ms)
    })

    it('uses the billing period for the period window', () => {
        expect(creditWindowStart('period', new Date('2026-10-24T00:00:00Z'), NOW).toISOString().slice(0, 10))
            .toBe('2026-09-24')
    })
})
