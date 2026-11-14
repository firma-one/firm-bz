import { describe, it, expect } from 'vitest'
import {
    alreadyAppliedIds,
    appliedTargetOf,
    boldSpeakers,
    memoFileName,
    memoFileTitle,
    memoMarkdown,
    memoMetaLine,
    parseMemoSettings,
    splitMemoMarkdown,
    withoutMemoTree,
    type MemoAppliedAction,
} from './memo-shared'
import { analyzeFiles, type FileNode } from '@/lib/ai/files-agent/analyze'
import type { NotesProposal } from '@/lib/ai/notes-proposals'

describe('memoFileName', () => {
    it('is the ISO day, then the title\'s words joined by hyphens', () => {
        expect(memoFileName('2026-11-12', 'Call notes', [])).toBe('2026-11-12-Call-notes.md')
        expect(memoFileName('2026-11-12', '  Q4 review   with Dana ', [])).toBe('2026-11-12-Q4-review-with-Dana.md')
    })

    it('leaves out what either storage refuses in a name', () => {
        expect(memoFileTitle('Kickoff: scope / timing? "draft" <v2> #1 50% | done*')).toBe('Kickoff-scope-timing-draft-v2-1-50-done')
        expect(memoFileTitle('...Notes...')).toBe('Notes')
        expect(memoFileTitle('???')).toBe('Memo')
    })

    it('keeps the words people use, apostrophes and ampersands included', () => {
        expect(memoFileTitle("Dana's Q&A call")).toBe("Dana's-Q&A-call")
    })

    it('cuts a long title at a word', () => {
        const title = memoFileTitle('Quarterly planning session '.repeat(10))
        expect(title.length).toBeLessThanOrEqual(80)
        expect(title.endsWith('-')).toBe(false)
        expect(title.endsWith('session') || title.endsWith('planning') || title.endsWith('Quarterly')).toBe(true)
    })

    it('takes the first free number when the name is taken, without regard to case', () => {
        expect(memoFileName('2026-11-12', 'Call notes', ['2026-11-12-call-NOTES.md'])).toBe('2026-11-12-Call-notes-2.md')
        expect(memoFileName('2026-11-12', 'Call notes', ['2026-11-12-Call-notes.md', '2026-11-12-Call-notes-2.md', 'other.md']))
            .toBe('2026-11-12-Call-notes-3.md')
        expect(memoFileName('2026-11-13', 'Call notes', ['2026-11-12-Call-notes.md'])).toBe('2026-11-13-Call-notes.md')
    })
})

describe('memoMarkdown', () => {
    it('is a heading, the day and the author, then the notes', () => {
        expect(memoMarkdown({ title: 'Call notes', date: '2026-11-12', authorName: 'Alex Jordan', body: '\n- Chase the 1099-B\n' }))
            .toBe('# Call notes\n\nThursday, November 12, 2026 · Alex Jordan\n\n- Chase the 1099-B\n')
    })

    it('keeps the heading on one line', () => {
        expect(memoMarkdown({ title: 'Call\nnotes', date: '2026-11-12', authorName: 'Alex', body: 'x' }).split('\n')[0]).toBe('# Call notes')
    })
})

describe('memoMetaLine', () => {
    it('says who wrote it and what it is', () => {
        expect(memoMetaLine({ authorFirstName: 'Alex', source: 'notes', durationMinutes: null })).toBe('Alex · notes')
        expect(memoMetaLine({ authorFirstName: 'Sam', source: 'transcript', durationMinutes: 42 })).toBe('Sam · transcript, 42 min')
        expect(memoMetaLine({ authorFirstName: '', source: 'transcript', durationMinutes: null })).toBe('transcript')
    })
})

describe('parseMemoSettings', () => {
    it('reads a memo row, and nothing else', () => {
        expect(parseMemoSettings({ memo: { date: '2026-11-12', title: 'Call notes', authorUserId: 'u1', applied: [{ kind: 'bogus' }] } }))
            .toEqual(expect.objectContaining({ title: 'Call notes', source: 'notes', applied: [] }))
        expect(parseMemoSettings({})).toBeNull()
        expect(parseMemoSettings({ memo: { date: '2026-02-30', title: 'x', authorUserId: 'u1' } })).toBeNull()
        expect(parseMemoSettings({ memoFolder: true })).toBeNull()
    })
})

