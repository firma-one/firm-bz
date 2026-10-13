import type { FolderProposal } from './tools'

/**
 * Folder structures for a new engagement, from a fixed set of questions.
 *
 * ## Why the questions are fixed and the tree is computed
 *
 * The interview costs nothing and never surprises: a model asked to invent questions will ask
 * something it then ignores, and a model asked to invent a tree returns a different one each time,
 * which is the opposite of what a filing convention is for. Firms want the same structure on every
 * engagement of a kind — that is the whole value — so the structure is DERIVED here, deterministic
 * and testable, from answers to questions that never change.
 *
 * The agent's judgement is spent on the review (what is wrong with an existing tree), not on this.
 *
 * ## Applied over whatever is already there
 *
 * Scaffolding is additive. `findOrCreateFolder` is idempotent, so running this on an engagement
 * that already has folders adds what is missing and leaves the rest alone. Nothing is renamed,
 * moved or deleted — an engagement mid-flight must not have its existing structure rearranged
 * because someone ran the scaffold.
 *
 * Pure and dependency-free so it can be unit tested: no Prisma, no adapter, no clock.
 */

export type ScaffoldQuestionId =
    | 'engagementKind'
    | 'workingPapers'
    | 'numbering'

export interface ScaffoldQuestion {
    id: ScaffoldQuestionId
    question: string
    options: Array<{ value: string; label: string; description?: string; recommended?: boolean }>
}

/**
 * The interview, in order.
 *
 * Five questions is the ceiling: past that people stop reading and start clicking the first option,
 * which produces a structure nobody chose. Each one has to change the resulting tree, or it is a
 * question not worth asking.
 */
export const SCAFFOLD_QUESTIONS: ScaffoldQuestion[] = [
    {
        id: 'engagementKind',
        // Deliberately NO recommendation. Only the firm knows what kind of engagement this is, and
        // suggesting one would be guessing at a fact rather than advising on a choice — the user
        // cannot tell a considered recommendation from a default, so an empty one misleads.
        question: 'What kind of engagement is this?',
        options: [
            { value: 'advisory', label: 'Advisory or consulting', description: 'Analysis, recommendations, a report' },
            { value: 'audit', label: 'Audit or assurance', description: 'Testing, evidence, a signed opinion' },
            { value: 'implementation', label: 'Implementation or delivery', description: 'Build, migrate, roll out' },
            { value: 'retainer', label: 'Ongoing retainer', description: 'Recurring work with no fixed end' },
            { value: 'product', label: 'Product or platform build', description: 'Research, specify, build, hand over' },
        ],
    },
    {
        id: 'workingPapers',
        // Recommended: keeping workings out of the deliverable folder is what stops a spreadsheet
        // of calculations being shared alongside the report it supports.
        options: [
            {
                value: 'yes',
                label: 'Yes — a separate Working Papers folder',
                description: 'Keeps calculations out of the folder you share',
                recommended: true,
            },
            { value: 'no', label: 'No — keep them with their deliverable' },
        ],
        // Also phrased as a folder question. "Do you keep working papers?" asked about the firm's
        // practice, which is not what the answer changes — it decides whether one folder is made.
        question: 'Should source data and workings have their own folder?',
    },
    {
        id: 'numbering',
        // Recommended: numbering is what makes a folder list read in its intended order rather than
        // alphabetically. Hyphens over underscores is a coin toss, so the pairing is arbitrary and
        // the other two options are equally legitimate.
        question: 'How should folders be named?',
        options: [
            { value: 'numbered-hyphen', label: '01-Planning', description: 'Numbered, hyphens', recommended: true },
            { value: 'numbered-underscore', label: '01_Planning', description: 'Numbered, underscores' },
            { value: 'plain', label: 'Planning', description: 'No numbering' },
        ],
    },
]

export type ScaffoldAnswers = Partial<Record<ScaffoldQuestionId, string>>

/** A folder in the planned tree. Children are created after their parent. */
export interface ScaffoldFolder {
    name: string
    /** Why this folder is in the tree, shown in the preview. */
    purpose: string
    children?: ScaffoldFolder[]
}

