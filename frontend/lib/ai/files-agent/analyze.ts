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
    /** Deliverable due date, when one is set. Carried for the chat context, not the detectors. */
    dueDate?: Date | string | null
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
    /** Higher sorts first. Set by {@link analyzeFiles}, not by the detectors. */
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

/**
 * Shared thresholds for what counts as badly organized.
 *
 * Exported because TWO engines judge the same tree: this one, behind the Files agent, and the
 * Folder Health score on Overview (`lib/insights/engagement-insights.ts`). They were written
 * separately and disagreed — Overview called a folder at depth 3 "deeply nested" while the agent
 * considered anything under 6 fine, so the same engagement could be told its structure was both a
 * problem and not one, on two tabs of the same page.
 *
 * One definition, imported by both. A number that only one engine uses still belongs here, so the
 * next person adding a rule sees what the other side already counts.
 */

/** A folder holding more than this many direct files is doing too much on its own. */
export const FLAT_FOLDER_THRESHOLD = 25
/**
 * Nesting deeper than this is usually someone recreating a filing cabinet.
 *
 * Five, not three: three levels is "Deliverables / 01-Report / Draft", which is an ordinary and
 * well-organized engagement. Overview previously penalized exactly that.
 */
export const MAX_REASONABLE_DEPTH = 5
/** Below this many siblings there is no majority to be inconsistent with. */
const MIN_SIBLINGS_FOR_PATTERN = 4
/** A pattern needs at least this share of siblings before the rest count as outliers. */
const DOMINANCE_THRESHOLD = 0.6

/**
 * Reduces a stem to what a human would call "the same name".
 *
 * Beyond case and separators this strips the COPY SUFFIX that browsers and file managers append —
 * `(1)`, ` copy`, ` copy 2`. Without this, `Interviewer_Question_Bank (1).docx` and
 * `Interviewer_Question_Bank.docx` hashed to different keys and the single most common real
 * duplicate in any engagement — the same file downloaded twice — was never detected. That is the
 * case the duplicate detector most needs to catch, and it was the one case it could not.
 */
