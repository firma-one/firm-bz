import { describe, it, expect } from 'vitest'
import { findMentionQuery, findTagQuery, insertMention, insertTag, mentionedNames, splitDocTags, splitMentions, taggedDocIds } from './mentions'

describe('findMentionQuery', () => {
    it('finds the query after an @ at the start or after a space', () => {
        expect(findMentionQuery('@dee', 4)).toEqual({ start: 0, query: 'dee' })
        expect(findMentionQuery('ping @an', 8)).toEqual({ start: 5, query: 'an' })
        expect(findMentionQuery('ping @', 6)).toEqual({ start: 5, query: '' })
    })

    it('ignores an @ inside a word, like an email address', () => {
        expect(findMentionQuery('ana@firm', 8)).toBeNull()
    })

    it('stops at a space: the mention is finished', () => {
        expect(findMentionQuery('@dee hello', 10)).toBeNull()
    })
})

describe('insertMention', () => {
    it('replaces the query with the name and a space, caret after it', () => {
        expect(insertMention('ping @de thanks', 5, 8, 'Deepak Shettigar')).toEqual({
            text: 'ping @Deepak Shettigar thanks',
            caret: 23,
        })
    })
})

describe('mentionedNames', () => {
    const names = ['Deepak Shettigar', 'Ana', 'Ana Lopez']
    it('finds names mentioned anywhere, preferring the longest', () => {
        expect(mentionedNames('Thanks @Ana Lopez, and @Deepak Shettigar.', names)).toEqual(['Deepak Shettigar', 'Ana Lopez'])
    })
    it('needs a boundary after the name', () => {
        expect(mentionedNames('@Anabel please', names)).toEqual([])
    })
})

describe('splitMentions', () => {
    it('splits known mentions anywhere in the text', () => {
        expect(splitMentions('Can @Ana check this?', ['Ana'])).toEqual([
            { type: 'text', value: 'Can ' },
            { type: 'mention', value: '@Ana' },
            { type: 'text', value: ' check this?' },
        ])
    })
    it('still reads the old prepended form for unknown names', () => {
        expect(splitMentions('@Ben Smith please review', [])).toEqual([
            { type: 'mention', value: '@Ben Smith' },
            { type: 'text', value: ' ' },
            { type: 'text', value: 'please review' },
        ])
    })
    it('leaves text without mentions alone', () => {
        expect(splitMentions('No mentions here', ['Ana'])).toEqual([{ type: 'text', value: 'No mentions here' }])
    })
})

describe('#-tags for documents', () => {
    it('finds the tag being typed, only after a space or at the start', () => {
        expect(findTagQuery('see #qsr', 8)).toEqual({ start: 4, query: 'qsr' })
        expect(findTagQuery('#', 1)).toEqual({ start: 0, query: '' })
        expect(findTagQuery('issue#4', 7)).toBeNull()
        expect(findTagQuery('see #qsr now', 12)).toBeNull()
    })

    it('inserts the document ID where it was typed', () => {
        expect(insertTag('see #ma and', 4, 7, 'QSR-12')).toEqual({ text: 'see #QSR-12 and', caret: 12 })
    })

    it('splits tags out of text, ignoring look-alikes', () => {
        expect(splitDocTags('Check #QSR-12 and (#QSR2-7), not a#QSR-1 or #qsr-3 or #QSR-12x')).toEqual([
            { type: 'text', value: 'Check ' },
            { type: 'doc', value: '#QSR-12', docId: 'QSR-12' },
            { type: 'text', value: ' and (' },
            { type: 'doc', value: '#QSR2-7', docId: 'QSR2-7' },
            { type: 'text', value: '), not a#QSR-1 or #qsr-3 or #QSR-12x' },
        ])
        expect(taggedDocIds('#QSR-1 then #QSR-2 and #QSR-1 again')).toEqual(['QSR-1', 'QSR-2'])
    })
})
