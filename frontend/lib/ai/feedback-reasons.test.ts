import { describe, it, expect } from 'vitest'
import {
    POSITIVE_REASONS,
    NEGATIVE_REASONS,
    REASON_LABELS,
    reasonsFor,
    isValidReason,
} from './feedback-reasons'

describe('feedback reasons', () => {
    it('accepts every listed value against its own sign', () => {
        for (const r of POSITIVE_REASONS) expect(isValidReason(r.value, true), r.value).toBe(true)
        for (const r of NEGATIVE_REASONS) expect(isValidReason(r.value, false), r.value).toBe(true)
    })

    it('rejects anything else', () => {
        for (const bad of ['', 'made-up', 'INACCURATE', null, undefined, 42, {}]) {
            expect(isValidReason(bad, true), String(bad)).toBe(false)
            expect(isValidReason(bad, false), String(bad)).toBe(false)
        }
    })

    /**
     * Both vocabularies share one `reason` column, so the sign is the only thing separating them.
     * Without this check a client could record 'inaccurate' against a thumbs-up, which reads as a
     * contradiction in the dashboard and corrupts the per-reason counts.
     */
    it('refuses a chip given with the wrong sign', () => {
        expect(isValidReason('inaccurate', true)).toBe(false)
        expect(isValidReason('actionable', false)).toBe(false)
    })

    /** The one value both lists share, so it must validate either way. */
    it("accepts 'other' for both signs", () => {
        expect(isValidReason('other', true)).toBe(true)
        expect(isValidReason('other', false)).toBe(true)
    })

    it('offers the right list for each sign', () => {
        expect(reasonsFor(true)).toBe(POSITIVE_REASONS)
        expect(reasonsFor(false)).toBe(NEGATIVE_REASONS)
    })

    /**
     * Single-select: the picker takes one chip, so each list has to stay short enough to scan in a
     * narrow column and every value needs a label to render.
     */
    it('stays a small closed set with human labels', () => {
        for (const list of [POSITIVE_REASONS, NEGATIVE_REASONS]) {
            expect(list.length).toBeLessThanOrEqual(6)
            for (const r of list) {
                expect(r.label.length).toBeGreaterThan(0)
                expect(r.value).toMatch(/^[a-z_]+$/)
            }
        }
    })

    /**
     * `other` measures the vocabulary rather than the answer: if its share climbs in production,
     * these options no longer cover what users feel. It is last so it does not absorb picks that
     * belong on a real category.
     */
    it('ends each list with a catch-all', () => {
        expect(POSITIVE_REASONS[POSITIVE_REASONS.length - 1].value).toBe('other')
        expect(NEGATIVE_REASONS[NEGATIVE_REASONS.length - 1].value).toBe('other')
    })

    /** The dashboard renders stored rows by value, so every value across both lists needs a label. */
    it('labels every value from both lists', () => {
        for (const r of [...POSITIVE_REASONS, ...NEGATIVE_REASONS]) {
            expect(REASON_LABELS[r.value], r.value).toBeTruthy()
        }
    })
})
