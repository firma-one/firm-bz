import 'server-only'
import { prisma } from '@/lib/prisma'
import type { FileNode } from './files-agent/analyze'

/**
 * The engagement's file tree, as prose the chat can answer from.
 *
 * ## Why this exists
 *
 * `buildEngagementContext` gives the model counts and statuses but no file names — deliberately,
 * to keep user-authored text out of the payload. That held while the assistant only reported
 * delivery state. It stopped holding once the Files agent sat beside it reading the whole tree:
 * the chat would say "2 duplicates exist" and be unable to name them, while the button directly
 * above would have listed them. An assistant that reports a problem it cannot describe is worse
 * than one that does not mention it.
 *
 * ## What it still excludes
 *
 * Names and structure only. No document CONTENT, no comment bodies, no member emails — the
 * boundary moves by one step, not away. A file name is a label the firm chose and already shows
 * its client; a document's contents are the client's own material.
 *
 * Shares `FileNode` with the agent so the two halves of the panel cannot describe different trees.
 */

/**
 * Caps how much tree reaches the prompt.
 *
 * Past this the listing stops being something a model can reason over and starts being filler
 * that pushes the rest of the context out. The count is always stated, so a truncated list is
 * visibly truncated rather than silently wrong.
 */
const MAX_FILES_IN_CONTEXT = 300

/** Loads the engagement's files and folders. */
export async function loadEngagementFiles(engagementId: string): Promise<FileNode[]> {
    const docs = await prisma.engagementDocument.findMany({
        where: { engagementId, status: { not: 'ARCHIVED' } },
        select: {
            externalId: true, fileName: true, isFolder: true,
            parentId: true, docId: true, mimeType: true, dueDate: true,
        },
        orderBy: [{ isFolder: 'desc' }, { fileName: 'asc' }],
    })
    return docs.map((d) => ({
        externalId: d.externalId,
        fileName: d.fileName,
        isFolder: d.isFolder,
        parentId: d.parentId,
        docId: d.docId,
        mimeType: d.mimeType,
        dueDate: d.dueDate,
    }))
}

/** Renders a node's path by walking `parentId`, which holds the parent's `externalId`. */
function pathOf(node: FileNode, byId: Map<string, FileNode>): string {
    const parts: string[] = []
    let current = node.parentId
    // Bounded: a cycle in connector data must not hang the request.
    for (let depth = 0; current && depth < 16; depth += 1) {
        const parent = byId.get(current)
        if (!parent) break
        parts.unshift(parent.fileName)
        current = parent.parentId
    }
    return parts.length > 0 ? parts.join('/') : '(root)'
}

/**
 * Formats the tree for the prompt.
 *
 * Grouped by folder rather than listed flat: "which files are in the wrong place" and "what is
 * duplicated here" are both questions about neighbours, and a flat list makes the model infer the
 * grouping it needs from a column of paths.
 */
export function buildFilesContext(nodes: FileNode[]): string {
    if (nodes.length === 0) return ''

    const byId = new Map(nodes.map((n) => [n.externalId, n]))
    const files = nodes.filter((n) => !n.isFolder)
    const folders = nodes.filter((n) => n.isFolder)

    const lines: string[] = [
        '--- FILES ---',
        `${files.length} file${files.length === 1 ? '' : 's'} in ${folders.length} folder${folders.length === 1 ? '' : 's'}.`,
    ]

    // Deliverable folders carry their own due dates, and a folder never appears in the grouped
    // listing below (which is keyed by what is inside it), so they are stated separately.
    //
    // Every deliverable is listed, dated or not. Listing only the dated ones made a missing date
    // invisible: "which deliverables have no due date" is exactly the question a lead asks, and
    // the model cannot name an absence from a list that omits it.
    const deliverables = folders.filter((f) => f.docId)
    if (deliverables.length > 0) {
        lines.push('Deliverables:')
        for (const f of deliverables) {
            const due = f.dueDate
                ? `due ${new Date(f.dueDate).toISOString().slice(0, 10)}`
                : 'NO DUE DATE'
            lines.push(`  ${f.docId} — ${f.fileName} (${due})`)
        }
    }

    const grouped = new Map<string, FileNode[]>()
    for (const f of files.slice(0, MAX_FILES_IN_CONTEXT)) {
        const key = pathOf(f, byId)
        const list = grouped.get(key)
        if (list) list.push(f)
        else grouped.set(key, [f])
    }

    for (const [folderPath, group] of Array.from(grouped.entries())) {
        lines.push(`${folderPath}:`)
        for (const f of group) {
            // The due date rides along with the name: "which files are due this week" is one of
            // the commonest questions about a file tree, and splitting it across two sections
            // would make the model correlate two lists.
            const due = f.dueDate ? ` (due ${new Date(f.dueDate).toISOString().slice(0, 10)})` : ''
            lines.push(`  ${f.docId ? `${f.docId} — ` : ''}${f.fileName}${due}`)
        }
    }

    if (files.length > MAX_FILES_IN_CONTEXT) {
        // Stated rather than silent: the model must not describe a partial list as the whole set.
        lines.push(`(${files.length - MAX_FILES_IN_CONTEXT} further files not listed here.)`)
    }

    // Empty folders are invisible in a listing grouped by their contents, but "this folder has
    // nothing in it" is a real answer to "what is unfinished here".
    const empty = folders.filter((f) => !files.some((x) => x.parentId === f.externalId))
    if (empty.length > 0) {
        lines.push(`Folders with no files: ${empty.slice(0, 20).map((f) => f.fileName).join(', ')}.`)
    }

    return lines.join('\n')
}
