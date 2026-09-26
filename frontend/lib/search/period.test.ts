import { describe, it, expect } from 'vitest'
import { resolvePeriod } from './period'

// Fixed "now" so bare-quarter defaulting and the year window are deterministic.
const NOW = new Date(2026, 8, 25)
const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('resolvePeriod', () => {
    it('resolves a quarter with an explicit year', () => {
        const r = resolvePeriod('Q1 2026', NOW)!
        expect(r.label).toBe('Q1 2026')
        expect(ymd(r.start)).toBe('2026-01-01')
        expect(ymd(r.end)).toBe('2026-03-31')
    })

    it('defaults a bare quarter to the current year', () => {
        // Regression: a bare "Q2" was rejected, so "playbooks from Q2" sometimes filtered and
        // sometimes did nothing depending on whether the model volunteered the year.
        expect(resolvePeriod('Q2', NOW)!.label).toBe('Q2 2026')
    })

    it('is case insensitive', () => {
        expect(resolvePeriod('q2 2026', NOW)!.label).toBe('Q2 2026')
    })

    it('resolves halves and bare years', () => {
        expect(resolvePeriod('H2 2025', NOW)!.label).toBe('H2 2025')
        expect(ymd(resolvePeriod('H2 2025', NOW)!.start)).toBe('2025-07-01')
        expect(ymd(resolvePeriod('2024', NOW)!.end)).toBe('2024-12-31')
    })

    it('ends a quarter on the last day of its final month', () => {
        // Derived by stepping back from the next period's start, so leap years need no special case.
        expect(ymd(resolvePeriod('Q1 2024', NOW)!.end)).toBe('2024-03-31')
        expect(ymd(resolvePeriod('Q4 2025', NOW)!.end)).toBe('2025-12-31')
    })

    it.each([
        ['Q5 2026', 'quarter out of range'],
        ['Q1 1999', 'before the minimum year'],
        ['Q1 2030', 'beyond one year ahead'],
        ['last spring', 'free text'],
        ['2026-03-01', 'an explicit date'],
        ['20', 'a two-digit year'],
        ['', 'empty'],
    ])('rejects %s (%s)', (token) => {
        // Rejection matters as much as resolution: the model must never be able to widen a search
        // by emitting something the grammar does not understand.
        expect(resolvePeriod(token, NOW)).toBeNull()
    })
})
