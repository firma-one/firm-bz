import { describe, it, expect } from 'vitest'
import { validateProposals } from './tools'
import type { FileNode } from './analyse'

const nodes: FileNode[] = [
    { externalId: 'root', fileName: 'Engagement', isFolder: true, parentId: null },
    { externalId: 'd1', fileName: 'Deliverables', isFolder: true, parentId: 'root' },
    { externalId: 'd2', fileName: 'Working', isFolder: true, parentId: 'root' },
    { externalId: 'f1', fileName: 'messy name.docx', isFolder: false, parentId: 'root' },
    { externalId: 'f2', fileName: '01-Scope.docx', isFolder: false, parentId: 'd1' },
]

const rename = (renames: unknown[]) => validateProposals('propose_renames', { renames }, nodes)
const move = (moves: unknown[]) => validateProposals('propose_moves', { moves }, nodes)
const folder = (folders: unknown[]) => validateProposals('propose_folders', { folders }, nodes)

describe('validateProposals — renames', () => {
    it('accepts a well-formed rename', () => {
        const { proposals, dropped } = rename([
            { externalId: 'f1', proposedName: '02-Client-Brief.docx', reason: 'matches pattern' },
        ])
        expect(dropped).toBe(0)
        expect(proposals[0]).toMatchObject({
            kind: 'rename', externalId: 'f1',
            currentName: 'messy name.docx', proposedName: '02-Client-Brief.docx',
        })
    })

    /**
     * The grounding guarantee. A connector-side id is not a uuid, so an invented one could
     * plausibly collide with a real file in another engagement.
     */
    it('drops a file id the model was never shown', () => {
        expect(rename([{ externalId: 'nope', proposedName: 'x.docx', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    /** Renaming .docx to .pdf does not convert the file — it just makes it open wrongly. */
    it('refuses to change the extension', () => {
        expect(rename([{ externalId: 'f1', proposedName: 'messy name.pdf', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    it('drops names a provider would reject', () => {
        for (const bad of ['a/b.docx', 'a:b.docx', 'a?.docx', 'a|b.docx', 'a<b.docx']) {
            expect(rename([{ externalId: 'f1', proposedName: bad, reason: 'r' }]).proposals,
                bad).toHaveLength(0)
        }
    })

    /** Trimmed rather than dropped: a stray space is worth fixing, not worth losing a proposal. */
    it('trims surrounding whitespace instead of rejecting', () => {
        const first = rename([{ externalId: 'f1', proposedName: '  02-Brief.docx  ', reason: 'r' }])
            .proposals[0]
        expect(first?.kind).toBe('rename')
        expect(first?.kind === 'rename' && first.proposedName).toBe('02-Brief.docx')
    })

    it('drops a rename that changes nothing', () => {
        expect(rename([{ externalId: 'f1', proposedName: 'messy name.docx', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    it('refuses to rename a folder', () => {
        expect(rename([{ externalId: 'd1', proposedName: 'Renamed.docx', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    /** One bad proposal should cost that proposal, not the batch the user already paid for. */
    it('keeps the good proposals in a mixed batch', () => {
        const { proposals, dropped } = rename([
            { externalId: 'f1', proposedName: '02-Brief.docx', reason: 'r' },
            { externalId: 'ghost', proposedName: 'x.docx', reason: 'r' },
        ])
        expect(proposals).toHaveLength(1)
        expect(dropped).toBe(1)
    })
})

describe('validateProposals — moves', () => {
    it('accepts a move into a real folder', () => {
        const { proposals } = move([
            { externalId: 'f1', destinationFolderId: 'd1', reason: 'belongs with deliverables' },
        ])
        expect(proposals[0]).toMatchObject({
            kind: 'move', externalId: 'f1', destinationFolderId: 'd1', destinationName: 'Deliverables',
        })
    })

    it('drops a move to somewhere that is not a folder', () => {
        expect(move([{ externalId: 'f1', destinationFolderId: 'f2', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    it('drops a move to where the file already is', () => {
        expect(move([{ externalId: 'f2', destinationFolderId: 'd1', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })

    /** Moving a folder into its own descendant orphans a subtree, so folders do not move at all. */
    it('refuses to move a folder', () => {
        expect(move([{ externalId: 'd1', destinationFolderId: 'd2', reason: 'r' }]).proposals)
            .toHaveLength(0)
    })
})

describe('validateProposals — folders', () => {
    it('accepts a folder under a real parent', () => {
        const { proposals } = folder([{ name: 'Interviews', parentId: 'd1', reason: 'groups notes' }])
        expect(proposals[0]).toMatchObject({ kind: 'folder', name: 'Interviews', parentId: 'd1' })
    })

    it('treats a missing parent as the engagement root', () => {
        expect(folder([{ name: 'Admin', reason: 'r' }]).proposals[0]).toMatchObject({ parentId: null })
    })

    it('drops a folder under a parent that does not exist', () => {
        expect(folder([{ name: 'X', parentId: 'ghost', reason: 'r' }]).proposals).toHaveLength(0)
    })

    it('drops an unsafe folder name', () => {
        expect(folder([{ name: 'a/b', reason: 'r' }]).proposals).toHaveLength(0)
    })
})

describe('validateProposals — malformed input', () => {
    /** The model can return anything; none of it should throw. */
    it('survives shapes the schema did not promise', () => {
        for (const bad of [null, undefined, {}, { renames: 'nope' }, { renames: [null, 42, {}] }]) {
            expect(() => validateProposals('propose_renames', bad, nodes)).not.toThrow()
        }
    })

    it('returns nothing for an unknown tool name', () => {
        expect(validateProposals('drop_database', { renames: [] }, nodes).proposals).toHaveLength(0)
    })
})