function normalizeStem(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/\s+copy(\s+\d+)?\s*$/, '')
        .replace(/[-_ ]/g, '')
}

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

    // Counted on the PREFIX DELIMITER first, then overall frequency.
    //
    // "01__Market & Competitive Intelligence Report" has two underscores and four spaces, so a
    // plain frequency count calls its separator " " while "04__Launch Readiness Kit" — same
    // convention, fewer words — comes out "_". The two then look like different naming styles and
    // the detector either flags a consistent set or, as here, finds no majority and stays silent.
    // What actually carries the convention is the delimiter after the numeric prefix.
    const prefixDelimiter = /^\d{1,3}([-_. ]+)/.exec(base)?.[1]?.[0]

    const counts = {
        '-': (base.match(/-/g) ?? []).length,
        '_': (base.match(/_/g) ?? []).length,
        ' ': (base.match(/ /g) ?? []).length,
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const separator = prefixDelimiter && prefixDelimiter !== '.'
        ? prefixDelimiter
        : (ranked[0]?.[1] ?? 0) > 0 ? ranked[0][0] : ''

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
/**
 * The separator convention a set of files follows, and how widely.
 *
 * ONE implementation, used by both the detector and the summary. They previously each computed
 * this, and a fix to the detector left the summary reporting "no single naming convention" for a
 * folder the detector had just found a convention in — the comment claiming they agreed was all
 * that kept them in step, and a comment is not a mechanism.
 *
 * Grouped by separator, and measured only across files that HAVE one: a single-word name like
 * "sample.json" follows no convention and cannot break one, so counting it drags the share down
 * and hides a real majority.
 */
export function dominantSeparator(files: FileNode[]): {
    pattern: NamePattern | null
    adherence: number
    /** Files that carry a separator at all — the denominator for {@link adherence}. */
    participating: number
    groups: Map<string, { pattern: NamePattern; nodes: FileNode[] }>
} {
    const groups = new Map<string, { pattern: NamePattern; nodes: FileNode[] }>()
    for (const f of files) {
        if (f.isFolder) continue
        const pattern = namePattern(f.fileName)
        if (pattern.separator === '') continue
        const g = groups.get(pattern.separator)
        if (g) g.nodes.push(f)
        else groups.set(pattern.separator, { pattern, nodes: [f] })
    }

    const participating = Array.from(groups.values()).reduce((n, g) => n + g.nodes.length, 0)
    const ranked = Array.from(groups.values()).sort((a, b) => b.nodes.length - a.nodes.length)
    const top = ranked[0]
    const adherence = top && participating > 0 ? top.nodes.length / participating : 0

    return {
        pattern: adherence >= DOMINANCE_THRESHOLD ? top.pattern : null,
        adherence,
        participating,
        groups,
    }
}

function detectNamingInconsistency(nodes: FileNode[]): Finding[] {
    const findings: Finding[] = []

    for (const [folderId, siblings] of Array.from(byFolder(nodes).entries())) {
        const files = siblings.filter((n) => !n.isFolder)
        if (files.length < MIN_SIBLINGS_FOR_PATTERN) continue

        const { pattern, groups } = dominantSeparator(files)
        if (groups.size < 2 || !pattern) continue

        const ranked = Array.from(groups.values()).sort((a, b) => b.nodes.length - a.nodes.length)
        const outliers = ranked.slice(1).flatMap((g) => g.nodes)
        if (outliers.length === 0) continue

        findings.push({
            kind: 'naming-inconsistent',
            nodes: outliers,
            folderId,
            dominantPattern: pattern,
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
            const key = `${normalizeStem(stem(n.fileName))}${ext}`
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
/**
 * The top of the tree AS THE DATA ACTUALLY HAS IT.
 *
 * `connectorRootFolderId` is the engagement's root in the PROVIDER's numbering, and on real data it
 * matches no document's `parentId` at all — the root folder itself is not stored as a document, so
 * its id never appears as anyone's parent. Trusting it made `detectLooseAtRoot` return zero on
 * every engagement ever reviewed: twenty loose files at the root of a live engagement were
 * invisible, and the review reported nothing wrong with them.
 *
 * So the root is derived instead: the parent id shared by nodes that have no parent WITHIN this
 * set. A node whose `parentId` names something not in `nodes` is at the top as far as this
 * engagement is concerned, whatever the provider calls that folder.
 */
export function inferRootId(nodes: FileNode[]): string | null {
    const known = new Set(nodes.map((n) => n.externalId))
    const counts = new Map<string | null, number>()
    for (const n of nodes) {
        if (n.parentId === null || !known.has(n.parentId)) {
            counts.set(n.parentId, (counts.get(n.parentId) ?? 0) + 1)
        }
    }
    if (counts.size === 0) return null
    // The most common orphan parent. A tree has exactly one top in practice, but a partial sync can
    // leave a stray pointing elsewhere, and that stray must not be mistaken for the root.
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Files sitting at the top of the engagement rather than in a folder.
 *
 * `rootId` is honoured when it actually appears in the tree and inferred otherwise, so a caller
 * passing the provider's id gets the right answer either way.
 */
function detectLooseAtRoot(nodes: FileNode[], rootId: string | null): Finding[] {
    const known = new Set(nodes.map((n) => n.externalId))
    const root = (rootId !== null && nodes.some((n) => n.parentId === rootId))
        ? rootId
        : inferRootId(nodes)

    const atRoot = (n: FileNode) => n.parentId === root || (n.parentId !== null && !known.has(n.parentId) && root === null)

    // Only a concern once there ARE folders: an engagement with everything in one flat list has
    // not been organized yet, which is a different observation from files left outside a structure
    // that exists.
    const hasFolders = nodes.some((n) => n.isFolder && atRoot(n))
    if (!hasFolders) return []

    const loose = nodes.filter((n) => !n.isFolder && atRoot(n))
    return loose.length > 0
        ? [{ kind: 'loose-at-root', nodes: loose, folderId: root, score: 0 }]
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

/**
 * What the review found to be TRUE, as opposed to wrong.
 *
 * A clean result still has to say something. "Checked 58 files — nothing to fix" tells the lead
 * nothing they can act on or trust: it is indistinguishable from a review that silently failed, and
 * it hides the thing they actually want confirmed — that the convention they chose is being
 * followed. Reporting the counts and the detected convention makes a clean result evidence rather
 * than an absence.
 */
export interface AnalysisSummary {
    fileCount: number
    folderCount: number
    /** Deepest nesting level in the tree, root being 0. */
    maxDepth: number
    /** Folders holding no files or folders at all. */
    emptyFolderCount: number
    duplicateCount: number
    /**
     * The naming convention the majority of named files follow, when one is clear.
     *
     * Null when the tree is too small or too varied for a majority to exist — stated as "no single
     * convention" rather than invented.
     */
    dominantPattern: NamePattern | null
    /** Share of files matching {@link dominantPattern}, 0–1. */
    patternAdherence: number
}

export interface AnalysisResult {
    findings: Finding[]
    /** Total files and folders examined, for the credit estimate and the summary line. */
    nodeCount: number
    /** Always present, findings or not — see {@link AnalysisSummary}. */
    summary: AnalysisSummary
}

/** Describes a {@link NamePattern} the way a person would say it aloud. */
export function describePattern(p: NamePattern | null): string {
    if (!p) return 'no single naming convention'
    // ONLY the separator. The pattern object belongs to whichever file happened to land in the
    // group first, so its casing and prefix flags describe that one file, not the group — the
    // summary read "underscores, Title Case, numbered prefixes" for a folder that is mostly
    // lowercase and almost entirely unnumbered. Stating only what was actually measured.
    return p.separator === '-' ? 'hyphens'
        : p.separator === '_' ? 'underscores'
        : p.separator === ' ' ? 'spaces'
        : 'no separator'
}

/** The deterministic half of a clean report. */
function summarize(nodes: FileNode[], findings: Finding[]): AnalysisSummary {
    const byId = new Map(nodes.map((n) => [n.externalId, n]))
    const files = nodes.filter((n) => !n.isFolder)
    const folders = nodes.filter((n) => n.isFolder)

    const withChildren = new Set(nodes.map((n) => n.parentId).filter(Boolean) as string[])

    // The SAME function the detector uses, so the two cannot report different conventions for the
    // same tree — which is exactly what happened when each had its own copy.
    const naming = dominantSeparator(files)

    return {
        fileCount: files.length,
        folderCount: folders.length,
        maxDepth: nodes.reduce((max, n) => Math.max(max, depthOf(n, byId)), 0),
        emptyFolderCount: folders.filter((f) => !withChildren.has(f.externalId)).length,
        duplicateCount: findings
            .filter((f) => f.kind === 'duplicate-name')
            .reduce((sum, f) => sum + f.nodes.length, 0),
        dominantPattern: naming.pattern,
        patternAdherence: naming.adherence,
    }
}

/**
 * Runs every detector and ranks the results.
 *
 * Returns findings only — never a proposed fix. Deciding what a file SHOULD be called needs an
 * understanding of what it contains, which is the model's half of this.
 */
export function analyzeFiles(nodes: FileNode[], rootId: string | null = null): AnalysisResult {
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

    return { findings, nodeCount: nodes.length, summary: summarize(nodes, findings) }
}
