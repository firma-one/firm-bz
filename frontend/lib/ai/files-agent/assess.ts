import {
    analyzeFiles, describePattern, FLAT_FOLDER_THRESHOLD, MAX_REASONABLE_DEPTH,
    type AnalysisResult, type FileNode, type FindingKind,
} from './analyze'

/**
 * The one assessment of how well an engagement's files are organized.
 *
 * ## Why this exists
 *
 * Two engines judged the same tree and disagreed: the Files agent's detectors, and the Folder
 * Health score on Overview. They shared thresholds after the last fix but still produced separate
 * verdicts from separate code, so a rule added to one would silently not apply to the other. This
 * is the single function both now go through — findings, summary and score from one pass.
 *
 * ## Why the score is derived from the findings
 *
 * Previously the score was computed from its own metrics while the findings came from the
 * detectors, which is how the two drifted. Here a finding IS the penalty: nothing can be scored
 * that is not also explained, and nothing can be reported without affecting the score. The two
 * cannot disagree because they are the same traversal.
 *
 * Pure: no Prisma, no adapter, no clock. Callers supply the nodes.
 */

/** What each kind of finding costs, and the most it can cost however many times it occurs. */
const PENALTY: Record<FindingKind, { per: number; cap: number }> = {
    // Unambiguous and cheap to fix, so it carries real weight.
    'duplicate-name': { per: 4, cap: 20 },
    // One odd name out of forty is a blemish; half the folder disagreeing is a mess.
    'naming-inconsistent': { per: 3, cap: 18 },
    // Files nobody has filed. The first few are normal, a pile of them is the whole problem.
    'loose-at-root': { per: 2, cap: 20 },
    // A folder doing too much. Few folders, each worth noticing.
    'flat-folder': { per: 6, cap: 12 },
    // Often deliberate — a firm may genuinely file by year, client and phase.
    'deep-nesting': { per: 2, cap: 10 },
}

export interface OrganizationIssue {
    kind: FindingKind
    /** A sentence a person can act on, naming counts rather than ids. */
    label: string
    /** How many files this concerns. */
    count: number
    /** Points this took off the score. */
    penalty: number
    severity: 'info' | 'warning'
    /** Up to a handful of example file names, for a UI that wants to show them. */
    examples: string[]
}

export interface OrganizationAssessment {
    /** 0–100. 100 means nothing was found, not that the tree is beyond improvement. */
    score: number
    fileCount: number
    folderCount: number
    maxDepth: number
    emptyFolderCount: number
    duplicateCount: number
    looseAtRootCount: number
    /** The separator convention in words, or that there is none. */
    naming: string
    /** Share of files following it, 0–1. */
    namingAdherence: number
    issues: OrganizationIssue[]
    /** The raw analysis, for callers that need the nodes behind a finding. */
    analysis: AnalysisResult
}

function labelFor(kind: FindingKind, count: number): string {
    const s = count === 1 ? '' : 's'
    switch (kind) {
        case 'duplicate-name':
            return `${count} file${s} that look like duplicates of each other`
        case 'naming-inconsistent':
            return `${count} file${s} named differently from the rest of their folder`
        case 'loose-at-root':
            return `${count} file${s} sitting outside any folder`
        case 'flat-folder':
            return `${count} file${s} crowded into one folder (more than ${FLAT_FOLDER_THRESHOLD})`
        case 'deep-nesting':
            return `${count} file${s} buried more than ${MAX_REASONABLE_DEPTH} folders deep`
    }
}

/**
 * Assesses a file tree.
 *
 * `rootId` may be the provider's folder id or null; the analyzer infers the real root either way.
 */
