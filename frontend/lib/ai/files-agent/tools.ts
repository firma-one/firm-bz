/**
 * Tool definitions for the Files agent.
 *
 * ## These propose; they never execute
 *
 * The model's tool call produces a BATCH, which is rendered for the Engagement Lead to approve.
 * Nothing touches Drive until a human has seen each line. That is the whole safety model: the
 * agent's worst case is a bad suggestion, not a bad mutation.
 *
 * ## Grounding
 *
 * Every id a tool returns is checked against the file list the model was shown, the same way
 * `search-interpreter.ts` validates entity ids with `byId()`. A model that invents a file id gets
 * that proposal dropped rather than applied to whatever file happens to share the id — which on a
 * connector-side identifier is not a theoretical collision.
 *
 * Pure: no SDK import, no `server-only`. The schemas are data.
 */

import type { FileNode } from './analyse'

/** One proposed rename, after validation. */
export interface RenameProposal {
    kind: 'rename'
    externalId: string
    currentName: string
    proposedName: string
    reason: string
}

/** One proposed move. */
export interface MoveProposal {
    kind: 'move'
    externalId: string
    fileName: string
    /** Destination folder's externalId. Must already exist, or be created by a folder proposal. */
    destinationFolderId: string
    destinationName: string
    reason: string
}

/** One proposed new folder. */
export interface FolderProposal {
    kind: 'folder'
    name: string
    /** Parent folder's externalId, or null for the engagement root. */
    parentId: string | null
    reason: string
}

export type Proposal = RenameProposal | MoveProposal | FolderProposal

export const TOOLS = [
    {
        name: 'propose_renames',
        description:
            'Propose new names for files that break their folder\'s naming convention. '
            + 'Only rename files given in the file list. Keep the file extension unchanged.',
        input_schema: {
            type: 'object' as const,
            properties: {
                renames: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            externalId: { type: 'string', description: 'id of the file, exactly as given in the file list' },
                            proposedName: { type: 'string', description: 'the new filename including its original extension' },
                            reason: { type: 'string', description: 'one short clause saying why, e.g. "matches 01-Scope-Note pattern"' },
                        },
                        required: ['externalId', 'proposedName', 'reason'],
                    },
                },
            },
            required: ['renames'],
        },
    },
    {
        name: 'propose_moves',
        description:
            'Propose moving files into a more appropriate existing folder. '
            + 'Only move files given in the file list, and only into folders given in the file list.',
        input_schema: {
            type: 'object' as const,
            properties: {
                moves: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            externalId: { type: 'string', description: 'id of the file to move' },
                            destinationFolderId: { type: 'string', description: 'id of the destination folder' },
                            reason: { type: 'string', description: 'one short clause saying why' },
                        },
                        required: ['externalId', 'destinationFolderId', 'reason'],
                    },
                },
            },
            required: ['moves'],
        },
    },
    {
        name: 'propose_folders',
        description:
            'Propose new folders to create. Use when files would be better grouped than renamed. '
            + 'parentId must be a folder from the file list, or null for the engagement root.',
        input_schema: {
            type: 'object' as const,
            properties: {
                folders: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'folder name' },
                            parentId: { type: ['string', 'null'], description: 'parent folder id, or null for the root' },
                            reason: { type: 'string', description: 'one short clause saying why' },
                        },
                        required: ['name', 'reason'],
                    },
                },
            },
            required: ['folders'],
        },
    },
] as const

/**
 * Filenames that would be rejected or behave surprisingly on one provider or the other.
 *
 * No leading/trailing-whitespace rule: names are trimmed before they reach here, so such a rule
 * could never fire. Trimming is the better response anyway — a stray space is worth fixing
 * silently, not worth discarding an otherwise good proposal over.
 */
const UNSAFE_NAME = /[\\/:*?"<>|]|^\.{1,2}$/

/**
 * Validates a model's tool call against the files it was actually shown.
 *
 * Drops rather than throws. A single bad proposal in a batch of twelve should cost that one
 * proposal, not the whole run the user has already paid for.
 */
export function validateProposals(
    toolName: string,
    input: unknown,
    nodes: FileNode[],
): { proposals: Proposal[]; dropped: number } {
    const byId = new Map(nodes.map((n) => [n.externalId, n]))
    const args = (input ?? {}) as Record<string, unknown>
    const proposals: Proposal[] = []
    let dropped = 0

    const str = (v: unknown): string | null =>
        typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

    if (toolName === 'propose_renames') {
        for (const raw of Array.isArray(args.renames) ? args.renames : []) {
            const r = (raw ?? {}) as Record<string, unknown>
            const id = str(r.externalId)
            const proposedName = str(r.proposedName)
            const reason = str(r.reason) ?? 'improves consistency'
            const node = id ? byId.get(id) : undefined

            // A rename must target a real file, change something, and produce a name both
            // providers accept. Extension changes are refused outright: renaming .docx to .pdf
            // does not convert the file, it just makes it open wrongly.
            const sameExt = node && proposedName
                && node.fileName.slice(node.fileName.lastIndexOf('.')).toLowerCase()
                    === proposedName.slice(proposedName.lastIndexOf('.')).toLowerCase()

            if (!node || node.isFolder || !proposedName || !sameExt
                || proposedName === node.fileName || UNSAFE_NAME.test(proposedName)) {
                dropped += 1
                continue
            }
            proposals.push({
                kind: 'rename',
                externalId: node.externalId,
                currentName: node.fileName,
                proposedName,
                reason,
            })
        }
    }

    if (toolName === 'propose_moves') {
        for (const raw of Array.isArray(args.moves) ? args.moves : []) {
            const m = (raw ?? {}) as Record<string, unknown>
            const node = str(m.externalId) ? byId.get(str(m.externalId)!) : undefined
            const dest = str(m.destinationFolderId) ? byId.get(str(m.destinationFolderId)!) : undefined

            // Destination must be a real folder, and must not be where the file already is.
            // Moving a folder into its own descendant would orphan a subtree, so folders are not
            // movable here at all — restructuring happens by creating and moving files.
            if (!node || node.isFolder || !dest || !dest.isFolder || node.parentId === dest.externalId) {
                dropped += 1
                continue
            }
            proposals.push({
                kind: 'move',
                externalId: node.externalId,
                fileName: node.fileName,
                destinationFolderId: dest.externalId,
                destinationName: dest.fileName,
                reason: str(m.reason) ?? 'better grouped here',
            })
        }
    }

    if (toolName === 'propose_folders') {
        for (const raw of Array.isArray(args.folders) ? args.folders : []) {
            const f = (raw ?? {}) as Record<string, unknown>
            const name = str(f.name)
            const parentRaw = str(f.parentId)
            const parent = parentRaw ? byId.get(parentRaw) : undefined

            // A named parent must exist and be a folder; an absent one means the engagement root.
            if (!name || UNSAFE_NAME.test(name) || (parentRaw && (!parent || !parent.isFolder))) {
                dropped += 1
                continue
            }
            proposals.push({
                kind: 'folder',
                name,
                parentId: parent?.externalId ?? null,
                reason: str(f.reason) ?? 'groups related files',
            })
        }
    }

    return { proposals, dropped }
}
