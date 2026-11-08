import { describe, it, expect } from 'vitest'
import { describeNotDone, describeOutcome, outcomeKind } from './partial-outcome'

// A copy, an import or a ZIP that only partly worked says what was done, out of how many, and what wasn't, with why.

describe('describeOutcome', () => {
    it('says X of Y, where, and what was not done with its reason', () => {
        expect(describeOutcome({
            done: 12, total: 15, verb: 'Copied', noun: 'file', where: 'to Acme Audit', notDoneLabel: 'Not copied',
            notDone: [
                { name: 'Budget.xlsx', reason: 'Google Drive has this locked.' },
                { name: 'Q3.pdf', reason: 'Google Drive has this locked.' },
                { name: 'Notes.docx' },
            ],
        })).toBe('Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx, Q3.pdf · Google Drive has this locked. Notes.docx.')
    })

    it('reads as plain success when everything went', () => {
        expect(describeOutcome({ done: 1, total: 1, verb: 'Imported', noun: 'file', where: 'from Google Drive', notDone: [], notDoneLabel: 'Not imported' }))
            .toBe('Imported 1 file from Google Drive.')
    })
})

describe('describeNotDone', () => {
    it('cuts a long list short', () => {
        const items = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, reason: 'Refused.' }))
        expect(describeNotDone(items)).toBe('a, b, c and 2 more · Refused.')
    })
})

describe('outcomeKind', () => {
    it('calls nothing done an error, not a success', () => {
        expect(outcomeKind(0, 5)).toBe('failed')
        expect(outcomeKind(2, 5)).toBe('partial')
        expect(outcomeKind(5, 5)).toBe('success')
        expect(outcomeKind(0, 0)).toBe('success')
    })
})
