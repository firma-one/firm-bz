import { describe, it, expect } from 'vitest'
import {
    SCAFFOLD_QUESTIONS, buildScaffold, flattenScaffold, applyNaming, unusedAnswers, scaffoldProposals,
} from './scaffold'

describe('SCAFFOLD_QUESTIONS', () => {
    /** Past five, people stop reading and click the first option. */
    it('stays short and has distinct ids', () => {
        expect(SCAFFOLD_QUESTIONS.length).toBeLessThanOrEqual(5)
        expect(new Set(SCAFFOLD_QUESTIONS.map((q) => q.id)).size).toBe(SCAFFOLD_QUESTIONS.length)
    })

    it('gives every question at least two real options', () => {
        for (const q of SCAFFOLD_QUESTIONS) {
            expect(q.options.length).toBeGreaterThanOrEqual(2)
            expect(new Set(q.options.map((o) => o.value)).size).toBe(q.options.length)
        }
    })
})

describe('applyNaming', () => {
    it('zero-pads so 10 sorts after 09', () => {
        expect(applyNaming('Planning', 0, 'numbered-hyphen')).toBe('01-Planning')
        expect(applyNaming('Planning', 9, 'numbered-hyphen')).toBe('10-Planning')
    })

    it('uses the chosen separator throughout, spaces included', () => {
        expect(applyNaming('Working Papers', 0, 'numbered-underscore')).toBe('01_Working_Papers')
        expect(applyNaming('Working Papers', 0, 'numbered-hyphen')).toBe('01-Working-Papers')
    })

    it('leaves the name alone when numbering is off', () => {
        expect(applyNaming('Planning', 0, 'plain')).toBe('Planning')
        expect(applyNaming('Planning', 0, undefined)).toBe('Planning')
    })
})

describe('buildScaffold', () => {
    const names = (answers: Parameters<typeof buildScaffold>[0]) =>
        buildScaffold(answers).map((f) => f.name)

    it('varies the sections by engagement kind', () => {
        expect(names({ engagementKind: 'audit' })).toContain('Evidence')
        expect(names({ engagementKind: 'implementation' })).toContain('Handover')
        expect(names({ engagementKind: 'audit' })).not.toContain('Handover')
    })

    /** A skipped question costs a folder, never the whole scaffold. */
    it('falls back to advisory with no answers at all', () => {
        expect(buildScaffold({}).length).toBeGreaterThan(0)
        expect(names({})).toContain('Deliverables')
    })

    /** "Draft" at the top level says nothing about what is in draft. */
    it('nests review stages inside the deliverable folder', () => {
        const tree = buildScaffold({ engagementKind: 'advisory', reviewStages: 'two-stage' })
        expect(tree.map((f) => f.name)).not.toContain('Draft')
        const deliverables = tree.find((f) => f.name === 'Deliverables')
        expect(deliverables?.children?.map((c) => c.name)).toEqual(['Draft', 'In Review', 'Final'])
    })

    it('nests review stages under Reporting for an audit', () => {
        const tree = buildScaffold({ engagementKind: 'audit', reviewStages: 'single' })
        expect(tree.find((f) => f.name === 'Reporting')?.children?.map((c) => c.name))
            .toEqual(['Draft', 'Final'])
    })

    it('adds no review folders when there is no review stage', () => {
        const tree = buildScaffold({ engagementKind: 'advisory', reviewStages: 'none' })
        expect(tree.find((f) => f.name === 'Deliverables')?.children).toBeUndefined()
    })

    it('adds Working Papers only when asked for', () => {
        expect(names({ workingPapers: 'yes' })).toContain('Working Papers')
        expect(names({ workingPapers: 'no' })).not.toContain('Working Papers')
    })

    /** A client scanning the folder should meet the work before the back office. */
    it('puts Internal last, and only when the client has access', () => {
        const shared = names({ clientFacing: 'shared' })
        expect(shared[shared.length - 1]).toBe('Internal')
        expect(names({ clientFacing: 'internal' })).not.toContain('Internal')
    })

    it('numbers the top level in order', () => {
        expect(names({ engagementKind: 'advisory', numbering: 'numbered-hyphen' }).slice(0, 2))
            .toEqual(['01-Planning', '02-Research'])
    })
})

