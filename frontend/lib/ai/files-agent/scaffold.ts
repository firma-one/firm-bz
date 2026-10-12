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
    | 'reviewStages'
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
        ],
    },
    {
        id: 'reviewStages',
        // Recommended: a draft/final split is the lightest structure that still says which version
        // went to the client. Two-stage is better where a partner signs off, but that is a fact
        // about the firm, not something to assume.
        question: 'How do deliverables get reviewed?',
        options: [
            { value: 'two-stage', label: 'Draft, then partner review', description: 'A folder for each stage' },
            { value: 'single', label: 'One review before it goes out', recommended: true },
            { value: 'none', label: 'No formal review stage' },
        ],
    },
    {
        id: 'workingPapers',
        // Recommended: keeping workings out of the deliverable folder is what stops a spreadsheet
        // of calculations being shared alongside the report it supports.
        options: [
            { value: 'yes', label: 'Yes — they need their own place', recommended: true },
            { value: 'no', label: 'No — everything lives with its deliverable' },
        ],
        question: 'Do you keep working papers or source data?',
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
}

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
export function buildScaffold(answers: ScaffoldAnswers): ScaffoldFolder[] {
    // Every question also accepts a typed answer, which will not be one of the known values. An
    // unrecognised answer takes the same path as an unanswered one — the safe default — rather than
    // producing an empty or wrong tree. The text is not lost: it is shown on the preview, where the
    // user can see their own words were not something the structure could act on.
    const kind = answers.engagementKind && answers.engagementKind in BASE_SECTIONS
        ? answers.engagementKind
        : 'advisory'
    const sections = BASE_SECTIONS[kind]
    const tree: ScaffoldFolder[] = sections.map((s) => ({ ...s }))

    // Review stages live INSIDE the folder holding what gets reviewed, not as siblings of it:
    // "Draft" at the top level says nothing about what is in draft.
    const deliverableFolder = tree.find((f) =>
        ['Deliverables', 'Reporting', 'Handover'].includes(f.name))
    if (deliverableFolder) {
        if (answers.reviewStages === 'two-stage') {
            deliverableFolder.children = [
                { name: 'Draft', purpose: 'In progress, not yet reviewed' },
                { name: 'In Review', purpose: 'With the partner for review' },
                { name: 'Final', purpose: 'Approved and issued' },
            ]
        } else if (answers.reviewStages === 'single') {
            deliverableFolder.children = [
                { name: 'Draft', purpose: 'In progress' },
                { name: 'Final', purpose: 'Reviewed and issued' },
            ]
        }
    }

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

    return tree.map((folder, i) => ({
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
