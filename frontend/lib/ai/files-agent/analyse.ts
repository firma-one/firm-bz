/**
 * Deterministic analysis of an engagement's file tree.
 *
 * ## Why this is not a model's job
 *
 * Naming inconsistency, duplicates, flat folders and misplaced files are all decidable by
 * inspection. Asking a model to FIND them costs a call per batch of files and returns a different
 * answer each time; computing them costs nothing and is testable. The model is good at the part
 * that follows — wording the finding and proposing a better name — so that is all it gets.
 *
 * On a 200-file engagement this is the difference between one model call and dozens.
 *
 * Pure and dependency-free so it can be unit tested against fixtures: no Prisma, no `server-only`,
 * no clock. Callers supply the file list.
 */

/** One file or folder, flattened from `EngagementDocument`. */
export interface FileNode {
    /** The connector-side id — what every file operation takes. */
    externalId: string
    fileName: string
    isFolder: boolean
    /**
     * Parent's `externalId`, NOT a uuid and not a foreign key.
     *
     * `EngagementDocument.parentId` holds the connector's id for the parent, so the tree is walked
     * by matching this against other nodes' `externalId` rather than by a database join.
     */
    parentId: string | null
    /** Short human id such as "QSR-54", shown in findings so the user can locate the file. */
    docId?: string | null
    mimeType?: string | null
}

export type FindingKind =
    | 'naming-inconsistent'
    | 'duplicate-name'
    | 'flat-folder'
    | 'deep-nesting'
    | 'loose-at-root'

export interface Finding {
    kind: FindingKind
    /** Files this finding is about. Always non-empty. */
    nodes: FileNode[]
    /** Folder the finding sits in, when it is folder-scoped. */
    folderId?: string | null
    /**
     * What the majority of siblings look like, for naming findings — the pattern the odd ones out
     * should be brought in line with. The model proposes concrete names from this.
     */
    dominantPattern?: NamePattern
    /** Higher sorts first. Set by {@link analyseFiles}, not by the detectors. */
    score: number
}

/**
 * The shape of a filename, ignoring its words.
 *
 * Two files are "consistently named" when these match, which is what lets the analysis flag a
 * minority without needing to understand what the files contain.
 */
export interface NamePattern {
    /** The separator between words: '-', '_', ' ', or '' when there is none. */
    separator: string
    /** Whether the name opens with a numeric prefix such as "01-" or "1_". */
    numberedPrefix: boolean
    /** lower | upper | title | mixed — how the words are cased. */
    casing: 'lower' | 'upper' | 'title' | 'mixed'
}

/** A folder holding more than this many direct files is doing too much on its own. */
const FLAT_FOLDER_THRESHOLD = 25
/** Nesting deeper than this is usually someone recreating a filing cabinet. */
const MAX_REASONABLE_DEPTH = 5
/** Below this many siblings there is no majority to be inconsistent with. */
const MIN_SIBLINGS_FOR_PATTERN = 4
/** A pattern needs at least this share of siblings before the rest count as outliers. */
const DOMINANCE_THRESHOLD = 0.6

/** Strips the extension so "Report.v2.docx" compares as "Report.v2". */
function stem(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * Reduces a filename to its shape.
 *
 * Deliberately ignores the words themselves: "01-Scope-Note" and "02-Client-Brief" share a pattern
 * while "scope note final FINAL.docx" does not, and that is the only comparison this needs to make.
 */
export function namePattern(fileName: string): NamePattern {
    const base = stem(fileName)

    const counts = {
        '-': (base.match(/-/g) ?? []).length,
        '_': (base.match(/_/g) ?? []).length,
        ' ': (base.match(/ /g) ?? []).length,
    }
    const separator = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0) > 0
        ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
        : ''

    const words = separator ? base.split(separator).filter(Boolean) : [base]
    const letters = base.replace(/[^A-Za-z]/g, '')

    const casing: NamePattern['casing'] =
        letters.length === 0 ? 'mixed'
        : letters === letters.toLowerCase() ? 'lower'
        : letters === letters.toUpperCase() ? 'upper'
        : words.every((w) => /^[A-Z0-9]/.test(w)) ? 'title'
        : 'mixed'

    return {
        separator,
        numberedPrefix: /^\d{1,3}[-_. ]/.test(base),
        casing,
    }
}

function patternKey(p: NamePattern): string {
    return `${p.separator}|${p.numberedPrefix}|${p.casing}`
}

/** Groups nodes by their parent folder id. */
function byFolder(nodes: FileNode[]): Map<string | null, FileNode[]> {
    const out = new Map<string | null, FileNode[]>()
    for (const n of nodes) {
        const key = n.parentId
        const list = out.get(key)
        if (list) list.push(n)
        else out.set(key, [n])
    }
    return out
}

/** Depth from the root, by walking `parentId` through the supplied set. */
function depthOf(node: FileNode, byId: Map<string, FileNode>): number {
    let depth = 0
    let current = node.parentId
    // Bounded rather than `while (current)`: a cycle in connector data would otherwise hang the
    // request, and no legitimate tree is this deep.
    while (current && depth < 32) {
        const parent = byId.get(current)
        if (!parent) break
        depth += 1
        current = parent.parentId
    }
    return depth
}

/**
 * Finds files whose naming breaks with their siblings'.
 *
 * Only fires where a clear majority exists: with three files in three styles there is no
 * convention to violate, and flagging all of them would be noise.
 */
