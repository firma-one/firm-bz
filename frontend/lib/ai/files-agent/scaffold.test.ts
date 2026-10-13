import { describe, it, expect } from 'vitest'
import {
    SCAFFOLD_QUESTIONS, buildScaffold, flattenScaffold, applyNaming, unusedAnswers, scaffoldProposals, ENGAGEMENT_KINDS, type ScaffoldEdits, type ScaffoldAnswers} from './scaffold'

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

    /**
     * The Board owns a deliverable's readiness, review and access. Stage folders would be a
     * second, unsynchronised record of the same state — a file in "Final" while the Board says
     * in-review is a contradiction nothing resolves.
     */
    it('never creates Draft, In Review or Final folders, whatever is asked for', () => {
        for (const kind of ENGAGEMENT_KINDS) {
            const all = flattenScaffold(buildScaffold({ engagementKind: kind }))
                .map((f) => f.name.toLowerCase())
            expect(all).not.toContain('draft')
            expect(all).not.toContain('in review')
            expect(all).not.toContain('final')
        }
    })

    it('leaves the deliverable folder with no stage children', () => {
        const tree = buildScaffold({ engagementKind: 'advisory' })
        expect(tree.find((f) => f.name === 'Deliverables')?.children).toBeUndefined()
        expect(buildScaffold({ engagementKind: 'audit' })
            .find((f) => f.name === 'Reporting')?.children).toBeUndefined()
    })

    it('adds Working Papers only when asked for', () => {
        expect(names({ workingPapers: 'yes' })).toContain('Working Papers')
        expect(names({ workingPapers: 'no' })).not.toContain('Working Papers')
    })

    /**
     * Always created, whatever else was answered.
     *
     * It used to depend on "Will the client have access?", which was the wrong question at setup:
     * sharing is a deliberate act after work is ready, and the engagement that is internal-only
     * today is shared later — with no folder for the work that should never have gone out.
     */
    it('always creates Internal, and puts it last', () => {
        for (const answers of [{}, { engagementKind: 'audit' }, { workingPapers: 'yes' }]) {
            const built = names(answers)
            expect(built).toContain('Internal')
            expect(built[built.length - 1]).toBe('Internal')
        }
    })

    it('numbers the top level in order', () => {
        expect(names({ engagementKind: 'advisory', numbering: 'numbered-hyphen' }).slice(0, 2))
            .toEqual(['01-Planning', '02-Research'])
    })
})

describe('flattenScaffold', () => {
    /** Children must never be created before the parent they go in. */
    it('lists parents before their children', () => {
        const flat = flattenScaffold(buildScaffold({}))
        const parent = flat.findIndex((f) => f.path === 'Internal')
        const child = flat.findIndex((f) => f.path === 'Internal/Admin')
        expect(parent).toBeGreaterThanOrEqual(0)
        expect(child).toBeGreaterThan(parent)
    })

    it('records the parent path, null at the top', () => {
        const flat = flattenScaffold(buildScaffold({}))
        expect(flat.find((f) => f.path === 'Internal')?.parentPath).toBeNull()
        expect(flat.find((f) => f.path === 'Internal/Admin')?.parentPath).toBe('Internal')
    })

    it('gives every folder a purpose to show in the preview', () => {
        for (const f of flattenScaffold(buildScaffold({ workingPapers: 'yes' }))) {
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
            engagementKind: 'a', workingPapers: 'd', numbering: 'e',
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
            engagementKind: 'audit',
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
            engagementKind: 'advisory',
        }))
        const nested = scaffoldProposals(folders).find((p) => p.name === 'Admin')
        expect(nested?.parentId).toBe('Internal')
    })

    /** A different answer set must not verify against a token signed for another. */
    it('produces a different set when the answers differ', () => {
        const a = scaffoldProposals(flattenScaffold(buildScaffold({ engagementKind: 'advisory' })))
        const b = scaffoldProposals(flattenScaffold(buildScaffold({ engagementKind: 'audit' })))
        expect(a.map((p) => p.name)).not.toEqual(b.map((p) => p.name))
    })
})

describe('product or platform build', () => {
    it('produces one ordered tree of phases, not two trees glued together', () => {
        const names = flattenScaffold(buildScaffold({ engagementKind: 'product' }))
            .filter((f) => !f.parentPath)
            .map((f) => f.name)
        // Research, specify, build, hand over — the sequence the work actually follows. This is
        // the case the four original kinds forced into either advisory or implementation,
        // losing half the structure each way.
        expect(names).toEqual([
            'Discovery', 'Requirements', 'Design', 'Build', 'Testing', 'Handover', 'Internal',
        ])
    })

    it('puts no stage folders under Handover', () => {
        const all = flattenScaffold(buildScaffold({ engagementKind: 'product' }))
        expect(all.filter((f) => f.parentPath === 'Handover')).toEqual([])
    })

    it('is a kind the review route will accept', () => {
        // ENGAGEMENT_KINDS derives from the builder's own branches, so a kind that builds a tree
        // can never be rejected as invalid by the route that validates against it.
        expect(ENGAGEMENT_KINDS).toContain('product')
    })
})

describe('scaffold edits', () => {
    const names = (a: ScaffoldAnswers, e?: ScaffoldEdits) =>
        buildScaffold(a, e).map((f) => f.name)

    it('leaves out a removed folder and renumbers the rest', () => {
        const before = names({ engagementKind: 'product', numbering: 'numbered-underscore' })
        expect(before).toContain('03_Design')

        const after = names(
            { engagementKind: 'product', numbering: 'numbered-underscore' },
            { removed: ['Design'] },
        )
        expect(after).not.toContain('03_Design')
        // Renumbered, not left with a gap at 03.
        expect(after).toContain('03_Build')
        expect(after.length).toBe(before.length - 1)
    })

    it('ignores an unknown edit rather than acting on it', () => {
        // Removal only, deliberately. An invented folder has neither the structure nor the naming
        // convention the scaffold exists to supply — in practice it came out numbered twice
        // ("08-06-Handover") and described as "Added during setup". One folder made by hand
        // afterwards is trivial; a good suggested structure is not.
        //
        // This guards the SERVER: the route parses edits from a request, so a stale client
        // sending `added` must change nothing rather than create an unsigned folder.
        const stale = JSON.parse('{"added":["Legal Review"]}') as ScaffoldEdits
        expect(names({ engagementKind: 'advisory' }, stale))
            .toEqual(names({ engagementKind: 'advisory' }))
    })

    it('matches a removal whatever naming convention is in play', () => {
        for (const numbering of ['numbered-hyphen', 'numbered-underscore', 'plain']) {
            const after = names({ engagementKind: 'advisory', numbering }, { removed: ['Research'] })
            expect(after.some((n) => n.toLowerCase().includes('research'))).toBe(false)
        }
    })

    it('can empty the tree, which the caller is expected to catch', () => {
        const all = buildScaffold({ engagementKind: 'retainer' }).map((f) =>
            f.name.replace(/^\d{1,2}[._\-)]*\s*/, ''))
        expect(buildScaffold({ engagementKind: 'retainer' }, { removed: all })).toEqual([])
    })
})
