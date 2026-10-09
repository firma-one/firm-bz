import { describe, it, expect } from 'vitest'
import { buildFilesSuggestions, MAX_FILE_SUGGESTIONS } from './files-suggestions'
import type { FileNode } from './files-agent/analyze'

let seq = 0
const file = (name: string, parentId: string | null = 'root'): FileNode => {
    seq += 1
    return { externalId: `f${seq}`, fileName: name, isFolder: false, parentId }
}
const folder = (name: string, id: string, parentId: string | null = 'root'): FileNode =>
    ({ externalId: id, fileName: name, isFolder: true, parentId })

const tidy = [
    folder('Deliverables', 'd1'),
    file('01-Scope-Note.docx', 'd1'), file('02-Client-Brief.docx', 'd1'),
    file('03-Market-Data.xlsx', 'd1'), file('04-Interview-Notes.docx', 'd1'),
]

describe('buildFilesSuggestions', () => {
    it('offers nothing for an engagement with no files', () => {
        expect(buildFilesSuggestions([])).toEqual([])
    })

    /** The point of the whole module: file questions, not engagement-status ones. */
    it('asks about files, not deliverable status', () => {
        const out = buildFilesSuggestions(tidy, 'root')
        expect(out.length).toBeGreaterThan(0)
        for (const q of out) {
            expect(q).not.toMatch(/overdue|health score|unassigned|this week/i)
        }
    })

    it('leads with duplicates when there are some', () => {
        const out = buildFilesSuggestions([
            ...tidy, file('Scope Note.docx', 'd1'), file('scope-note.docx', 'd1'),
        ], 'root')
        expect(out[0]).toMatch(/duplicate/i)
    })

    it('asks about naming when a convention is broken', () => {
        const out = buildFilesSuggestions([...tidy, file('messy name here.docx', 'd1')], 'root')
        expect(out.some((q) => /naming convention/i.test(q))).toBe(true)
    })

    it('asks about loose files when some sit outside a folder', () => {
        const out = buildFilesSuggestions([...tidy, file('stray.docx', 'root')], 'root')
        expect(out.some((q) => /outside a folder/i.test(q))).toBe(true)
    })

    /**
     * A chip offering to find duplicates where there are none costs a credit to answer "there
     * are none", and teaches the user the chips are decoration.
     */
    it('does not offer a finding that is not present', () => {
        const out = buildFilesSuggestions(tidy, 'root')
        expect(out.some((q) => /duplicate/i.test(q))).toBe(false)
    })

    it('still offers file questions when the tree is tidy', () => {
        const out = buildFilesSuggestions(tidy, 'root')
        expect(out.length).toBeGreaterThan(0)
    })

    /**
     * The regression this guards: the panel reused the Overview chip builder and offered
     * "Summarize where this engagement stands" on a page showing a file tree. Every prompt here
     * must be about the things this panel can see — deliverables, folders, files, due dates,
     * naming and comments.
     */
    it('asks about the file tree, not engagement status', () => {
        const out = buildFilesSuggestions(tidy, 'root')
        const subject = /deliverable|folder|file|document|due date|naming|comment|added/i
        for (const q of out) {
            expect(q, q).toMatch(subject)
        }
    })

    describe('deliverables without a due date', () => {
        const deliverable = (name: string, id: string, docId: string, dueDate?: Date): FileNode =>
            ({ externalId: id, fileName: name, isFolder: true, parentId: 'root', docId, dueDate })

        it('asks about them when some are undated', () => {
            const out = buildFilesSuggestions([
                deliverable('Market Report', 'd1', 'QSR-9'),
                ...tidy,
            ], 'root')
            expect(out.some((q) => /deliverables? ha(s|ve) no due date/i.test(q))).toBe(true)
        })

        it('uses the singular for one', () => {
            const out = buildFilesSuggestions([deliverable('Market Report', 'd1', 'QSR-9')], 'root')
            expect(out.some((q) => /Which deliverable has no due date/i.test(q))).toBe(true)
        })

        /** Asking it where every deliverable is dated costs a credit to be told "none". */
        it('stays silent when every deliverable is dated', () => {
            const out = buildFilesSuggestions([
                deliverable('Market Report', 'd1', 'QSR-9', new Date('2026-11-01')),
                deliverable('Launch Kit', 'd2', 'QSR-31', new Date('2026-12-01')),
            ], 'root')
            expect(out.some((q) => /no due date/i.test(q))).toBe(false)
        })

        /** A plain folder is not a deliverable — only ones carrying a DOC-ID count. */
        it('ignores folders that are not deliverables', () => {
            const plain: FileNode = {
                externalId: 'p1', fileName: 'Internal', isFolder: true, parentId: 'root',
            }
            const out = buildFilesSuggestions([plain, ...tidy], 'root')
            expect(out.some((q) => /no due date/i.test(q))).toBe(false)
        })
    })

    it('covers due dates and comments when nothing is wrong with the tree', () => {
        const out = buildFilesSuggestions(tidy, 'root').join(' | ')
        expect(out).toMatch(/due/i)
        expect(out).toMatch(/comment/i)
    })

    it('fits the chip row', () => {
        const messy = [
            ...tidy, file('Scope Note.docx', 'd1'), file('scope-note.docx', 'd1'),
            file('messy name.docx', 'd1'), file('stray.docx', 'root'),
        ]
        expect(buildFilesSuggestions(messy, 'root').length).toBeLessThanOrEqual(MAX_FILE_SUGGESTIONS)
    })

    it('drops questions already asked', () => {
        const first = buildFilesSuggestions(tidy, 'root')
        const after = buildFilesSuggestions(tidy, 'root', new Set([first[0]]))
        expect(after).not.toContain(first[0])
    })

    it('never repeats a question within one set', () => {
        const out = buildFilesSuggestions(tidy, 'root')
        expect(new Set(out).size).toBe(out.length)
    })
})
