import { describe, it, expect } from 'vitest'
import { deliverableProgress, deriveDeliverableStage } from './deliverable-derivation'

// A deliverable's stage follows its documents on the Board (.claude/plans/deliverable-stages-blocked.md, section 2).

describe('deriveDeliverableStage', () => {
    it('1. is To do with no documents on the Board', () => {
        expect(deriveDeliverableStage([])).toBe('to_do')
        expect(deriveDeliverableStage(['not_started', 'not_started'])).toBe('to_do')
    })

    it('2. is In progress while any document is', () => {
        expect(deriveDeliverableStage(['approved', 'in_progress', 'in_review'])).toBe('in_progress')
    })

    it('3. is Approved once every document is', () => {
        expect(deriveDeliverableStage(['approved', 'approved'])).toBe('approved')
    })

    it('4. is In review once every document is', () => {
        expect(deriveDeliverableStage(['in_review', 'in_review'])).toBe('in_review')
    })

    it('5. is To do while every document is', () => {
        expect(deriveDeliverableStage(['to_do', 'to_do'])).toBe('to_do')
    })

    it('6. is In progress for any other mix', () => {
        expect(deriveDeliverableStage(['to_do', 'approved'])).toBe('in_progress')
        expect(deriveDeliverableStage(['in_review', 'approved'])).toBe('in_progress')
        expect(deriveDeliverableStage(['to_do', 'in_review'])).toBe('in_progress')
    })

    it('leaves Not started documents out', () => {
        expect(deriveDeliverableStage(['approved', 'not_started'])).toBe('approved')
        expect(deriveDeliverableStage(['in_review', 'not_started', 'in_review'])).toBe('in_review')
    })
})

describe('deliverableProgress', () => {
    const row = (id: string, status: string, settings: object = {}, extra: object = {}) => ({
        id, externalId: `ext-${id}`, parentId: 'ext-D', isFolder: false, fileName: id, docId: id.toUpperCase(),
        settings: { activity: { status }, ...settings }, ...extra,
    })
    const PRIVATE = { lock: { type: 'private' } }
    const BLOCKED = { blocked: { reason: 'client', at: 'x', by: 'u' } }

    it('counts the documents on the Board', () => {
        const rows = [row('a', 'approved'), row('b', 'in_progress'), row('c', 'not_started')]
        expect(deliverableProgress(rows, true)).toMatchObject({ total: 2, approved: 1 })
    })

    it.each([[true], [false]])('leaves internal only documents out, for anyone (firm: %s)', (isFirm) => {
        const rows = [
            row('a', 'approved'),
            row('b', 'in_progress', PRIVATE),
            row('fo', 'not_started', PRIVATE, { isFolder: true }),
            row('c', 'in_review', {}, { parentId: 'ext-fo' }),
        ]
        expect(deliverableProgress(rows, isFirm)).toMatchObject({ total: 1, approved: 1 })
    })

    it('tells only the firm what is blocked, an internal only document included', () => {
        const rows = [row('a', 'in_progress', BLOCKED), row('b', 'in_progress', { ...PRIVATE, ...BLOCKED })]
        expect(deliverableProgress(rows, true).blocked.map((b) => b.documentId)).toEqual(['a', 'b'])
        expect(deliverableProgress(rows, false).blocked).toEqual([])
    })
})