/** The top-level sections each engagement kind gets, before options are applied. */
const BASE_SECTIONS: Record<string, Array<{ name: string; purpose: string }>> = {
    advisory: [
        { name: 'Planning', purpose: 'Scope, plan and kickoff material' },
        { name: 'Research', purpose: 'Inputs gathered before analysis' },
        { name: 'Analysis', purpose: 'Working analysis behind the recommendations' },
        { name: 'Deliverables', purpose: 'What the client receives' },
    ],
    audit: [
        { name: 'Planning', purpose: 'Scope, risk assessment and audit plan' },
        { name: 'Evidence', purpose: 'Support obtained during fieldwork' },
        { name: 'Testing', purpose: 'Procedures performed and their results' },
        { name: 'Reporting', purpose: 'The opinion and everything supporting it' },
    ],
    implementation: [
        { name: 'Planning', purpose: 'Scope, plan and resourcing' },
        { name: 'Requirements', purpose: 'What is being built, as agreed' },
        { name: 'Build', purpose: 'Work in progress' },
        { name: 'Testing', purpose: 'Acceptance and sign-off evidence' },
        { name: 'Handover', purpose: 'What the client takes ownership of' },
    ],
    retainer: [
        { name: 'Agreements', purpose: 'The retainer terms and any changes to them' },
        { name: 'Monthly', purpose: 'Work organized by period' },
        { name: 'Deliverables', purpose: 'What the client receives' },
    ],
    // A build that starts with discovery — the shape where research, a specification and
    // construction are phases of ONE engagement rather than two engagements running together.
    //
    // Added because the four kinds above forced that work to be filed as either advisory or
    // implementation, losing half the structure each way. Merging the two trees instead was
    // considered and rejected: a union is eight flat top-level folders in no defensible order,
    // which the review's own crowding and ordering rules would then complain about. One ordered
    // tree beats two glued together.
    product: [
        { name: 'Discovery', purpose: 'Research and validation before anything is specified' },
        { name: 'Requirements', purpose: 'What is being built, as agreed' },
        { name: 'Design', purpose: 'Flows, wireframes and visual design' },
        { name: 'Build', purpose: 'Work in progress' },
        { name: 'Testing', purpose: 'Acceptance and sign-off evidence' },
        { name: 'Handover', purpose: 'What the client takes ownership of' },
    ],
}

/**
 * The engagement kinds the builder knows, derived from the branches it actually has.
 *
 * Exported so the review route can validate a supplied kind against the same list, rather than
 * letting an arbitrary string reach `buildScaffold` and silently take the 'advisory' fallback —
 * which would propose the wrong folders while looking like it had worked.
 */
export const ENGAGEMENT_KINDS: readonly string[] = Object.keys(BASE_SECTIONS)

/** The naming conventions this can actually produce. Anything else falls back to plain. */
const KNOWN_CONVENTIONS = new Set(['numbered-hyphen', 'numbered-underscore', 'plain'])

/** Applies the chosen naming convention to a top-level folder. */
export function applyNaming(name: string, index: number, convention: string | undefined): string {
    const n = String(index + 1).padStart(2, '0')
    if (convention === 'numbered-underscore') return `${n}_${name.replace(/ /g, '_')}`
    if (convention === 'numbered-hyphen') return `${n}-${name.replace(/ /g, '-')}`
    return name
}

/** Answers that name no branch this builder knows, keyed by question. For the preview. */
export function unusedAnswers(answers: ScaffoldAnswers): Array<{ id: ScaffoldQuestionId; value: string }> {
    const known: Partial<Record<ScaffoldQuestionId, Set<string>>> = {
        engagementKind: new Set(Object.keys(BASE_SECTIONS)),
        numbering: KNOWN_CONVENTIONS,
    }
    for (const q of SCAFFOLD_QUESTIONS) {
        if (!known[q.id]) known[q.id] = new Set(q.options.map((o) => o.value))
    }
    return (Object.entries(answers) as Array<[ScaffoldQuestionId, string | undefined]>)
        .filter(([id, value]) => value != null && !known[id]?.has(value))
        .map(([id, value]) => ({ id, value: value as string }))
}

/**
 * The folder tree for a set of answers.
 *
 * Unanswered questions fall back to the safest structure rather than failing: a skipped question
 * should cost the user a folder they did not need, not the whole scaffold.
 */
/**
 * The user's edits to a proposed tree, applied after it is built.
 *
 * Kept OUT of `ScaffoldAnswers` and applied deterministically here, because the server rebuilds
 * the tree from the request and signs the result: anything the client cannot express as input to
 * this function is a folder it could create without approval. Both sides run the same build, so
 * the preview and the signed set are the same list by construction.
 *
 * `removed` holds top-level folder NAMES as the builder produced them, so a removal cannot
 * accidentally match a folder the answers would not have made.
 */
