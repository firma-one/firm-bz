import { describe, it, expect } from 'vitest'
import { findMentionQuery, insertMention, mentionedNames, splitMentions } from './mentions'

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