describe('alreadyAppliedIds', () => {
    const proposals: NotesProposal[] = [
        { kind: 'reminder', id: 'reminder-1', title: 'Chase the brokerage 1099-B', date: '2026-11-16', quote: 'I need to chase the brokerage 1099-B' },
        { kind: 'dueDate', id: 'dueDate-2', deliverableId: 'del-6', docId: 'NPT-6', deliverableName: 'Schedule', currentDate: null, newDate: '2026-11-30', quote: 'needs it before 1 Dec' },
        { kind: 'deliverable', id: 'deliverable-3', name: 'Board Summary', dueDate: null, quote: 'also a board summary' },
    ]
    const applied = (p: NotesProposal, overrides: Partial<MemoAppliedAction> = {}): MemoAppliedAction =>
        ({ ...appliedTargetOf(p)!, label: '', at: '2026-11-12T10:00:00Z', ...overrides })

    it('matches on kind, target and date', () => {
        expect(alreadyAppliedIds(proposals, [applied(proposals[0]), applied(proposals[1])])).toEqual(['reminder-1', 'dueDate-2'])
        expect(alreadyAppliedIds(proposals, [applied(proposals[1], { date: '2026-12-01' })])).toEqual([])
        expect(alreadyAppliedIds(proposals, [applied(proposals[1], { target: 'del-7' })])).toEqual([])
    })

    it('matches a reminder Brio titled differently by the memo line it came from', () => {
        expect(alreadyAppliedIds(proposals, [applied(proposals[0], { target: 'chase 1099-b' })])).toEqual(['reminder-1'])
    })

    it('never marks a new deliverable, which is never applied', () => {
        expect(appliedTargetOf(proposals[2])).toBeNull()
    })
})

describe('withoutMemoTree, for the Files agent and Folder Health', () => {
    const ROOT = 'general'
    const memoFolder = { externalId: 'memos', parentId: ROOT, fileName: 'Internal Memos', isFolder: true, settings: { memoFolder: true, lock: { type: 'private' } } }
    const memos = Array.from({ length: 30 }, (_, i) => ({
        externalId: `memo-${i}`,
        parentId: 'memos',
        fileName: `2026-10-${String((i % 28) + 1).padStart(2, '0')}-Call-notes${i >= 28 ? `-${i - 26}` : ''}.md`,
        isFolder: false,
        settings: { memo: { date: '2026-10-01', title: 'Call notes', authorUserId: 'u1' } },
    }))
    const work = [
        { externalId: 'del', parentId: ROOT, fileName: 'Tax Return', isFolder: true, settings: {} },
        { externalId: 'f1', parentId: 'del', fileName: 'Draft.pdf', isFolder: false, settings: {} },
    ]
    const strayMemo = { externalId: 'stray', parentId: 'del', fileName: '2026-10-01-Call-notes.md', isFolder: false, settings: { memo: { date: '2026-10-01', title: 'Call notes', authorUserId: 'u1' } } }
    const rows = [memoFolder, ...memos, ...work, strayMemo]

    it('leaves out the memos folder, what it holds, and a memo moved elsewhere', () => {
        expect(withoutMemoTree(rows).map((r) => r.externalId)).toEqual(['del', 'f1'])
    })

    it('leaves a tree with no memos as it was', () => {
        expect(withoutMemoTree(work)).toBe(work)
    })

    it('so a review finds nothing to fix in thirty memos in one folder', () => {
        const node = (r: typeof rows[number]): FileNode => ({ externalId: r.externalId, parentId: r.parentId, fileName: r.fileName, isFolder: r.isFolder })
        const flagged = (nodes: FileNode[]) => analyzeFiles(nodes, ROOT).findings.flatMap((f) => f.nodes.map((n) => n.externalId))
        // Without the exclusion the memos folder reads as crowded.
        expect(flagged(rows.map(node)).some((id) => id.startsWith('memo-'))).toBe(true)
        expect(flagged(withoutMemoTree(rows).map(node)).some((id) => id.startsWith('memo') || id === 'stray')).toBe(false)
    })
})

describe('splitMemoMarkdown', () => {
    it('takes apart the heading and byline memoMarkdown wrote', () => {
        const file = memoMarkdown({ title: 'Call with Dana', date: '2026-11-12', authorName: 'Alex Jordan', body: '- Chase the 1099-B\n- Send the K-1s' })
        expect(splitMemoMarkdown(file)).toEqual({
            title: 'Call with Dana',
            byline: 'Thursday, November 12, 2026 · Alex Jordan',
            body: '- Chase the 1099-B\n- Send the K-1s\n',
        })
    })

    it('keeps a heading whose byline was edited away, and shows a file with no heading whole', () => {
        expect(splitMemoMarkdown('# Kickoff\n\nWe agreed the scope.')).toEqual({ title: 'Kickoff', byline: null, body: 'We agreed the scope.' })
        expect(splitMemoMarkdown('Just notes\n# Later heading')).toEqual({ title: null, byline: null, body: 'Just notes\n# Later heading' })
    })

    it('reads Windows line ends and a byte-order mark', () => {
        expect(splitMemoMarkdown('\uFEFF# Notes\r\n\r\nMonday, November 9, 2026\r\n\r\nBody')).toEqual({ title: 'Notes', byline: 'Monday, November 9, 2026', body: 'Body' })
    })
})

