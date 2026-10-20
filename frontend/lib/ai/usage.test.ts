import { describe, it, expect } from 'vitest'
import { CREDIT_WEIGHTS, creditPeriod, creditPeriodStart, creditWindowStart } from './usage'

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

describe('creditPeriod', () => {
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const at = (iso: string) => new Date(iso)

    it('is the month before the period end on a monthly plan', () => {
        const p = creditPeriod(at('2026-10-24T09:30:00Z'), at('2026-10-02T12:00:00Z'))
        expect(day(p.start)).toBe('2026-09-24')
        expect(day(p.end)).toBe('2026-10-24')
        // The billing time of day carries over, so the window lines up with the renewal instant.
        expect(p.start.toISOString()).toBe('2026-09-24T09:30:00.000Z')
    })

    describe('on an annual plan', () => {
        // Renews 2027-03-15, so the year runs from 2026-03-15 and every month starts on the 15th.
        const END = at('2027-03-15T00:00:00Z')

        it('counts the first month of the year, not the last', () => {
            // The bug this replaced: stepping back one month from a year-away end put the window
            // start in the future, so nothing counted and the cap never bound for 11 months.
            const p = creditPeriod(END, at('2026-03-20T00:00:00Z'))
            expect(day(p.start)).toBe('2026-03-15')
            expect(day(p.end)).toBe('2026-04-15')
        })

        it('counts the current month in the middle of the year', () => {
            const p = creditPeriod(END, at('2026-10-02T00:00:00Z'))
            expect(day(p.start)).toBe('2026-09-15')
            expect(day(p.end)).toBe('2026-10-15')
        })

        it('counts the final month up to the renewal', () => {
            const p = creditPeriod(END, at('2027-03-14T23:59:00Z'))
            expect(day(p.start)).toBe('2027-02-15')
            expect(day(p.end)).toBe('2027-03-15')
        })

        it('starts a new month exactly on the billing day', () => {
            const p = creditPeriod(END, at('2026-10-15T00:00:00Z'))
            expect(day(p.start)).toBe('2026-10-15')
            expect(day(p.end)).toBe('2026-11-15')
        })
    })

    it('clamps a billing day of the 31st to short months without drifting', () => {
        const END = at('2027-01-31T00:00:00Z')
        const feb = creditPeriod(END, at('2026-03-10T00:00:00Z'))
        expect(day(feb.start)).toBe('2026-02-28')
        expect(day(feb.end)).toBe('2026-03-31')
        // Back to the 31st after February, not stuck on the 28th.
        const mar = creditPeriod(END, at('2026-04-10T00:00:00Z'))
        expect(day(mar.start)).toBe('2026-03-31')
        expect(day(mar.end)).toBe('2026-04-30')
        // Leap years get the 29th.
        expect(day(creditPeriod(at('2028-03-31T00:00:00Z'), at('2028-03-01T00:00:00Z')).start)).toBe('2028-02-29')
    })

    it('rolls forward when the period end has passed and the renewal has not synced yet', () => {
        // A late webhook must not leave the credits spent: the next month still starts on time.
        const p = creditPeriod(at('2026-09-24T00:00:00Z'), at('2026-10-30T00:00:00Z'))
        expect(day(p.start)).toBe('2026-10-24')
        expect(day(p.end)).toBe('2026-11-24')
    })

    it('uses the calendar month with no subscription', () => {
        const p = creditPeriod(null, NOW)
        expect([p.start.getFullYear(), p.start.getMonth(), p.start.getDate()]).toEqual([2026, 8, 1])
        expect([p.end.getFullYear(), p.end.getMonth(), p.end.getDate()]).toEqual([2026, 9, 1])
    })

    it('always contains now', () => {
        const END = at('2027-05-31T18:45:00Z')
        for (let t = at('2026-05-01T00:00:00Z').getTime(); t < END.getTime(); t += 3 * 24 * 60 * 60 * 1000 + 3_600_000) {
            const now = new Date(t)
            const p = creditPeriod(END, now)
            expect(p.start.getTime()).toBeLessThanOrEqual(t)
            expect(p.end.getTime()).toBeGreaterThan(t)
        }
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
