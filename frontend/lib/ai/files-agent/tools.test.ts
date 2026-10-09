import { describe, it, expect } from 'vitest'
import { validateProposals, isValidRenameTarget, proposalKey, losesInformation } from './tools'
import type { FileNode } from './analyze'

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

describe('isValidRenameTarget', () => {
    /** The user's own name passes the same rules the agent's suggestions do. */
    it('accepts a different name with the same extension', () => {
        expect(isValidRenameTarget('Report.docx', '01-Report.docx')).toBe(true)
    })

    it('refuses an extension change', () => {
        expect(isValidRenameTarget('Report.docx', 'Report.pdf')).toBe(false)
    })

    it('refuses a no-op', () => {
        expect(isValidRenameTarget('Report.docx', 'Report.docx')).toBe(false)
    })

    it('refuses empty or whitespace', () => {
        expect(isValidRenameTarget('Report.docx', '')).toBe(false)
        expect(isValidRenameTarget('Report.docx', '   ')).toBe(false)
    })

    /** Path separators and reserved characters would break on one provider or both. */
    it('refuses unsafe characters', () => {
        for (const bad of ['a/b.docx', 'a\\b.docx', 'a:b.docx', 'a?b.docx', 'a*b.docx', 'a"b.docx']) {
            expect(isValidRenameTarget('Report.docx', bad)).toBe(false)
        }
    })

    it('trims before comparing, so padding is not a change', () => {
        expect(isValidRenameTarget('Report.docx', '  Report.docx  ')).toBe(false)
    })

    /** An extensionless file may be renamed, as long as it stays extensionless. */
    it('handles names with no extension', () => {
        expect(isValidRenameTarget('README', 'NOTES')).toBe(true)
        expect(isValidRenameTarget('README', 'NOTES.txt')).toBe(false)
    })
})

describe('proposalKey', () => {
    /** Pairs an override to its proposal without trusting array order. */
    it('is stable and distinct per proposal', () => {
        const rename = { kind: 'rename', externalId: 'f1', currentName: 'a.docx', proposedName: 'b.docx', reason: '', docId: null, path: '' } as const
        const move = { kind: 'move', externalId: 'f1', fileName: 'a.docx', destinationFolderId: 'd1', destinationName: 'D', reason: '', docId: null, path: '' } as const
        expect(proposalKey(rename)).toBe(proposalKey({ ...rename }))
        // Same file, different operation: the keys must not collide or an override could be
        // redirected from a rename onto a move.
        expect(proposalKey(rename)).not.toBe(proposalKey(move))
    })
})

describe('name collisions', () => {
    const nodes = [
        { externalId: 'f1', fileName: 'Interviewer_Question_Bank (1).docx', isFolder: false, parentId: 'root' },
        { externalId: 'f2', fileName: 'Interviewer_Question_Bank.docx', isFolder: false, parentId: 'root' },
        { externalId: 'd1', fileName: 'Deliverables', isFolder: true, parentId: 'root' },
    ]

    /**
     * The case from the UI: de-duplicating "Report (1).docx" by renaming it to "Report.docx" while
     * "Report.docx" sits in the same folder. The provider would refuse it or produce two files with
     * one name — the very problem the rename was meant to fix.
     */
    it('drops a rename onto a name the folder already holds', () => {
        const out = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: 'Interviewer_Question_Bank.docx', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(0)
        expect(out.dropped).toBe(1)
    })

    /** Both providers treat these as one name, so differing bytes are not a defence. */
    it('compares case-insensitively', () => {
        const out = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: 'INTERVIEWER_QUESTION_BANK.docx', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(0)
    })

    it('allows a rename to a name nothing holds', () => {
        const out = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: 'Interviewer_Question_Bank_Archive.docx', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(1)
    })

    /** Two renames toward one name collide the moment the second is applied. */
    it('drops a second rename claiming the same name', () => {
        const out = validateProposals('propose_renames', {
            renames: [
                { externalId: 'f1', proposedName: 'Bank_A.docx', reason: 'x' },
                { externalId: 'f2', proposedName: 'Bank_A.docx', reason: 'x' },
            ],
        }, nodes)
        expect(out.proposals).toHaveLength(1)
        expect(out.dropped).toBe(1)
    })

    /** The old name is freed, so the name a file vacates can be taken by another. */
    it('allows a rename onto a name this batch frees', () => {
        const out = validateProposals('propose_renames', {
            renames: [
                { externalId: 'f2', proposedName: 'Bank_Primary.docx', reason: 'x' },
                { externalId: 'f1', proposedName: 'Interviewer_Question_Bank.docx', reason: 'x' },
            ],
        }, nodes)
        expect(out.proposals).toHaveLength(2)
    })

    it('drops a move into a folder already holding that name', () => {
        const withClash = [...nodes,
            { externalId: 'f3', fileName: 'Interviewer_Question_Bank.docx', isFolder: false, parentId: 'd1' },
        ]
        const out = validateProposals('propose_moves', {
            moves: [{ externalId: 'f2', destinationFolderId: 'd1', reason: 'x' }],
        }, withClash)
        expect(out.proposals).toHaveLength(0)
    })

    it('drops a folder whose name is already taken in that parent', () => {
        const nested = [...nodes,
            { externalId: 'd2', fileName: 'Working Papers', isFolder: true, parentId: 'd1' },
        ]
        const out = validateProposals('propose_folders', {
            folders: [{ name: 'Working Papers', parentId: 'd1', reason: 'x' }],
        }, nested)
        expect(out.proposals).toHaveLength(0)
    })

    /** The same name in a DIFFERENT parent is not a collision. */
    it('allows a folder name that is taken elsewhere', () => {
        const nested = [...nodes,
            { externalId: 'd2', fileName: 'Working Papers', isFolder: true, parentId: 'd1' },
        ]
        const out = validateProposals('propose_folders', {
            folders: [{ name: 'Working Papers', parentId: null, reason: 'x' }],
        }, nested)
        expect(out.proposals).toHaveLength(1)
    })
})

