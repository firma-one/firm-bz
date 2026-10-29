import { describe, it, expect } from 'vitest'
import { deriveDeliverableStage } from './deliverable-derivation'

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
