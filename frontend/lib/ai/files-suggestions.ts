import { analyzeFiles, type FileNode, type FindingKind } from './files-agent/analyze'

/**
 * Starting prompts for the assistant on the Files page.
 *
 * ## Why not the engagement set
 *
 * The Files panel reuses the chat component, which defaults to `buildChatSuggestions` — questions
 * about overdue deliverables and health scores. Those are the right questions on Overview and the
 * wrong ones here: someone looking at a file tree is asking about files. Worse, the Overview
 * builder needs an insights payload the Files page does not load, so it fell through to generic
 * fallbacks with no engagement signal behind them at all.
 *
 * ## Every suggestion is earned
 *
 * Each candidate is gated on a finding actually being present, the same rule the engagement
 * suggestions follow: a chip offering "find the duplicates" on a tree with none costs a credit to
 * answer "there are none", and teaches the user the chips are decoration.
 *
 * Pure — no model call, no `server-only`, no database. The analysis is already computed.
 */

export const MAX_FILE_SUGGESTIONS = 4

/** What to ask when a given finding is present. Ordered by how actionable the answer is. */
const BY_FINDING: Array<{ kind: FindingKind; score: number; question: (count: number) => string }> = [
    {
        kind: 'duplicate-name',
        score: 100,
        question: (n) => n > 2 ? 'Which files look like duplicates?' : 'Which two files are duplicates?',
    },
    {
        kind: 'naming-inconsistent',
        score: 90,
        question: () => "Which files don't follow the naming convention?",
    },
    {
        kind: 'loose-at-root',
        score: 80,
        question: () => 'Which files are sitting outside a folder?',
    },
    {
        kind: 'flat-folder',
        score: 60,
        question: () => 'Which folder has too many loose files to scan?',
    },
    {
        kind: 'deep-nesting',
        score: 40,
        question: () => 'Which files are buried too deep to find?',
    },
]

/**
 * Asked when no finding fires.
 *
 * Every one is answerable from what this panel actually holds — the full file listing with its
 * deliverable folders, due dates and comment counts. Generic prompts like "how are these files
 * organized?" waste the slot: they invite a summary of the page the panel is sitting on top of.
 *
 * Ordered by what a lead opening the Files tab is most likely to be checking, and scored below
 * every finding so a real problem always takes the slot first.
 */
const FALLBACKS: Array<{ score: number; question: string }> = [
    { score: 9, question: "Which deliverables are due soonest, and are their documents ready?" },
    { score: 8, question: 'Which deliverable folders are still empty?' },
    { score: 7, question: 'Which documents still need a due date?' },
    { score: 6, question: 'Which deliverables have comments waiting on a reply?' },
    { score: 5, question: 'What was added here most recently?' },
]

/**
 * Builds the starting prompts for the Files panel.
 *
 * `asked` drops questions already put this session, so the row stays useful rather than repeating
 * what is answered above it.
 */
export function buildFilesSuggestions(
    nodes: FileNode[],
    rootId: string | null = null,
    asked: Set<string> = new Set(),
): string[] {
    if (nodes.length === 0) return []

    const { findings } = analyzeFiles(nodes, rootId)
    const countByKind = new Map<FindingKind, number>()
    for (const f of findings) {
        countByKind.set(f.kind, (countByKind.get(f.kind) ?? 0) + f.nodes.length)
    }

    const candidates: Array<{ score: number; question: string }> = []

    for (const entry of BY_FINDING) {
        const count = countByKind.get(entry.kind)
        if (count) candidates.push({ score: entry.score, question: entry.question(count) })
    }

    // Not a finding — the analyzer looks at structure and naming, not dates — but it is a real
    // signal and the commonest planning gap on an engagement. Gated rather than offered always:
    // asking it where every deliverable is dated costs a credit to be told "none".
    //
    // Scored above the structural findings: a deliverable the client is waiting on with no date
    // matters more than a folder with too many files in it.
    const undated = nodes.filter((n) => n.isFolder && n.docId && !n.dueDate)
    if (undated.length > 0) {
        candidates.push({
            score: 95,
            question: undated.length === 1
                ? 'Which deliverable has no due date set?'
                : 'Which deliverables have no due date set?',
        })
    }

    candidates.push(...FALLBACKS)

    const seen = new Set<string>()
    return candidates
        .sort((a, b) => b.score - a.score)
        .map((c) => c.question)
        .filter((q) => {
            if (asked.has(q) || seen.has(q)) return false
            seen.add(q)
            return true
        })
        .slice(0, MAX_FILE_SUGGESTIONS)
}