export interface ScaffoldEdits {
    /**
     * Names to leave out of the built tree.
     *
     * Removal only — there is deliberately no way to ADD a folder here. The scaffold's job is to
     * propose a structure and a naming convention; a folder the user invents has neither, and in
     * practice it arrived numbered twice ("08-06-Handover"), positioned after "Internal", and
     * described as "Added during setup" because there was nothing better to say. Making one
     * folder by hand afterwards is trivial; getting the suggested structure right is not.
     */
    removed?: string[]
}

export function buildScaffold(answers: ScaffoldAnswers, edits?: ScaffoldEdits): ScaffoldFolder[] {
    // Every question also accepts a typed answer, which will not be one of the known values. An
    // unrecognised answer takes the same path as an unanswered one — the safe default — rather than
    // producing an empty or wrong tree. The text is not lost: it is shown on the preview, where the
    // user can see their own words were not something the structure could act on.
    const kind = answers.engagementKind && answers.engagementKind in BASE_SECTIONS
        ? answers.engagementKind
        : 'advisory'
    const sections = BASE_SECTIONS[kind]
    const tree: ScaffoldFolder[] = sections.map((s) => ({ ...s }))

    // NO Draft / In Review / Final FOLDERS, deliberately.
    //
    // The Board owns a deliverable's readiness, its review and who can see it. Stage folders are
    // not a lighter version of that — they are a SECOND, fake record of the same state, one that
    // nothing keeps in step. A file sitting in "Final" while the Board says in-review is a
    // contradiction the product cannot resolve, and the folder is the one that is wrong.
    //
    // This used to be a question ("How do deliverables get reviewed?"), which read as though it
    // configured the real workflow. Removed rather than reworded: the honest version of the
    // question has no good answer, because the structure it offers should not exist.

    if (answers.workingPapers === 'yes') {
        tree.push({ name: 'Working Papers', purpose: 'Source data and workings, kept out of the deliverables' })
    }

    // ALWAYS created, and last, so a client scanning the folder meets the work before the back
    // office.
    //
    // This used to be conditional on a question — "Will the client have access to this folder?" —
    // which was the wrong question to ask at setup. Sharing is a deliberate act after work is
    // ready, not a property decided before any work exists, and the answer did not control
    // sharing anyway: it only decided whether this folder got made.
    //
    // Separating internal work from client work is right regardless of who can see what today.
    // The engagement that is internal-only now is shared later, and the folder that should have
    // existed from the start is the one nobody made.
    tree.push({
        name: 'Internal',
        purpose: 'Fees, notes and working discussion — never shared with the client',
        children: [
            { name: 'Admin', purpose: 'Fees, scheduling and correspondence' },
            { name: 'Notes', purpose: 'Internal discussion and drafts' },
        ],
    })

    // REMOVALS APPLY BEFORE NUMBERING, so dropping the third folder renumbers the rest rather
    // than leaving a gap at 03.
    const removed = new Set((edits?.removed ?? []).map((n) => n.trim().toLowerCase()))
    const edited = removed.size > 0
        ? tree.filter((f) => !removed.has(f.name.trim().toLowerCase()))
        : tree

    return edited.map((folder, i) => ({
        ...folder,
        name: applyNaming(folder.name, i, answers.numbering),
    }))
}

/** Every folder in the tree, flattened parents-first so creation order is safe. */
export function flattenScaffold(
    tree: ScaffoldFolder[],
    parentPath: string | null = null,
): Array<{ name: string; path: string; parentPath: string | null; purpose: string }> {
    const out: Array<{ name: string; path: string; parentPath: string | null; purpose: string }> = []
    for (const folder of tree) {
        const path = parentPath ? `${parentPath}/${folder.name}` : folder.name
        out.push({ name: folder.name, path, parentPath, purpose: folder.purpose })
        if (folder.children?.length) out.push(...flattenScaffold(folder.children, path))
    }
    return out
}

/**
 * The planned folders as signable proposals.
 *
 * The approval token signs proposals, and a scaffold folder is one in all but name — it has a name
 * and a parent, which is exactly what `FolderProposal` carries. Reusing the type means the scaffold
 * gets the same tamper check as the file review rather than a second scheme that has to be kept
 * correct separately.
 *
 * The parent is the PATH, not a provider id: the folders do not exist yet, so they have no ids to
 * sign. The path is what determines where each one lands, so it is what must not change between
 * preview and create.
 */
export function scaffoldProposals(
    folders: Array<{ name: string; parentPath: string | null; purpose: string }>,
): FolderProposal[] {
    return folders.map((f) => ({
        kind: 'folder' as const,
        name: f.name,
        parentId: f.parentPath,
        reason: f.purpose,
        docId: null,
        path: f.parentPath ?? '',
    }))
}
