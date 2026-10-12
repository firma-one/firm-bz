import { describe, it, expect } from 'vitest'
import {
    MAX_AGENT_TURNS, CREDITS_PER_TURN,
    estimateRunTurns, estimateRunCredits, canAffordRun, RunBudget,
} from './budget'

describe('estimateRunTurns', () => {
    it('scales with the size of the tree', () => {
        expect(estimateRunTurns(10)).toBeLessThan(estimateRunTurns(300))
        expect(estimateRunTurns(300)).toBeLessThan(estimateRunTurns(5000))
    })

    /** The estimate is also the ceiling the user consented to, so it must never exceed the cap. */
    it('never exceeds the hard cap', () => {
        for (const n of [0, 50, 500, 5_000, 100_000]) {
            expect(estimateRunTurns(n)).toBeLessThanOrEqual(MAX_AGENT_TURNS)
        }
    })

    it('always needs at least one turn', () => {
        expect(estimateRunTurns(0)).toBeGreaterThan(0)
    })
})

describe('canAffordRun', () => {
    /**
     * The whole run is checked, not the next turn. Starting a run that dies halfway spends the
     * user's credits and returns nothing, which is worse than declining up front.
     */
    it('refuses a run the balance cannot finish', () => {
        const verdict = canAffordRun(300, { remaining: 1, enforced: true })
        expect(verdict.allowed).toBe(false)
        expect(verdict.reason).toContain('AI credits')
    })

    it('allows a run the balance covers', () => {
        expect(canAffordRun(300, { remaining: 50, enforced: true }).allowed).toBe(true)
    })

    it('allows exactly enough', () => {
        const estimate = estimateRunCredits(300)
        expect(canAffordRun(300, { remaining: estimate, enforced: true }).allowed).toBe(true)
    })

    /** Matches the credit cap's deliberate fail-open: unknown entitlement must not block. */
    it('allows when no entitlement resolved', () => {
        expect(canAffordRun(5000, { remaining: null, enforced: true }).allowed).toBe(true)
    })

    it('allows when enforcement is off', () => {
        expect(canAffordRun(5000, { remaining: 0, enforced: false }).allowed).toBe(true)
    })

    it('reports the estimate either way, so the UI can show it', () => {
        expect(canAffordRun(300, { remaining: 0, enforced: true }).estimate)
            .toBe(estimateRunCredits(300))
    })
})

describe('RunBudget', () => {
    it('permits turns up to the cap, then stops', () => {
        const budget = new RunBudget(3)
        for (let i = 0; i < 3; i += 1) {
            expect(budget.canContinue()).toBe(true)
            budget.recordTurn()
        }
        expect(budget.canContinue()).toBe(false)
        expect(budget.exhausted).toBe(true)
    })

    it('tracks credits spent', () => {
        const budget = new RunBudget()
        budget.recordTurn()
        budget.recordTurn()
        expect(budget.creditsSpent).toBe(2 * CREDITS_PER_TURN)
    })

    /** A run that finished early is not exhausted — the distinction drives the UI message. */
    it('separates finishing early from running out', () => {
        const budget = new RunBudget(5)
        budget.recordTurn()
        expect(budget.exhausted).toBe(false)
        expect(budget.canContinue()).toBe(true)
    })
})
