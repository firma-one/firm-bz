import { describe, it, expect } from 'vitest'
import { awaitsFirmReply, canBeRemindedOfInternalNote, canWriteInternalNote, SHARED_COMMENTS, visibleCommentsWhere } from './internal-notes'

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

describe('awaitsFirmReply', () => {
    const roles: Record<string, string> = { lead: 'eng_admin', ana: 'eng_member', dana: 'eng_viewer', carl: 'eng_ext_collaborator' }
    const roleOf = (id: string) => roles[id]
    const c = (authorUserId: string | null, isInternal = false) => ({ authorUserId, isInternal })

    it('awaits the firm when a Reviewer or Limited Access contributor wrote the latest shared comment', () => {
        expect(awaitsFirmReply([c('lead'), c('dana')], roleOf)).toBe(true)
        expect(awaitsFirmReply([c('lead'), c('carl')], roleOf)).toBe(true)
    })

    it('does not once the firm has replied', () => {
        expect(awaitsFirmReply([c('dana'), c('ana')], roleOf)).toBe(false)
    })

    it('reads past an internal note, which is not a reply', () => {
        expect(awaitsFirmReply([c('dana'), c('ana', true)], roleOf)).toBe(true)
        expect(awaitsFirmReply([c('dana'), c('ana'), c('lead', true)], roleOf)).toBe(false)
    })

    it('awaits nothing in an empty thread, or from someone no longer on the engagement', () => {
        expect(awaitsFirmReply([], roleOf)).toBe(false)
        expect(awaitsFirmReply([c('gone')], roleOf)).toBe(false)
        expect(awaitsFirmReply([c(null)], roleOf)).toBe(false)
    })
})