export function assessOrganization(
    nodes: FileNode[],
    rootId: string | null = null,
): OrganizationAssessment {
    const analysis = analyzeFiles(nodes, rootId)
    const { summary } = analysis

    let score = 100
    const issues: OrganizationIssue[] = []

    for (const finding of analysis.findings) {
        const { per, cap } = PENALTY[finding.kind]
        const penalty = Math.min(cap, finding.nodes.length * per)
        score -= penalty
        issues.push({
            kind: finding.kind,
            label: labelFor(finding.kind, finding.nodes.length),
            count: finding.nodes.length,
            penalty,
            // Warning once it is past the point of being a stray: a couple of loose files is
            // housekeeping, twenty is the structure not being used.
            severity: penalty >= 10 ? 'warning' : 'info',
            examples: finding.nodes.slice(0, 5).map((n) => n.fileName),
        })
    }

    // Empty folders are worth mentioning but are not a finding: there is no safe fix, since this
    // agent never deletes. Scored lightly so a tidy-up is visible without dominating.
    if (summary.emptyFolderCount > 3) score -= 5

    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        fileCount: summary.fileCount,
        folderCount: summary.folderCount,
        maxDepth: summary.maxDepth,
        emptyFolderCount: summary.emptyFolderCount,
        duplicateCount: summary.duplicateCount,
        looseAtRootCount: analysis.findings
            .filter((f) => f.kind === 'loose-at-root')
            .reduce((n, f) => n + f.nodes.length, 0),
        naming: describePattern(summary.dominantPattern),
        namingAdherence: summary.patternAdherence,
        issues,
        analysis,
    }
}

/**
 * The assessment as prose, for a model prompt.
 *
 * PUSHED into the context rather than offered as a tool the model may call. A tool would cost an
 * extra round trip — the model asks, the server answers, the model thinks again — to deliver text
 * that is already known before the first token is generated, and would let the model skip the
 * assessment entirely and reason from filenames alone. Neither is a trade worth making for a
 * function with no arguments and one answer.
 *
 * Tools earn their round trip when the call is CONDITIONAL (the model decides whether it is needed)
 * or PARAMETERIZED (it decides what to ask). This is neither.
 */
export function renderAssessment(assessment: OrganizationAssessment): string {
    const lines = [
        `ORGANIZATION ASSESSMENT (score ${assessment.score}/100)`,
        `${assessment.fileCount} files in ${assessment.folderCount} folders, `
            + `nesting ${assessment.maxDepth} deep.`,
        `Naming: ${assessment.naming}`
            + (assessment.namingAdherence > 0
                ? ` (${Math.round(assessment.namingAdherence * 100)}% of files that use a separator).`
                : '.'),
    ]
    if (assessment.issues.length === 0) {
        lines.push('No issues found.')
    } else {
        lines.push('Issues, worst first:')
        for (const issue of assessment.issues) {
            lines.push(`- ${issue.label} (-${issue.penalty})`)
        }
    }
    return lines.join('\n')
}

/**
 * The assessment as Markdown, for the chat.
 *
 * Separate from {@link renderAssessment}, which is prose for a model prompt. This is for a person,
 * and it is a TABLE rather than a bespoke stats card: a table renders in the ordinary message flow,
 * works for any later answer that reports the same few fields across several rows, and does not
 * require a new component each time the agent has something structured to say.
 */
export function assessmentMarkdown(a: OrganizationAssessment): string {
    const lines = [
        `Reviewed **${a.fileCount} files** in **${a.folderCount} folders**.`,
        '',
        '| | |',
        '|---|---|',
        `| Files | ${a.fileCount} |`,
        `| Folders | ${a.folderCount} |`,
        `| Duplicates | ${a.duplicateCount} |`,
        `| Max depth | ${a.maxDepth} |`,
    ]
    if (a.emptyFolderCount > 0) lines.push(`| Empty folders | ${a.emptyFolderCount} |`)
    lines.push(`| Naming | ${a.naming}${
        a.namingAdherence > 0 ? ` (${Math.round(a.namingAdherence * 100)}%)` : ''
    } |`)

    if (a.issues.length > 0) {
        lines.push('', 'Worth fixing:')
        for (const issue of a.issues) lines.push(`- ${issue.label}`)
    } else {
        lines.push('', 'Nothing to fix.')
    }
    return lines.join('\n')
}