function detectNamingInconsistency(nodes: FileNode[]): Finding[] {
    const findings: Finding[] = []

    for (const [folderId, siblings] of Array.from(byFolder(nodes).entries())) {
        const files = siblings.filter((n) => !n.isFolder)
        if (files.length < MIN_SIBLINGS_FOR_PATTERN) continue

        const groups = new Map<string, { pattern: NamePattern; nodes: FileNode[] }>()
        for (const f of files) {
            const p = namePattern(f.fileName)
            const key = patternKey(p)
            const g = groups.get(key)
            if (g) g.nodes.push(f)
            else groups.set(key, { pattern: p, nodes: [f] })
        }
        if (groups.size < 2) continue

        const ranked = Array.from(groups.values()).sort((a, b) => b.nodes.length - a.nodes.length)
        const dominant = ranked[0]
        if (dominant.nodes.length / files.length < DOMINANCE_THRESHOLD) continue

        const outliers = ranked.slice(1).flatMap((g) => g.nodes)
        if (outliers.length === 0) continue

        findings.push({
            kind: 'naming-inconsistent',
            nodes: outliers,
            folderId,
            dominantPattern: dominant.pattern,
            score: 0,
        })
    }

    return findings
}

/**
 * Files sharing a name within one folder.
 *
 * Compared on the stem, so "Report.docx" and "Report.pdf" are NOT duplicates — they are commonly
 * the same document in two formats, which is deliberate rather than a mistake.
 */
function detectDuplicates(nodes: FileNode[]): Finding[] {
    const findings: Finding[] = []

    for (const [folderId, siblings] of Array.from(byFolder(nodes).entries())) {
        const seen = new Map<string, FileNode[]>()
        for (const n of siblings.filter((s) => !s.isFolder)) {
            // The extension is part of the key, so "Report.docx" and "Report.pdf" do NOT collide —
            // the same document exported two ways is deliberate, most often a working copy beside
            // the PDF that went to the client. Separators and case are normalised away, so
            // "Scope Note" and "scope-note" do.
            const ext = n.fileName.slice(stem(n.fileName).length).toLowerCase()
            const key = `${stem(n.fileName).toLowerCase().replace(/[-_ ]/g, '')}${ext}`
            const list = seen.get(key)
            if (list) list.push(n)
            else seen.set(key, [n])
        }
        for (const group of Array.from(seen.values())) {
            if (group.length > 1) {
                findings.push({ kind: 'duplicate-name', nodes: group, folderId, score: 0 })
            }
        }
    }

    return findings
}

/** Folders carrying more loose files than anyone can scan. */
function detectFlatFolders(nodes: FileNode[]): Finding[] {
    const findings: Finding[] = []

    for (const [folderId, siblings] of Array.from(byFolder(nodes).entries())) {
        if (folderId === null) continue
        const files = siblings.filter((n) => !n.isFolder)
        if (files.length > FLAT_FOLDER_THRESHOLD) {
            findings.push({ kind: 'flat-folder', nodes: files, folderId, score: 0 })
        }
    }

    return findings
}

/** Files buried deeper than a reader will go looking. */
function detectDeepNesting(nodes: FileNode[]): Finding[] {
    const byId = new Map(nodes.map((n) => [n.externalId, n]))
    const deep = nodes.filter((n) => !n.isFolder && depthOf(n, byId) > MAX_REASONABLE_DEPTH)
    return deep.length > 0
        ? [{ kind: 'deep-nesting', nodes: deep, score: 0 }]
        : []
}

/**
 * Files sitting at the engagement root rather than in a folder.
 *
 * Only flagged when folders exist to put them in — on an engagement with no structure at all this
 * is how it starts, not a problem.
 */
function detectLooseAtRoot(nodes: FileNode[], rootId: string | null): Finding[] {
    const hasFolders = nodes.some((n) => n.isFolder && n.parentId === rootId)
    if (!hasFolders) return []

    const loose = nodes.filter((n) => !n.isFolder && n.parentId === rootId)
    return loose.length > 0
        ? [{ kind: 'loose-at-root', nodes: loose, folderId: rootId, score: 0 }]
        : []
}

/**
 * How much each kind of finding is worth surfacing.
 *
 * Duplicates lead because they are unambiguous and cheap to act on. Deep nesting trails because it
 * is often deliberate — a firm may genuinely file by year, client and phase.
 */
const KIND_WEIGHT: Record<FindingKind, number> = {
    'duplicate-name': 100,
    'naming-inconsistent': 80,
    'loose-at-root': 60,
    'flat-folder': 40,
    'deep-nesting': 20,
}

export interface AnalysisResult {
    findings: Finding[]
    /** Total files and folders examined, for the credit estimate and the summary line. */
    nodeCount: number
}

/**
 * Runs every detector and ranks the results.
 *
 * Returns findings only — never a proposed fix. Deciding what a file SHOULD be called needs an
 * understanding of what it contains, which is the model's half of this.
 */
export function analyseFiles(nodes: FileNode[], rootId: string | null = null): AnalysisResult {
    const findings = [
        ...detectDuplicates(nodes),
        ...detectNamingInconsistency(nodes),
        ...detectLooseAtRoot(nodes, rootId),
        ...detectFlatFolders(nodes),
        ...detectDeepNesting(nodes),
    ].map((f) => ({
        ...f,
        // Weighted by kind, then nudged by how many files it affects, so a convention broken by
        // eight files outranks one broken by two.
        score: KIND_WEIGHT[f.kind] + Math.min(f.nodes.length, 10),
    }))

    findings.sort((a, b) => b.score - a.score)

    return { findings, nodeCount: nodes.length }
}