describe('flattenScaffold', () => {
    /** Children must never be created before the parent they go in. */
    it('lists parents before their children', () => {
        const flat = flattenScaffold(buildScaffold({ reviewStages: 'two-stage' }))
        const parent = flat.findIndex((f) => f.path === 'Deliverables')
        const child = flat.findIndex((f) => f.path === 'Deliverables/Draft')
        expect(parent).toBeGreaterThanOrEqual(0)
        expect(child).toBeGreaterThan(parent)
    })

    it('records the parent path, null at the top', () => {
        const flat = flattenScaffold(buildScaffold({ reviewStages: 'single' }))
        expect(flat.find((f) => f.path === 'Deliverables')?.parentPath).toBeNull()
        expect(flat.find((f) => f.path === 'Deliverables/Draft')?.parentPath).toBe('Deliverables')
    })

    it('gives every folder a purpose to show in the preview', () => {
        for (const f of flattenScaffold(buildScaffold({ clientFacing: 'shared', workingPapers: 'yes' }))) {
            expect(f.purpose.length).toBeGreaterThan(0)
        }
    })
})

describe('typed answers', () => {
    /**
     * Every question now accepts free text, so `buildScaffold` must survive a value that names no
     * branch — falling back to the safe default rather than producing an empty or wrong tree.
     */
    it('falls back to advisory for an unrecognized engagement kind', () => {
        const tree = buildScaffold({ engagementKind: 'something the user typed' })
        expect(tree.length).toBeGreaterThan(0)
        expect(tree.map((f) => f.name)).toContain('Deliverables')
    })

    it('falls back to plain naming for an unrecognized convention', () => {
        expect(buildScaffold({ numbering: 'however you like' }).map((f) => f.name))
            .toContain('Planning')
    })

    it('ignores an unrecognized answer to a yes/no question', () => {
        const tree = buildScaffold({ workingPapers: 'only for the audit bits' })
        expect(tree.map((f) => f.name)).not.toContain('Working Papers')
    })

    it('builds a usable tree when every answer is typed', () => {
        const tree = buildScaffold({
            engagementKind: 'a', clientFacing: 'b', reviewStages: 'c',
            workingPapers: 'd', numbering: 'e',
        })
        expect(tree.length).toBeGreaterThan(0)
        expect(flattenScaffold(tree).length).toBeGreaterThan(0)
    })
})

describe('unusedAnswers', () => {
    /** A typed answer is not silently dropped — the preview says it was not acted on. */
    it('reports answers that named no branch', () => {
        const unused = unusedAnswers({
            engagementKind: 'advisory',
            workingPapers: 'only for the audit bits',
        })
        expect(unused).toEqual([{ id: 'workingPapers', value: 'only for the audit bits' }])
    })

    it('reports nothing when every answer is a known option', () => {
        expect(unusedAnswers({
            engagementKind: 'audit', clientFacing: 'shared', reviewStages: 'single',
            workingPapers: 'yes', numbering: 'plain',
        })).toEqual([])
    })

    it('reports nothing for unanswered questions', () => {
        expect(unusedAnswers({})).toEqual([])
    })
})

describe('scaffoldProposals', () => {
    /**
     * Creating folders changes a client's Drive, so it goes through the same approval the file
     * review does. These are what the token signs.
     */
    it('turns planned folders into signable proposals', () => {
        const folders = flattenScaffold(buildScaffold({ engagementKind: 'advisory' }))
        const proposals = scaffoldProposals(folders)
        expect(proposals).toHaveLength(folders.length)
        expect(proposals.every((p) => p.kind === 'folder')).toBe(true)
    })

    /** The folders do not exist yet, so the path is what fixes where each one lands. */
    it('signs the parent path, since there are no ids yet', () => {
        const folders = flattenScaffold(buildScaffold({
            engagementKind: 'advisory', reviewStages: 'two-stage',
        }))
        const draft = scaffoldProposals(folders).find((p) => p.name === 'Draft')
        expect(draft?.parentId).toBe('Deliverables')
    })

    /** A different answer set must not verify against a token signed for another. */
    it('produces a different set when the answers differ', () => {
        const a = scaffoldProposals(flattenScaffold(buildScaffold({ engagementKind: 'advisory' })))
        const b = scaffoldProposals(flattenScaffold(buildScaffold({ engagementKind: 'audit' })))
        expect(a.map((p) => p.name)).not.toEqual(b.map((p) => p.name))
    })
})