describe('boldSpeakers', () => {
    it('bolds the speaker of each turn, as lib/memos/vtt.ts writes them', () => {
        expect(boldSpeakers('Dana Whitfield: We will send the K-1s.\n\nAlex: Great, thanks.'))
            .toBe('**Dana Whitfield:** We will send the K-1s.\n\n**Alex:** Great, thanks.')
        expect(boldSpeakers('José O\u2019Neil: Hola.')).toBe('**José O\u2019Neil:** Hola.')
    })

    it('leaves lists, links and times alone', () => {
        const text = '- Timeline: three weeks\nSee https://example.com\nAt 10:30 we met'
        expect(boldSpeakers(text)).toBe(text)
    })
})

// ── A memo reviewed in one place (§13) ────────────────────────────────────────────────────────

import {
    MEMO_CHANGED_QUOTE,
    anchorQuote,
    appliedStoredIds,
    memoMatchText,
    memoReviewOf,
    quoteFromAnchor,
    resolveMemoReview,
    waitingActionItems,
} from './memo-shared'

describe('a waiting review: quotes kept as places in the memo, never its words', () => {
    const TEXT = '# Call with Dana\n\nDana: I’ll send the  figures by Friday.\n- Need the signed change order — still missing.'
    const FOUND = {
        proposals: [
            { kind: 'reminder', id: 'reminder-1', title: 'Check the figures arrived', date: '2026-11-20', quote: "I'll send the figures by Friday." },
            { kind: 'deliverable', id: 'deliverable-2', name: 'Change order', dueDate: null, quote: 'Need the signed change order - still missing.' },
        ] as NotesProposal[],
        skipped: [{ quote: 'still missing', reason: 'has no date' }],
        dropped: 1,
    }

    it('finds a quote however its quotes, dashes and spaces were written, and gets it back', () => {
        const match = memoMatchText(TEXT)
        const anchor = anchorQuote(match, 'I’ll send the figures by Friday.')!
        expect(anchor).toMatchObject({ at: expect.any(Number), length: 32 })
        expect(quoteFromAnchor(match, anchor)).toBe("I'll send the figures by Friday.")
        expect(anchorQuote(match, 'never said this')).toBeNull()
    })

    it('stores no word of the memo: each quote and skipped line becomes an anchor', () => {
        const review = memoReviewOf(FOUND, TEXT, 'auto', new Date('2026-11-14T10:00:00Z'))
        const stored = JSON.stringify(review)
        expect(stored).not.toContain('figures by Friday')
        expect(stored).not.toContain('signed change order')
        expect(stored).not.toContain('still missing')
        expect(review).toMatchObject({ by: 'auto', dismissed: false, dropped: 1, at: '2026-11-14T10:00:00.000Z' })
        expect(review.proposals[0]).toMatchObject({ kind: 'reminder', title: 'Check the figures arrived', quoteAt: { length: 32 } })
        expect(review.proposals[0]).not.toHaveProperty('quote')
    })

    it('fills the quotes back in from the memo, and says so when the memo has changed since', () => {
        const review = memoReviewOf(FOUND, TEXT, 'auto')
        expect(resolveMemoReview(review, TEXT).proposals.map((p) => p.quote)).toEqual([
            "I'll send the figures by Friday.",
            'Need the signed change order - still missing.',
        ])
        const edited = TEXT.replace('Dana: ', 'Dana said: ')
        const resolved = resolveMemoReview(review, edited)
        expect(resolved.proposals[0].quote).toBe(MEMO_CHANGED_QUOTE)
        // A skipped line the memo no longer has is left out.
        expect(resolved.skipped).toHaveLength(0)
    })

    it('counts what still waits: not dismissed, not applied; a new deliverable counts until dismissed', () => {
        const review = memoReviewOf(FOUND, TEXT, 'auto')
        expect(waitingActionItems({ review, applied: [] })).toBe(2)
        const applied = [{ kind: 'reminder' as const, target: 'check the figures arrived', date: '2026-11-20', quote: '', label: '', at: '' }]
        expect(appliedStoredIds(review, applied)).toEqual(['reminder-1'])
        expect(waitingActionItems({ review, applied })).toBe(1)
        expect(waitingActionItems({ review: { ...review, dismissed: true }, applied: [] })).toBe(0)
        expect(waitingActionItems({ review: null, applied: [] })).toBe(0)
    })

    it('reads a stored review back, and leaves out anything malformed', () => {
        const review = memoReviewOf(FOUND, TEXT, 'person')
        const memo = parseMemoSettings({ memo: { date: '2026-11-14', title: 'Call', authorUserId: 'u1', review: { ...review, proposals: [...review.proposals, { kind: 'reminder', id: 'x' }] } } })!
        expect(memo.review!.by).toBe('person')
        expect(memo.review!.proposals.map((p) => p.id)).toEqual(['reminder-1', 'deliverable-2'])
        expect(parseMemoSettings({ memo: { date: '2026-11-14', title: 'Call', authorUserId: 'u1' } })!.review).toBeNull()
    })
})
