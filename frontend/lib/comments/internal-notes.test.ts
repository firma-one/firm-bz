import { describe, it, expect } from 'vitest'
import { canBeRemindedOfInternalNote, canWriteInternalNote, SHARED_COMMENTS, visibleCommentsWhere } from './internal-notes'

describe('internal notes', () => {
    it('hides them from external collaborators and viewers, and only from them', () => {
        expect(visibleCommentsWhere('eng_ext_collaborator')).toEqual({ isInternal: false })
        expect(visibleCommentsWhere('eng_viewer')).toEqual({ isInternal: false })
        expect(visibleCommentsWhere('eng_admin')).toEqual({})
        expect(visibleCommentsWhere('eng_member')).toEqual({})
    })

    it('lets only the firm write one, or be reminded of one', () => {
        for (const check of [canWriteInternalNote, canBeRemindedOfInternalNote]) {
            expect(check('eng_admin')).toBe(true)
            expect(check('eng_member')).toBe(true)
            expect(check('eng_ext_collaborator')).toBe(false)
            expect(check('eng_viewer')).toBe(false)
            expect(check(null)).toBe(false)
        }
    })

    it('decides who awaits a reply from the shared comments alone', () => {
        expect(SHARED_COMMENTS).toEqual({ isInternal: false })
    })
})
