import { describe, it, expect } from 'vitest'
import { analyzeFiles, FLAT_FOLDER_THRESHOLD, MAX_REASONABLE_DEPTH, describePattern, inferRootId, namePattern, type FileNode } from './analyze'

let seq = 0
function file(fileName: string, parentId: string | null = 'root'): FileNode {
    seq += 1
    return { externalId: `f${seq}`, fileName, isFolder: false, parentId }
}
function folder(fileName: string, externalId: string, parentId: string | null = 'root'): FileNode {
    return { externalId, fileName, isFolder: true, parentId }
}

const kinds = (nodes: FileNode[], rootId: string | null = 'root') =>
    analyzeFiles(nodes, rootId).findings.map((f) => f.kind)

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

describe('analyzeFiles', () => {
    describe('naming inconsistency', () => {
        it('flags the minority against a clear convention', () => {
            const result = analyzeFiles([
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
            const result = analyzeFiles([
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
            const result = analyzeFiles([
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
            const wide = analyzeFiles([
                file('01-A.docx', 'w'), file('02-B.docx', 'w'), file('03-C.docx', 'w'),
                file('04-D.docx', 'w'), file('05-E.docx', 'w'), file('06-F.docx', 'w'),
                file('x one.docx', 'w'), file('x two.docx', 'w'), file('x three.docx', 'w'),
            ], 'root').findings.find((f) => f.kind === 'naming-inconsistent')

            const narrow = analyzeFiles([
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
        expect(() => analyzeFiles([a, b, file('x.docx', 'a')], 'root')).not.toThrow()
    })
})

describe('copy-suffix duplicates', () => {
    /**
     * The single most common real duplicate: the same file downloaded twice. Normalising only
     * separators and case left the "(1)" in the key, so this pair never collided and a review of
     * a folder visibly containing it reported "nothing to fix".
     */
    it('matches a browser copy against its original', () => {
        const nodes = [
            file('Interviewer_Question_Bank.docx'),
            file('Interviewer_Question_Bank (1).docx'),
        ]
        expect(kinds(nodes)).toContain('duplicate-name')
    })

    it('matches "copy" and "copy 2" suffixes', () => {
        expect(kinds([file('Scope Note.docx'), file('Scope Note copy.docx')]))
            .toContain('duplicate-name')
        expect(kinds([file('Scope Note.docx'), file('Scope Note copy 2.docx')]))
            .toContain('duplicate-name')
    })

    /** A numeric suffix that is part of the name is not a copy marker. */
    it('does not treat a mid-name number as a copy', () => {
        expect(kinds([file('Interview (1) Notes.docx'), file('Interview Notes.docx')]))
            .not.toContain('duplicate-name')
    })

    /** Still holds: two formats of one document are deliberate. */
    it('keeps different extensions distinct', () => {
        expect(kinds([file('Report (1).docx'), file('Report.pdf')]))
            .not.toContain('duplicate-name')
    })
})

describe('separator detection', () => {
    /**
     * "01__Market & Competitive Intelligence Report" has two underscores and four spaces. Counting
     * raw frequency called its separator " " while the shorter "04__Launch Readiness Kit" came out
     * "_", so four folders following one convention looked like two and the detector went quiet.
     */
    it('reads the convention from the prefix delimiter, not raw frequency', () => {
        const long = namePattern('01__Market & Competitive Intelligence Report')
        const short = namePattern('04__Launch Readiness Kit')
        expect(long.separator).toBe('_')
        expect(long).toEqual(short)
    })

    it('still falls back to frequency without a numeric prefix', () => {
        expect(namePattern('scope-note-final.docx').separator).toBe('-')
    })
})

describe('summary', () => {
    /** A clean review still has to report what it checked. */
    it('reports counts and the dominant convention', () => {
        const nodes = [
            folder('Deliverables', 'd1'),
            file('01-Scope-Note.docx', 'd1'),
            file('02-Client-Brief.docx', 'd1'),
            file('03-Final-Report.docx', 'd1'),
        ]
        const { summary } = analyzeFiles(nodes, 'root')
        expect(summary.fileCount).toBe(3)
        expect(summary.folderCount).toBe(1)
        expect(summary.duplicateCount).toBe(0)
        expect(summary.dominantPattern).toEqual({
            separator: '-', numberedPrefix: true, casing: 'title',
        })
        expect(summary.patternAdherence).toBe(1)
    })

    it('counts empty folders', () => {
        const nodes = [folder('Empty', 'e1'), folder('Used', 'u1'), file('a.docx', 'u1')]
        expect(analyzeFiles(nodes, 'root').summary.emptyFolderCount).toBe(1)
    })

    /** No majority is stated as such rather than invented. */
    it('reports no convention when none dominates', () => {
        const nodes = [
            file('01-Scope-Note.docx'),
            file('client brief.docx'),
            file('FINAL_REPORT.docx'),
        ]
        expect(analyzeFiles(nodes, 'root').summary.dominantPattern).toBeNull()
    })
})

describe('loose files at the root', () => {
    /**
     * The regression this exists to stop. `connectorRootFolderId` is the provider's id for a folder
     * that is not itself stored as a document, so it matches no `parentId` and the detector
     * returned zero on every engagement — 20 loose files went unreported on live data.
     */
    it('fires when the supplied rootId matches nothing in the tree', () => {
        const nodes = [
            folder('Deliverables', 'd1', 'PROVIDER-ROOT'),
            file('loose-one.docx', 'PROVIDER-ROOT'),
            file('loose-two.docx', 'PROVIDER-ROOT'),
            file('inside.docx', 'd1'),
        ]
        // A root id that appears nowhere, as the real column does.
        expect(kinds(nodes, 'SOME-OTHER-ID')).toContain('loose-at-root')
    })

    it('still honours a rootId that does appear', () => {
        const nodes = [
            folder('Deliverables', 'd1', 'root'),
            file('loose.docx', 'root'),
        ]
        expect(kinds(nodes, 'root')).toContain('loose-at-root')
    })

    /** Everything in one flat list has not been organized yet — a different observation. */
    it('stays silent when there are no folders at all', () => {
        expect(kinds([file('a.docx', 'R'), file('b.docx', 'R')], null))
            .not.toContain('loose-at-root')
    })

    it('stays silent when every file is inside a folder', () => {
        const nodes = [folder('Deliverables', 'd1', 'R'), file('inside.docx', 'd1')]
        expect(kinds(nodes, null)).not.toContain('loose-at-root')
    })
})

describe('inferRootId', () => {
    it('finds the parent that is not itself a node', () => {
        const nodes = [folder('A', 'a1', 'TOP'), folder('B', 'b1', 'TOP'), file('x.docx', 'a1')]
        expect(inferRootId(nodes)).toBe('TOP')
    })

    /** A partial sync can leave a stray; the majority is the root. */
    it('prefers the most common orphan parent', () => {
        const nodes = [
            folder('A', 'a1', 'TOP'), folder('B', 'b1', 'TOP'), folder('C', 'c1', 'TOP'),
            file('stray.docx', 'ELSEWHERE'),
        ]
        expect(inferRootId(nodes)).toBe('TOP')
    })

    it('returns null for an empty set', () => {
        expect(inferRootId([])).toBeNull()
    })
})

describe('naming inconsistency, grouped by separator', () => {
    /**
     * The real folder that exposed this: twenty files, mostly underscored but in three casings, and
     * one hyphenated. Keying on the full pattern split the underscore convention into three groups,
     * left the largest at 40% — under the dominance threshold — and reported nothing.
     */
    it('sees one convention across differing casings', () => {
        const nodes = [
            file('sample_2mb.pdf'), file('sample_1mb.txt'), file('sample_100_records.json'),
            file('sample_30kB.svg'), file('sample_2100kB.png'),
            file('Interviewer_RunSheet_60min.docx'),
            file('01-Content-Archive.docx'),
        ]
        const findings = analyzeFiles(nodes, 'root').findings
            .filter((f) => f.kind === 'naming-inconsistent')
        expect(findings).toHaveLength(1)
        expect(findings[0].nodes.map((n) => n.fileName)).toEqual(['01-Content-Archive.docx'])
        expect(findings[0].dominantPattern?.separator).toBe('_')
    })

    /** Single-word names participate in no convention and must not dilute the majority. */
    it('ignores files with no separator', () => {
        const nodes = [
            file('sample.json'), file('sample.html'), file('sample.zip'), file('sample.xml'),
            file('report_one.docx'), file('report_two.docx'), file('report_three.docx'),
            file('report-four.docx'),
        ]
        const findings = analyzeFiles(nodes, 'root').findings
            .filter((f) => f.kind === 'naming-inconsistent')
        expect(findings[0]?.nodes.map((n) => n.fileName)).toEqual(['report-four.docx'])
    })

    it('stays silent when there is no majority', () => {
        const nodes = [
            file('a_one.docx'), file('b_two.docx'),
            file('c-three.docx'), file('d-four.docx'),
        ]
        expect(kinds(nodes)).not.toContain('naming-inconsistent')
    })

    it('stays silent when everything agrees', () => {
        const nodes = [
            file('a_one.docx'), file('b_two.docx'), file('c_three.docx'), file('d_four.docx'),
        ]
        expect(kinds(nodes)).not.toContain('naming-inconsistent')
    })
})

describe('summary and detector agree', () => {
    /**
     * The exact mix from a live folder: eight underscored lowercase, three underscored title case,
     * four single-word, one hyphenated. The detector found "underscores"; the summary, computing it
     * separately, reported "no single naming convention" for the same tree.
     */
    const REAL_FOLDER = [
        'sample_2mb.pdf', 'sample_1mb.txt', 'sample_100_records.json', 'sample_2mb.md',
        'sample_30kB.svg', 'sample_2100kB.png', 'sample_5MG.mp3', 'sample_multi_sheet.xlsx',
        'Interviewer_RunSheet_60min.docx', 'Personal_Project_Tracker.xlsx',
        'sample.json', 'sample.html', 'sample.zip',
        '01-Content-Archive.docx',
    ]

    it('reports the convention the detector found, on real data', () => {
        const result = analyzeFiles(REAL_FOLDER.map((n) => file(n)), 'root')
        expect(result.summary.dominantPattern?.separator).toBe('_')
        expect(describePattern(result.summary.dominantPattern)).toBe('underscores')

        const naming = result.findings.find((f) => f.kind === 'naming-inconsistent')
        expect(naming?.dominantPattern?.separator)
            .toBe(result.summary.dominantPattern?.separator)
    })

    /** Single-word names follow no convention, so they must not drag the share down. */
    it('measures adherence against files that have a separator', () => {
        const result = analyzeFiles(REAL_FOLDER.map((n) => file(n)), 'root')
        // 10 underscored of 11 separated — not of 14 total, which would be 71% and read as worse
        // than the folder is.
        expect(result.summary.patternAdherence).toBeCloseTo(10 / 11, 2)
    })

    /**
     * The group's pattern belongs to whichever file landed first, so its casing and prefix flags
     * describe that one file. Stating them made the summary claim "Title Case, numbered prefixes"
     * for a folder that is mostly lowercase and unnumbered.
     */
    it('describes only the separator, never one sample file traits', () => {
        for (const sep of ['-', '_', ' '] as const) {
            const described = describePattern({ separator: sep, numberedPrefix: true, casing: 'title' })
            expect(described).not.toMatch(/Case|numbered/)
        }
        expect(describePattern({ separator: '-', numberedPrefix: true, casing: 'title' }))
            .toBe('hyphens')
    })

    it('still says so when there is genuinely no convention', () => {
        const nodes = [
            file('a_one.docx'), file('b_two.docx'),
            file('c-three.docx'), file('d-four.docx'),
        ]
        expect(describePattern(analyzeFiles(nodes, 'root').summary.dominantPattern))
            .toBe('no single naming convention')
    })
})

describe('thresholds shared with the Overview score', () => {
    /**
     * Both engines judge the same tree — this one behind the Files agent, and Folder Health on
     * Overview. They were written separately and disagreed: Overview called a folder at depth 3
     * deeply nested while the agent considered anything under 6 fine, so one engagement could be
     * told its structure was both a problem and not one on two tabs of the same page.
     */
    it('treats three levels as ordinary, not deep', () => {
        // Deliverables / 01-Report / Draft / file — a well-organized engagement.
        const nodes = [
            folder('Deliverables', 'd1', 'R'),
            folder('01-Report', 'd2', 'd1'),
            folder('Draft', 'd3', 'd2'),
            file('working.docx', 'd3'),
        ]
        expect(MAX_REASONABLE_DEPTH).toBeGreaterThanOrEqual(3)
        expect(kinds(nodes, 'R')).not.toContain('deep-nesting')
    })

    it('still flags a tree past the shared limit', () => {
        const nodes: FileNode[] = []
        let parent = 'R'
        for (let i = 0; i < MAX_REASONABLE_DEPTH + 2; i += 1) {
            nodes.push(folder(`L${i}`, `f${i}`, parent))
            parent = `f${i}`
        }
        nodes.push(file('buried.docx', parent))
        expect(kinds(nodes, 'R')).toContain('deep-nesting')
    })

    it('flags a folder past the crowding threshold, and not one at it', () => {
        const at = [folder('Bulk', 'b1', 'R')]
        for (let i = 0; i < FLAT_FOLDER_THRESHOLD; i += 1) at.push(file(`f${i}.docx`, 'b1'))
        expect(kinds(at, 'R')).not.toContain('flat-folder')

        const over = [folder('Bulk', 'b2', 'R')]
        for (let i = 0; i < FLAT_FOLDER_THRESHOLD + 1; i += 1) over.push(file(`g${i}.docx`, 'b2'))
        expect(kinds(over, 'R')).toContain('flat-folder')
    })
})
