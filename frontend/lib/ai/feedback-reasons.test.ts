import { describe, it, expect } from 'vitest'
import { FEEDBACK_REASONS, isValidReason } from './feedback-reasons'

describe('feedback reasons', () => {
    it('accepts every listed value', () => {
        for (const r of FEEDBACK_REASONS) expect(isValidReason(r.value), r.value).toBe(true)
    })

    it('rejects anything else', () => {
        for (const bad of ['', 'made-up', 'INACCURATE', null, undefined, 42, {}]) {
            expect(isValidReason(bad), String(bad)).toBe(false)
        }
    })

    /**
     * A closed list, not free text. A comment box would become a second store of client data —
     * people paste the answer they are complaining about — and the category is all that is needed
     * to tell which prompt to fix.
     */
    it('stays a small closed set with human labels', () => {
        expect(FEEDBACK_REASONS.length).toBeLessThanOrEqual(6)
        for (const r of FEEDBACK_REASONS) {
            expect(r.label.length).toBeGreaterThan(0)
            expect(r.value).toMatch(/^[a-z_]+$/)
        }
    })

    /** 'other' is the escape hatch that keeps the list short without forcing a wrong category. */
    it('includes a catch-all', () => {
        expect(FEEDBACK_REASONS.some((r) => r.value === 'other')).toBe(true)
    })
})
