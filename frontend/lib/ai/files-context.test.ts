import { describe, it, expect } from 'vitest'
import { buildFilesContext } from './files-context'
import type { FileNode } from './files-agent/analyze'

const folder = (id: string, name: string, parentId: string | null = null): FileNode =>
    ({ externalId: id, fileName: name, isFolder: true, parentId })
const file = (id: string, name: string, parentId: string | null, docId?: string): FileNode =>
    ({ externalId: id, fileName: name, isFolder: false, parentId, docId })

describe('buildFilesContext', () => {
    it('is empty for an engagement with no files', () => {
        expect(buildFilesContext([])).toBe('')
    })

    /** The failure that prompted this: the chat knew a count but could not name the files. */
    it('names every file, grouped by its folder', () => {
        const out = buildFilesContext([
            folder('d1', 'Deliverables'),
            file('f1', 'Scope Note.docx', 'd1', 'QSR-9'),
            file('f2', 'scope-note.docx', 'd1'),
        ])
        expect(out).toContain('Deliverables:')
        expect(out).toContain('QSR-9 — Scope Note.docx')
        expect(out).toContain('scope-note.docx')
    })

    it('renders the full path for a nested folder', () => {
        const out = buildFilesContext([
            folder('a', 'Deliverables'),
            folder('b', 'Interviews', 'a'),
            file('f1', 'notes.docx', 'b'),
        ])
        expect(out).toContain('Deliverables/Interviews:')
    })

    it('labels files at the engagement root', () => {
        expect(buildFilesContext([file('f1', 'stray.docx', null)])).toContain('(root):')
    })

    describe('deliverables', () => {
        const deliverable = (name: string, id: string, docId: string, dueDate?: Date): FileNode =>
            ({ externalId: id, fileName: name, isFolder: true, parentId: null, docId, dueDate })

        it('lists a deliverable with its due date', () => {
            const out = buildFilesContext([
                deliverable('Market Report', 'd1', 'QSR-9', new Date('2026-11-01')),
            ])
            expect(out).toContain('QSR-9 — Market Report (due 2026-11-01)')
        })

        /**
         * The reason every deliverable is listed rather than only the dated ones: the model
         * cannot name an absence from a list that omits it, and "which deliverables have no due
         * date" is exactly the question a lead asks.
         */
        it('marks a deliverable that has no due date', () => {
            const out = buildFilesContext([deliverable('Market Report', 'd1', 'QSR-9')])
            expect(out).toContain('QSR-9 — Market Report (NO DUE DATE)')
        })

        /** A plain working folder is not a deliverable — only ones carrying a DOC-ID. */
        it('does not list a folder with no DOC-ID as a deliverable', () => {
            const out = buildFilesContext([folder('f1', 'Internal')])
            expect(out).not.toContain('Deliverables:')
        })
    })

    it('states the totals', () => {
        const out = buildFilesContext([folder('d1', 'A'), file('f1', 'x.docx', 'd1')])
        expect(out).toContain('1 file in 1 folder')
    })

    /**
     * An empty folder vanishes from a listing grouped by contents, but "nothing has been put here
     * yet" is a real answer to what is unfinished.
     */
    it('reports folders with no files', () => {
        const out = buildFilesContext([
            folder('d1', 'Deliverables'), folder('d2', 'Empty'),
            file('f1', 'x.docx', 'd1'),
        ])
        expect(out).toContain('Folders with no files: Empty')
    })

    /** A truncated list must not be described as the whole set. */
    it('says so when the listing is truncated', () => {
        const many = Array.from({ length: 350 }, (_, i) => file(`f${i}`, `file-${i}.docx`, 'd1'))
        const out = buildFilesContext([folder('d1', 'Big'), ...many])
        expect(out).toContain('350 files')
        expect(out).toMatch(/further files not listed/)
    })

    /** A cycle in connector data must not hang the request. */
    it('survives a parent cycle', () => {
        const a = { externalId: 'a', fileName: 'A', isFolder: true, parentId: 'b' }
        const b = { externalId: 'b', fileName: 'B', isFolder: true, parentId: 'a' }
        expect(() => buildFilesContext([a, b, file('f1', 'x.docx', 'a')])).not.toThrow()
    })

    /** Prompt caching needs a byte-identical prefix across turns. */
    it('renders identically for identical input', () => {
        const nodes = [folder('d1', 'A'), file('f1', 'x.docx', 'd1'), file('f2', 'y.docx', 'd1')]
        expect(buildFilesContext(nodes)).toBe(buildFilesContext(nodes))
    })
})
