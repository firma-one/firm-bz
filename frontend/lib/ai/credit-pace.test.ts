import { describe, it, expect } from 'vitest'
import { creditPace, PACE_GAP_POINTS } from './credit-pace'

/** A clean 30-day period so day numbers map directly onto elapsed percentages. */
const START = new Date('2026-10-01T00:00:00Z')
const END = new Date('2026-10-31T00:00:00Z')
const day = (n: number) => new Date(START.getTime() + (n - 1) * 86_400_000)

const pace = (used: number, onDay: number, allowance = 100) =>
    creditPace({ allowance, used, periodStart: START, periodEnd: END, now: day(onDay) })

describe('creditPace', () => {
    /**
     * The case that set the threshold. Half the allowance a third of the way in projects a run-out
     * around day 20, leaving ten days dark — a plain "50% used" rule cannot see this, because the
     * same number on day 25 is perfectly healthy.
     */
    it('flags half the allowance spent by day 10 of 30', () => {
        const p = pace(50, 10)
        expect(p.usedPct).toBe(50)
        expect(p.elapsedPct).toBe(30)
        expect(p.aheadOfPace).toBe(true)
    })

    it('stays quiet at the same 50% late in the period', () => {
        expect(pace(50, 25).aheadOfPace).toBe(false)
    })

    it('stays quiet when consumption tracks the period', () => {
        expect(pace(33, 11).aheadOfPace).toBe(false)
        expect(pace(66, 21).aheadOfPace).toBe(false)
    })

    it('needs the full gap, not merely being ahead', () => {
        // Ten points ahead: lumpy, not a trajectory.
        expect(pace(41, 11).gapPoints).toBeLessThan(PACE_GAP_POINTS)
        expect(pace(41, 11).aheadOfPace).toBe(false)
    })

    /** Early on the ratio is unstable — one brief on day one is enormously "ahead" of ~3%. */
    it('reports nothing in the first days of a period', () => {
        expect(pace(40, 2).aheadOfPace).toBe(false)
    })

    /** On a small allowance a couple of credits clear the gap on their own. */
    it('ignores a handful of credits on a small allowance', () => {
        expect(creditPace({
            allowance: 25, used: 4, periodStart: START, periodEnd: END, now: day(5),
        }).aheadOfPace).toBe(false)
    })

    /** Past the cap the period limit has already fired; a pace warning would be redundant. */
    it('stops warning once the allowance is spent', () => {
        expect(pace(100, 15).aheadOfPace).toBe(false)
        expect(pace(120, 15).aheadOfPace).toBe(false)
    })

    describe('projected exhaustion', () => {
        it('projects the run-out date from the current rate', () => {
            // 50% spent in ~31% of the period lasts ~62% of it: a little past day 19.
            const p = pace(50, 10)
            expect(p.projectedExhaustion).not.toBeNull()
            expect(p.projectedExhaustion!.getUTCDate()).toBe(19)
        })

        /** Not a warning — a healthy month, where the allowance outlasts the period. */
        it('is null when the allowance will outlast the period', () => {
            expect(pace(20, 15).projectedExhaustion).toBeNull()
        })

        it('is null when nothing has been spent', () => {
            expect(pace(0, 10).projectedExhaustion).toBeNull()
        })
    })

    describe('unusable inputs', () => {
        /** A malformed period must not manufacture a warning out of arithmetic. */
        it('reports on-pace for an inverted period', () => {
            expect(creditPace({
                allowance: 100, used: 90, periodStart: END, periodEnd: START,
            }).aheadOfPace).toBe(false)
        })

        /** Unconfigured entitlements read as Infinity; there is no share of infinity to warn about. */
        it('reports on-pace for an unresolved allowance', () => {
            expect(creditPace({
                allowance: Infinity, used: 500, periodStart: START, periodEnd: END, now: day(10),
            }).aheadOfPace).toBe(false)
        })

        it('reports on-pace for a zero allowance', () => {
            expect(pace(10, 10, 0).aheadOfPace).toBe(false)
        })
    })
})
