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

import type { FileNode } from './analyze'

/**
 * Where a file lives and what it is called in the UI.
 *
 * Carried on every proposal because a question naming only the filename — `Rename
 * "01-Content-Archive.docx"?` — does not say WHICH of fifty-eight items it means, and a lead
 * approving a change to a client's files should not have to go and find out. These are display
 * fields only: they are absent from the approval token's canonical form (see `approval.ts`), so
 * adding them cannot alter a digest or invalidate a signed batch.
 */
export interface ProposalLocation {
    /** The short human id, such as "QSR-49". Null for a file the platform has not issued one for. */
    docId: string | null
    /** Folder path from the engagement root, such as "Internal/Working". Empty at the root. */
    path: string
}

/** One proposed rename, after validation. */
export interface RenameProposal extends ProposalLocation {
    kind: 'rename'
    externalId: string
    currentName: string
    proposedName: string
    reason: string
}

/** One proposed move. */
export interface MoveProposal extends ProposalLocation {
    kind: 'move'
    externalId: string
    fileName: string
    /** Destination folder's externalId. Must already exist, or be created by a folder proposal. */
    destinationFolderId: string
    destinationName: string
    reason: string
}

/** One proposed new folder. */
export interface FolderProposal extends ProposalLocation {
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
 * Names the agent must never create or rename onto, whatever the model proposes.
 *
 * `.meta` is the one that matters, and it is subtle: `findOrCreateFolder` DELETES duplicate
 * sibling folders when the name is the connector's metadata folder, to keep a single canonical
 * one. That makes "create a folder called .meta" a destructive operation reached through a
 * permitted one — the agent never calls delete, but it can cause one. The capability boundary has
 * to cover what an operation DOES, not only what it is named.
 *
 * Any dot-prefixed name is refused rather than just this one: hidden folders are infrastructure,
 * never something a filing convention asks for, and the next reserved name will also start with a
 * dot.
 */
const RESERVED_NAME = /^\./

/**
 * Validates a model's tool call against the files it was actually shown.
 *
 * Drops rather than throws. A single bad proposal in a batch of twelve should cost that one
 * proposal, not the whole run the user has already paid for.
 */
/**
 * Whether a user-supplied replacement name may be applied to a file.
 *
 * The approval token signs each proposal's exact content, so a name the USER typed cannot ride in
 * on a token minted for the agent's suggestion — it would be rejected as an altered batch, which is
 * correct. This is the server-side check that lets such a rename be accepted deliberately instead:
 * the same rules the agent's own proposals pass, applied to a name a person chose.
 *
 * Same extension, actually different, and legal on both providers. The extension rule matters most
 * here: a person renaming "Report.docx" to "Report.pdf" has not converted anything, they have made
 * the file open wrongly.
 */
/**
 * A stable identity for a proposal, since proposals carry no id of their own.
 *
 * Shared by the client and the apply route so an override can be paired to its proposal without
 * trusting array order — a client reordering the array must not be able to redirect a replacement
 * name onto a different file.
 */
/** A leading sequence number, such as "01-" or "02_". */
const SEQUENCE_PREFIX = /^(\d{1,3})[-_. ]/

/**
 * Whether a rename would discard information rather than restyle it.
 *
 * A convention change should alter separators and casing, never content. The model, told a folder's
 * pattern had "no number prefix", renamed "01-Content-Archive.docx" to "content_archive.docx" —
 * correct about the separator and wrong about everything else, because it dropped a sequence number
 * that was someone's deliberate ordering.
 *
 * Checked structurally rather than left to the prompt: an instruction is advice, and this is the
 * kind of loss a person approving forty renames at a glance would not catch.
 */
export function losesInformation(currentName: string, proposedName: string): boolean {
    const current = SEQUENCE_PREFIX.exec(currentName)
    if (!current) return false
    const next = SEQUENCE_PREFIX.exec(proposedName)
    // The prefix must survive, and must still be the same number — "01-" becoming "02_" is a
    // reordering nobody asked for.
    return !next || Number(next[1]) !== Number(current[1])
}

/**
 * Folder path from the engagement root, walking `parentId` through the supplied set.
 *
 * `parentId` holds the PARENT'S externalId rather than a uuid, so the walk is by lookup in this
 * map and stops at the first id that is not in it — which is the root, since the root folder is not
 * stored as a document.
 */
function pathOf(node: FileNode | undefined, byId: Map<string, FileNode>): string {
    if (!node) return ''
    const parts: string[] = []
    let current = node.parentId
    // Bounded: a cycle in connector data would otherwise hang the request.
    for (let i = 0; current && i < 32; i += 1) {
        const parent = byId.get(current)
        if (!parent) break
        parts.unshift(parent.fileName)
        current = parent.parentId
    }
    return parts.join('/')
}

export function proposalKey(p: Proposal): string {
    return p.kind === 'rename' ? `r:${p.externalId}`
        : p.kind === 'move' ? `m:${p.externalId}`
        : `f:${p.parentId ?? 'root'}:${p.name}`
}

export function isValidRenameTarget(
    currentName: string,
    proposedName: string,
    /**
     * Names already in that folder, excluding the file being renamed.
     *
     * Optional only so existing callers that cannot see the folder still get the format checks;
     * the apply route passes it, because a user can type the name of a file sitting right beside
     * this one just as easily as the agent can propose it.
     */
    siblingNames: readonly string[] = [],
): boolean {
    const next = proposedName.trim()
    if (!next || next === currentName || UNSAFE_NAME.test(next) || RESERVED_NAME.test(next)) return false
    // Case-insensitive: both providers treat "Report.docx" and "REPORT.docx" as one name.
    if (siblingNames.some((n) => n.toLowerCase() === next.toLowerCase())) return false
    const ext = (name: string) => {
        const dot = name.lastIndexOf('.')
        return dot > 0 ? name.slice(dot).toLowerCase() : ''
    }
    return ext(currentName) === ext(next)
}

export function validateProposals(
    toolName: string,
    input: unknown,
    nodes: FileNode[],
): { proposals: Proposal[]; dropped: number } {
    const byId = new Map(nodes.map((n) => [n.externalId, n]))
    const args = (input ?? {}) as Record<string, unknown>
    const proposals: Proposal[] = []
    let dropped = 0

    /**
     * Names already taken in a folder, so a proposal cannot collide with one.
     *
     * The validator checked a proposed name against the file's OWN name and nothing else, so
     * renaming "Report (1).docx" to "Report.docx" — exactly what a de-duplicating rename wants to
     * do — was accepted while "Report.docx" sat beside it. Both providers would then either refuse
     * the rename or silently produce a second file with the same name, which is the problem the
     * rename was meant to fix.
     *
     * Compared case-insensitively: Drive and OneDrive both treat "Report.docx" and "REPORT.docx"
     * as the same name, so accepting one because the bytes differ would hand the provider a
     * collision anyway.
     *
     * Names claimed by THIS batch count too — two renames proposed toward one name are a collision
     * the moment the second is applied.
     */
    const takenByFolder = new Map<string | null, Set<string>>()
    for (const n of nodes) {
        const set = takenByFolder.get(n.parentId) ?? new Set<string>()
        set.add(n.fileName.toLowerCase())
        takenByFolder.set(n.parentId, set)
    }
    const isTaken = (parentId: string | null, name: string) =>
        takenByFolder.get(parentId)?.has(name.toLowerCase()) ?? false
    const claim = (parentId: string | null, name: string) => {
        const set = takenByFolder.get(parentId) ?? new Set<string>()
        set.add(name.toLowerCase())
        takenByFolder.set(parentId, set)
    }
    /** Frees the name a file is about to stop using, so a swap within a folder stays possible. */
    const release = (parentId: string | null, name: string) => {
        takenByFolder.get(parentId)?.delete(name.toLowerCase())
    }

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
                || proposedName === node.fileName || UNSAFE_NAME.test(proposedName)
                || RESERVED_NAME.test(proposedName)
                // Not onto a name the folder already holds.
                || isTaken(node.parentId, proposedName)
                // Not at the cost of a sequence prefix the file already carries.
                || losesInformation(node.fileName, proposedName)) {
                dropped += 1
                continue
            }
            // The old name is given up and the new one taken, in that order, so a later proposal in
            // the same batch sees the folder as it will actually be.
            release(node.parentId, node.fileName)
            claim(node.parentId, proposedName)
            proposals.push({
                kind: 'rename',
                externalId: node.externalId,
                currentName: node.fileName,
                proposedName,
                reason,
                docId: node.docId ?? null,
                path: pathOf(node, byId),
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
            if (!node || node.isFolder || !dest || !dest.isFolder || node.parentId === dest.externalId
                // A file carries its name into the destination, so a folder already holding that
                // name is the same collision a rename would cause.
                || isTaken(dest.externalId, node.fileName)) {
                dropped += 1
                continue
            }
            release(node.parentId, node.fileName)
            claim(dest.externalId, node.fileName)
            proposals.push({
                kind: 'move',
                externalId: node.externalId,
                fileName: node.fileName,
                destinationFolderId: dest.externalId,
                destinationName: dest.fileName,
                reason: str(m.reason) ?? 'better grouped here',
                docId: node.docId ?? null,
                // Where it is NOW. The destination is already named separately, and the question
                // is "move it from where?".
                path: pathOf(node, byId),
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
            // A folder whose name is already taken where it would be created: the provider either
            // refuses it or silently returns the existing one, so proposing it is at best a no-op.
            if (!name || UNSAFE_NAME.test(name) || RESERVED_NAME.test(name)
                || (parentRaw && (!parent || !parent.isFolder))
                || isTaken(parent?.externalId ?? null, name)) {
                dropped += 1
                continue
            }
            claim(parent?.externalId ?? null, name)
            proposals.push({
                kind: 'folder',
                name,
                parentId: parent?.externalId ?? null,
                reason: str(f.reason) ?? 'groups related files',
                // A folder that does not exist yet has no docId; its path is where it will go.
                docId: null,
                path: parent ? [pathOf(parent, byId), parent.fileName].filter(Boolean).join('/') : '',
            })
        }
    }

    return { proposals, dropped }
}
