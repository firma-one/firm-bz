import { describe, it, expect } from 'vitest'
import { analyseFiles, namePattern, type FileNode } from './analyse'

let seq = 0
function file(fileName: string, parentId: string | null = 'root'): FileNode {
    seq += 1
    return { externalId: `f${seq}`, fileName, isFolder: false, parentId }
}
function folder(fileName: string, externalId: string, parentId: string | null = 'root'): FileNode {
    return { externalId, fileName, isFolder: true, parentId }
}

const kinds = (nodes: FileNode[], rootId: string | null = 'root') =>
    analyseFiles(nodes, rootId).findings.map((f) => f.kind)

describe('namePattern', () => {
    it('reads the separator, numbering and casing', () => {
        expect(namePattern('01-Scope-Note.docx')).toEqual({
            separator: '-', numberedPrefix: true, casing: 'title',
        })
        expect(namePattern('scope_note_final.docx')).toEqual({
            separator: '_', numberedPrefix: false, casing: 'lower',
        })
    })

    /** The extension is not part of the convention — "Report.docx" and "Report.pdf" match. */
    it('ignores the extension', () => {
        expect(namePattern('Report.docx')).toEqual(namePattern('Report.pdf'))
    })
})

describe('analyseFiles', () => {
    describe('naming inconsistency', () => {
        it('flags the minority against a clear convention', () => {
            const result = analyseFiles([
                file('01-Scope-Note.docx'), file('02-Client-Brief.docx'),
                file('03-Market-Data.xlsx'), file('04-Interview-Notes.docx'),
                file('final notes FINAL.docx'),
            ], 'root')

            const naming = result.findings.find((f) => f.kind === 'naming-inconsistent')
            expect(naming).toBeDefined()
            expect(naming!.nodes.map((n) => n.fileName)).toEqual(['final notes FINAL.docx'])
            expect(naming!.dominantPattern).toEqual({
                separator: '-', numberedPrefix: true, casing: 'title',
            })
        })

        /**
         * With no majority there is no convention to break. Flagging all three as inconsistent
         * with each other would be noise, and the model would have nothing to propose toward.
         */
        it('stays silent when no pattern dominates', () => {
            expect(kinds([
                file('01-Scope.docx'), file('client_brief.docx'),
                file('Market Data.xlsx'), file('NOTES.docx'),
            ])).not.toContain('naming-inconsistent')
        })

        it('needs enough siblings to have a convention at all', () => {
            expect(kinds([file('01-Scope.docx'), file('messy name.docx')]))
                .not.toContain('naming-inconsistent')
        })

        /** A convention is per folder: two folders may legitimately differ. */
        it('compares within a folder, not across the tree', () => {
            const nodes = [
                folder('Deliverables', 'd1'), folder('Working', 'd2'),
                file('01-A.docx', 'd1'), file('02-B.docx', 'd1'),
                file('03-C.docx', 'd1'), file('04-D.docx', 'd1'),
                file('notes one.docx', 'd2'), file('notes two.docx', 'd2'),
                file('notes three.docx', 'd2'), file('notes four.docx', 'd2'),
            ]
            expect(kinds(nodes)).not.toContain('naming-inconsistent')
        })
    })

    describe('duplicates', () => {
        it('flags the same name twice in one folder', () => {
            const result = analyseFiles([
                file('Scope Note.docx'), file('scope-note.docx'), file('Other.docx'),
            ], 'root')
            const dup = result.findings.find((f) => f.kind === 'duplicate-name')
            expect(dup?.nodes).toHaveLength(2)
        })

        /**
         * The same document exported two ways is deliberate, not a mistake — the commonest shape
         * being a .docx working copy beside the .pdf that was sent to the client.
         */
        it('does not flag the same stem with different extensions', () => {
            expect(kinds([file('Report.docx'), file('Report.pdf')]))
                .not.toContain('duplicate-name')
        })

        it('does not flag the same name in different folders', () => {
            expect(kinds([
                folder('A', 'a'), folder('B', 'b'),
                file('Scope.docx', 'a'), file('Scope.docx', 'b'),
            ])).not.toContain('duplicate-name')
        })
    })

    describe('loose files at the root', () => {
        it('flags files beside folders at the root', () => {
            const result = analyseFiles([
                folder('Deliverables', 'd1'), file('stray.docx', 'root'),
            ], 'root')
            expect(result.findings.map((f) => f.kind)).toContain('loose-at-root')
        })

        /** With no folders at all this is how an engagement starts, not a problem to report. */
        it('stays silent when the engagement has no folders yet', () => {
            expect(kinds([file('a.docx'), file('b.docx')])).not.toContain('loose-at-root')
        })
    })

    it('flags a folder carrying more files than anyone can scan', () => {
        const many = Array.from({ length: 30 }, (_, i) => file(`file-${i}.docx`, 'big'))
        expect(kinds([folder('Big', 'big'), ...many])).toContain('flat-folder')
    })

    it('flags files buried deeper than a reader will go', () => {
        const nodes: FileNode[] = []
        let parent = 'root'
        for (let i = 0; i < 7; i += 1) {
            nodes.push(folder(`L${i}`, `L${i}`, parent))
            parent = `L${i}`
        }
        nodes.push(file('buried.docx', parent))
        expect(kinds(nodes)).toContain('deep-nesting')
    })

    describe('ranking', () => {
        /** Duplicates lead: unambiguous and cheap to act on. Deep nesting is often deliberate. */
        it('puts duplicates above deep nesting', () => {
            const nodes: FileNode[] = [file('Dup.docx'), file('dup.docx')]
            let parent = 'root'
            for (let i = 0; i < 7; i += 1) {
                nodes.push(folder(`L${i}`, `L${i}`, parent))
                parent = `L${i}`
            }
            nodes.push(file('buried.docx', parent))

            const found = kinds(nodes)
            expect(found.indexOf('duplicate-name')).toBeLessThan(found.indexOf('deep-nesting'))
        })

        it('ranks a widely broken convention above a narrowly broken one', () => {
            const wide = analyseFiles([
                file('01-A.docx', 'w'), file('02-B.docx', 'w'), file('03-C.docx', 'w'),
                file('04-D.docx', 'w'), file('05-E.docx', 'w'), file('06-F.docx', 'w'),
                file('x one.docx', 'w'), file('x two.docx', 'w'), file('x three.docx', 'w'),
            ], 'root').findings.find((f) => f.kind === 'naming-inconsistent')

            const narrow = analyseFiles([
                file('01-A.docx', 'n'), file('02-B.docx', 'n'),
                file('03-C.docx', 'n'), file('x one.docx', 'n'),
            ], 'root').findings.find((f) => f.kind === 'naming-inconsistent')

            expect(wide!.score).toBeGreaterThan(narrow!.score)
        })
    })

    it('reports nothing for a tidy engagement', () => {
        expect(kinds([
            folder('Deliverables', 'd1'),
            file('01-Scope-Note.docx', 'd1'), file('02-Client-Brief.docx', 'd1'),
            file('03-Market-Data.xlsx', 'd1'), file('04-Interview-Notes.docx', 'd1'),
        ])).toEqual([])
    })

    /** A cycle in connector data must not hang the request. */
    it('survives a parent cycle', () => {
        const a = { externalId: 'a', fileName: 'A', isFolder: true, parentId: 'b' }
        const b = { externalId: 'b', fileName: 'B', isFolder: true, parentId: 'a' }
        expect(() => analyseFiles([a, b, file('x.docx', 'a')], 'root')).not.toThrow()
    })
})
