import { describe, it, expect } from 'vitest'
import { assetSettingsOf, buildSettingsForDb, documentStage, isOnBoard } from './sharing-settings'

// Not started (.claude/plans/deliverable-stages-blocked.md, section 1): a document's stage before the Board.

describe('documentStage', () => {
    it('reads Not started for a document with no stage', () => {
        expect(documentStage({})).toBe('not_started')
        expect(documentStage(null)).toBe('not_started')
        expect(documentStage({ activity: { status: 'bogus' } })).toBe('not_started')
    })

    it('reads a stored stage, and the old "done" as Approved', () => {
        expect(documentStage({ activity: { status: 'in_review' } })).toBe('in_review')
        expect(documentStage({ activity: { status: 'not_started' } })).toBe('not_started')
        expect(documentStage({ activity: { status: 'done' } })).toBe('approved')
    })
})

describe('isOnBoard', () => {
    it('is To do and beyond', () => {
        expect(isOnBoard('not_started')).toBe(false)
        expect(isOnBoard(null)).toBe(false)
        expect(['to_do', 'in_progress', 'in_review', 'approved'].every((s) => isOnBoard(s as 'to_do'))).toBe(true)
    })
})

describe('buildSettingsForDb and the stage', () => {
    it("writes no stage when the change isn't about one", () => {
        const next = buildSettingsForDb({ description: 'Sizing model' }, { share: { guest: { enabled: true } } as never })
        expect(next).not.toHaveProperty('activity')
    })

    it('keeps a stage already stored', () => {
        const next = buildSettingsForDb({ activity: { status: 'in_review', updatedAt: 'x', orderIndex: 2 } }, { share: { guest: { enabled: true } } as never })
        expect((next.activity as { status: string }).status).toBe('in_review')
    })

    it('writes the stage it is given', () => {
        const next = buildSettingsForDb({}, { activity: { status: 'to_do' } })
        expect((next.activity as { status: string }).status).toBe('to_do')
    })
})

describe('assetSettingsOf and Blocked', () => {
    it('keeps the Blocked flag when sharing is removed', () => {
        const flag = { reason: 'client', at: 'x', by: 'u' }
        expect(assetSettingsOf({ blocked: flag, share: { createdAt: 'x' } })).toEqual({ blocked: flag })
    })
})