describe('losesInformation', () => {
    /**
     * The model, told the folder had "no number prefix", renamed "01-Content-Archive.docx" to
     * "content_archive.docx" — right about the separator, wrong to discard a sequence number that
     * was someone's deliberate ordering.
     */
    it('refuses a rename that drops a sequence prefix', () => {
        expect(losesInformation('01-Content-Archive.docx', 'content_archive.docx')).toBe(true)
    })

    it('allows a restyle that keeps the prefix', () => {
        expect(losesInformation('01-Content-Archive.docx', '01_Content_Archive.docx')).toBe(false)
    })

    /** Renumbering is a reordering nobody asked for. */
    it('refuses a changed sequence number', () => {
        expect(losesInformation('01-Report.docx', '02_Report.docx')).toBe(true)
    })

    it('accepts equivalent numbering written differently', () => {
        expect(losesInformation('1-Report.docx', '01_Report.docx')).toBe(false)
    })

    it('says nothing about files that never had a prefix', () => {
        expect(losesInformation('Report.docx', 'Client_Report.docx')).toBe(false)
    })

    it('is enforced by the validator, not only the prompt', () => {
        const out = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: 'content_archive.docx', reason: 'x' }],
        }, [{ externalId: 'f1', fileName: '01-Content-Archive.docx', isFolder: false, parentId: 'root' }])
        expect(out.proposals).toHaveLength(0)
        expect(out.dropped).toBe(1)
    })
})

describe('docId and path on proposals', () => {
    const nodes = [
        { externalId: 'root-f', fileName: 'Internal', isFolder: true, parentId: 'ROOT', docId: 'QSR-44' },
        { externalId: 'sub', fileName: 'Working', isFolder: true, parentId: 'root-f', docId: 'QSR-50' },
        { externalId: 'f1', fileName: '01-Content-Archive.docx', isFolder: false, parentId: 'sub', docId: 'QSR-49' },
        { externalId: 'top', fileName: 'loose.docx', isFolder: false, parentId: 'ROOT', docId: 'QSR-60' },
    ]

    /** A filename alone does not identify one item among fifty-eight. */
    it('carries the doc id and folder path on a rename', () => {
        const [p] = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: '01_Content_Archive.docx', reason: 'x' }],
        }, nodes).proposals
        expect(p.docId).toBe('QSR-49')
        expect(p.path).toBe('Internal/Working')
    })

    /** The root folder is not stored as a document, so the walk stops there. */
    it('gives an empty path for a file at the root', () => {
        const [p] = validateProposals('propose_renames', {
            renames: [{ externalId: 'top', proposedName: 'Loose_File.docx', reason: 'x' }],
        }, nodes).proposals
        expect(p.path).toBe('')
    })

    it('reports where a moved file is NOW, not where it is going', () => {
        const [p] = validateProposals('propose_moves', {
            moves: [{ externalId: 'f1', destinationFolderId: 'root-f', reason: 'x' }],
        }, nodes).proposals
        expect(p.path).toBe('Internal/Working')
        expect(p.docId).toBe('QSR-49')
    })

    /** A folder that does not exist yet has no id; its path is where it will be created. */
    it('gives a new folder no id and the parent path', () => {
        const [p] = validateProposals('propose_folders', {
            folders: [{ name: 'Archive', parentId: 'sub', reason: 'x' }],
        }, nodes).proposals
        expect(p.docId).toBeNull()
        expect(p.path).toBe('Internal/Working')
    })

    it('handles a file whose platform id was never issued', () => {
        const [p] = validateProposals('propose_renames', {
            renames: [{ externalId: 'x1', proposedName: 'Renamed.docx', reason: 'x' }],
        }, [...nodes, { externalId: 'x1', fileName: 'no-id.docx', isFolder: false, parentId: 'ROOT' }]).proposals
        expect(p.docId).toBeNull()
    })
})
