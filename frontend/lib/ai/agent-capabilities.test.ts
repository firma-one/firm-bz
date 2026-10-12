import { describe, it, expect } from 'vitest'
import {
    PERMITTED_AGENT_OPERATIONS, FORBIDDEN_AGENT_OPERATIONS,
    isPermittedAgentOperation, DESTRUCTIVE_REFUSAL,
} from './agent-capabilities'
import { TOOLS, validateProposals, isValidRenameTarget, type Proposal } from './files-agent/tools'
import { buildScaffold, flattenScaffold } from './files-agent/scaffold'

describe('the capability boundary', () => {
    /**
     * The guard that has to outlive this session.
     *
     * The agent's three tools are reversible today because nobody has added a fourth. This test is
     * what turns that from a coincidence into a rule: a new tool fails here until someone has gone
     * to `agent-capabilities.ts` and decided, deliberately, that it belongs on the list.
     */
    it('exposes no tool outside the permitted set', () => {
        const toolOperations = TOOLS.map((t) => t.name)
            .map((n) => n.replace(/^propose_/, '').replace(/s$/, ''))
            .map((n) => (n === 'folder' ? 'create-folder' : n))

        for (const operation of toolOperations) {
            expect(
                isPermittedAgentOperation(operation),
                `Tool "${operation}" is not in PERMITTED_AGENT_OPERATIONS. If this operation is `
                + 'genuinely safe and reversible, add it there deliberately — do not change this test.',
            ).toBe(true)
        }
    })

    it('permits exactly rename, move and create-folder', () => {
        expect([...PERMITTED_AGENT_OPERATIONS].sort())
            .toEqual(['create-folder', 'move', 'rename'])
    })

    /** Nothing destructive may creep onto the permitted list. */
    it('permits none of the destructive operations', () => {
        for (const forbidden of FORBIDDEN_AGENT_OPERATIONS) {
            expect(isPermittedAgentOperation(forbidden)).toBe(false)
        }
    })

    it('refuses an unknown operation rather than defaulting to allow', () => {
        expect(isPermittedAgentOperation('')).toBe(false)
        expect(isPermittedAgentOperation('rename-and-delete')).toBe(false)
        expect(isPermittedAgentOperation('RENAME')).toBe(false)
    })

    /** A refusal that leaves the user stuck is worse than one that hands the task back. */
    it('tells the user where they can do it themselves', () => {
        expect(DESTRUCTIVE_REFUSAL).toMatch(/cannot delete/i)
        expect(DESTRUCTIVE_REFUSAL).toMatch(/row menu|Members tab/i)
    })
})

describe('no tool can express a destructive change', () => {
    const nodes = [
        { externalId: 'f1', fileName: 'Report.docx', isFolder: false, parentId: 'root' },
        { externalId: 'd1', fileName: 'Deliverables', isFolder: true, parentId: 'root' },
    ]

    /** Every proposal the validator can emit is one of the three reversible kinds. */
    it('only ever produces rename, move or folder proposals', () => {
        const all: Proposal[] = [
            ...validateProposals('propose_renames', {
                renames: [{ externalId: 'f1', proposedName: 'Client_Report.docx', reason: 'x' }],
            }, nodes).proposals,
            ...validateProposals('propose_moves', {
                moves: [{ externalId: 'f1', destinationFolderId: 'd1', reason: 'x' }],
            }, nodes).proposals,
            ...validateProposals('propose_folders', {
                folders: [{ name: 'Working', parentId: 'd1', reason: 'x' }],
            }, nodes).proposals,
        ]
        expect(all.length).toBeGreaterThan(0)
        for (const p of all) expect(['rename', 'move', 'folder']).toContain(p.kind)
    })

    /** A tool name the agent invents produces nothing at all. */
    it('ignores an unrecognised tool entirely', () => {
        const out = validateProposals('propose_deletions', {
            deletions: [{ externalId: 'f1', reason: 'duplicate' }],
        }, nodes)
        expect(out.proposals).toHaveLength(0)
    })
})

describe('destructive operations reached THROUGH a permitted one', () => {
    const nodes = [
        { externalId: 'd1', fileName: 'Deliverables', isFolder: true, parentId: 'root' },
        { externalId: 'f1', fileName: 'Report.docx', isFolder: false, parentId: 'd1' },
    ]

    /**
     * The subtle one. `findOrCreateFolder` DELETES duplicate siblings when the name is the
     * connector's metadata folder (`.meta`), to keep a single canonical one. So proposing a folder
     * named `.meta` would have the agent cause a delete without ever calling one — the boundary
     * has to cover what an operation does, not only what it is called.
     */
    it('refuses to create the connector metadata folder', () => {
        const out = validateProposals('propose_folders', {
            folders: [{ name: '.meta', parentId: 'd1', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(0)
        expect(out.dropped).toBe(1)
    })

    it('refuses any hidden folder, not just that one', () => {
        for (const name of ['.meta', '.pockett', '.git', '.trash']) {
            const out = validateProposals('propose_folders', {
                folders: [{ name, parentId: 'd1', reason: 'x' }],
            }, nodes)
            expect(out.proposals, `"${name}" should be refused`).toHaveLength(0)
        }
    })

    it('refuses to rename a file into a hidden name', () => {
        const out = validateProposals('propose_renames', {
            renames: [{ externalId: 'f1', proposedName: '.Report.docx', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(0)
    })

    /** The approver cannot type their way past it either. */
    it('refuses a user-supplied hidden name', () => {
        expect(isValidRenameTarget('Report.docx', '.Report.docx')).toBe(false)
    })

    it('still allows ordinary names', () => {
        const out = validateProposals('propose_folders', {
            folders: [{ name: 'Working Papers', parentId: 'd1', reason: 'x' }],
        }, nodes)
        expect(out.proposals).toHaveLength(1)
    })
})

describe('the scaffold cannot produce a reserved name', () => {
    /** Built from fixed sections, but asserted rather than assumed. */
    it('never names a folder with a leading dot', () => {
        for (const kind of ['advisory', 'audit', 'implementation', 'retainer']) {
            for (const numbering of ['numbered-hyphen', 'numbered-underscore', 'plain']) {
                const folders = flattenScaffold(buildScaffold({
                    engagementKind: kind, numbering,
                    reviewStages: 'two-stage', workingPapers: 'yes',
                }))
                for (const f of folders) expect(f.name.startsWith('.')).toBe(false)
            }
        }
    })
})
