'use client'

import { useCallback, useState } from 'react'
import { Loader2, X, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/toast'
import { proposalKey, type Proposal } from '@/lib/ai/files-agent/tools'
import { AgentPromptCard, type AgentPromptOption } from '@/components/ui/agent-prompt-card'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { ElapsedTime } from '@/components/ui/elapsed-time'
import type { AnalysisSummary } from '@/lib/ai/files-agent/analyze'

/**
 * Review and approval for agent-proposed file changes.
 *
 * ## Every change is confirmed before it happens
 *
 * The panel never applies anything on its own. It renders each proposal as a before/after line the
 * lead can read in a second, ticked by default but individually removable, and applies only what
 * survives that pass. This is the whole safety model made visible: the agent's output is a
 * suggestion until a person says otherwise.
 *
 * Partial approval is expected rather than exceptional, which is why the approval token signs each
 * proposal separately — unticking two of twelve must not invalidate the rest.
 */

interface Finding {
    kind: string
    fileCount: number
    files: Array<{ externalId: string; fileName: string; docId: string | null }>
}

export interface ReviewData {
    findings: Finding[]
    proposals: Proposal[]
    token: string | null
    nodeCount: number
    summary?: AnalysisSummary
    /** The assessment as Markdown — what the panel renders. */
    summaryMarkdown?: string
    creditsSpent: number
    dropped: number
    truncated: boolean
    estimate: number
}


/**
 * The two fixed answers.
 *
 * Sentinels rather than booleans because the decision map also holds a REPLACEMENT NAME the user
 * typed, so the value space is "accept the suggestion", "decline", or an arbitrary string. Prefixed
 * so a user typing the literal word "skip" as a filename cannot be mistaken for declining.
 */
const ACCEPT = '\u0000accept'
const DECLINE = '\u0000decline'

/**
 * The question, and the answers, for one proposed change.
 *
 * Built HERE, deterministically, from the proposal the agent already returned. No model call is
 * involved in phrasing a question or in reading the reply: the options are a closed set this file
 * defines, and the answer comes back as the exact sentinel or the exact string the user typed.
 * Sending that to a model to be "interpreted" would spend a credit to learn something already
 * known, and would introduce a way for a click to be misread.
 */
/**
 * The file, named the way it is named everywhere else: `name (DOC-ID, in Folder)`.
 *
 * In the question itself rather than on a second line. A filename alone does not identify one item
 * among fifty-eight — two folders can hold the same name — and the id is what the user's file list
 * shows in its own column, so it is how they find the row. Putting it in brackets keeps the
 * question one sentence instead of a title with a subtitle under it.
 */
function named(name: string, p: Proposal): string {
    const detail = [p.docId, p.path ? `in ${p.path}` : null].filter(Boolean).join(', ')
    return detail ? `${name} (${detail})` : name
}

/**
 * What to call the work in progress, in the user's terms.
 *
 * "2 renames" when they are all renames, "2 tasks" when they are mixed — a lead who just approved
 * two renames should see those words, not a generic count. Reads from the ACCEPTED set, since a
 * declined proposal is not work being done.
 */
function taskWord(proposals: Proposal[], decisions: Record<string, string>): string {
    const accepted = proposals.filter((p) => {
        const d = decisions[proposalKey(p)]
        return d != null && d !== DECLINE
    })
    const kinds = new Set(accepted.map((p) => p.kind))
    const plural = accepted.length === 1 ? '' : 's'
    if (kinds.size === 1) {
        const [kind] = Array.from(kinds)
        if (kind === 'rename') return `rename${plural}`
        if (kind === 'move') return `move${plural}`
        return `folder${plural}`
    }
    return `task${plural}`
}

/**
 * One line describing a change as it is carried out.
 *
 * Reads back what the user approved, including a name they typed themselves rather than the
 * agent's suggestion — seeing their own choice confirms the right thing is being done.
 */
function commentaryFor(p: Proposal, decision: string | undefined): string {
    if (p.kind === 'rename') {
        const target = decision && decision !== ACCEPT ? decision : p.proposedName
        return `${p.currentName} → ${target}`
    }
    if (p.kind === 'move') return `${p.fileName} → ${p.destinationName}`
    return `New folder: ${p.name}`
}

function questionFor(p: Proposal): string {
    if (p.kind === 'rename') return `Rename ${named(p.currentName, p)}?`
    if (p.kind === 'move') return `Move ${named(p.fileName, p)} into ${p.destinationName}?`
    return `Create the folder "${p.name}"${p.path ? ` in ${p.path}` : ''}?`
}

/**
 * The options, with the agent's own proposal marked as suggested.
 *
 * Every proposal here EXISTS because a detector found something wrong and the agent proposed a
 * specific fix, so accepting it is the recommendation by construction. That is not true of every
 * question — a caller asking which of three equivalent structures to use should mark nothing — so
 * the flag is set deliberately rather than inherited from position.
 */
function optionsFor(p: Proposal): AgentPromptOption[] {
    if (p.kind === 'rename') {
        return [
            { value: ACCEPT, label: `Rename to "${p.proposedName}"`, description: p.reason, recommended: true },
            { value: DECLINE, label: 'Keep the current name' },
        ]
    }
    if (p.kind === 'move') {
        return [
            { value: ACCEPT, label: `Move to ${p.destinationName}`, description: p.reason, recommended: true },
            { value: DECLINE, label: 'Leave it where it is' },
        ]
    }
    return [
        { value: ACCEPT, label: `Create "${p.name}"`, description: p.reason, recommended: true },
        { value: DECLINE, label: "Don't create it" },
    ]
}

/** The free-text row, offered only where a typed alternative is meaningful. */
function freeTextLabelFor(p: Proposal): string {
    return p.kind === 'rename' ? 'Rename to something else' : 'Something else'
}

function freeTextPlaceholderFor(p: Proposal): string {
    return p.kind === 'rename' ? `New name, keeping ${extensionOf(p.currentName)}` : 'Type your answer'
}

function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    return dot > 0 ? fileName.slice(dot) : 'the extension'
}

/** What each change does, in a word, so the row says its kind before its detail. */
const KIND_LABEL: Record<Proposal['kind'], string> = {
    rename: 'Rename',
    move: 'Move',
    folder: 'New folder',
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
    /*
     * Old name above, new name below — not struck through on one line.
     *
     * Filenames here are long and the panel is narrow, so an inline "old → new" wrapped mid-name
     * and the strikethrough then ran across two ragged lines, which was the least legible way to
     * show the one comparison that matters. Stacked, each name gets a full line and the arrow is
     * implied by the order.
     */
    if (proposal.kind === 'rename') {
        return (
            <>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                    {KIND_LABEL.rename}
                </span>
                <span className="mt-0.5 block truncate text-gray-400" title={proposal.currentName}>
                    {proposal.currentName}
                </span>
                <span className="block truncate font-medium text-gray-900" title={proposal.proposedName}>
                    → {proposal.proposedName}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{proposal.reason}</span>
            </>
        )
    }

    if (proposal.kind === 'move') {
        return (
            <>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                    {KIND_LABEL.move}
                </span>
                <span className="mt-0.5 block truncate font-medium text-gray-900" title={proposal.fileName}>
                    {proposal.fileName}
                </span>
                <span className="block truncate text-gray-600" title={proposal.destinationName}>
                    → {proposal.destinationName}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{proposal.reason}</span>
            </>
        )
    }

    return (
        <>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                {KIND_LABEL.folder}
            </span>
            <span className="mt-0.5 block truncate font-medium text-gray-900" title={proposal.name}>
                {proposal.name}
            </span>
            <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{proposal.reason}</span>
        </>
    )
}

export function FilesAgentPanel({
    projectId,
    onApplied,
    review,
    setReview,
    render,
}: {
    projectId: string
    /** Called after a successful apply so the file list can refresh. */
    onApplied?: () => void
    /**
     * Review state is OWNED BY THE CALLER, because the two halves of this panel render in two
     * places: the trigger sits among the suggestion chips, low in the panel where the other things
     * you can ask for live, while the proposals need the full width above the conversation. Local
     * state would give each half its own copy and the trigger would never open the results.
     */
    review: ReviewData | null
    setReview: (r: ReviewData | null) => void
    /** Which half to draw. */
    render: 'trigger' | 'results'
}) {
    // Both routes authenticate through `getAuthUser`, which reads an Authorization header and
    // returns null without one — a cookie-only fetch comes back 401 "Unauthorized", which is what
    // the panel was showing instead of a review.
    const { session } = useAuth()
    const token = session?.access_token

    const [state, setState] = useState<'idle' | 'reviewing' | 'applying'>('idle')
    /**
     * One decision per proposal, keyed by {@link proposalKey}.
     *
     * A map of ANSWERS, not a set of exclusions. The old shape could only record include/exclude,
     * which is why the UI could only be checkboxes; an answer can also be a replacement name the
     * user typed, which is a third outcome the set had no way to hold.
     */
    const [decisions, setDecisions] = useState<Record<string, string>>({})

    /**
     * What the user typed where it could not be executed.
     *
     * Kept so the answer is not thrown away: the change is declined, and the note is shown back on
     * the card so the thread records what they actually asked for.
     */
    const [notes, setNotes] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const { addToast } = useToast()

    const runReview = useCallback(async () => {
        if (!token) {
            setError('Your session has expired. Reload the page and try again.')
            return
        }
        setState('reviewing')
        setError(null)
        setDecisions({})
        setNotes({})
        try {
            const res = await fetch(`/api/projects/${projectId}/files-agent`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'include',
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(body.error ?? 'Could not review the files')
                return
            }
            setReview(body.data)
        } catch {
            setError('Could not review the files')
        } finally {
            setState('idle')
        }
    }, [projectId, token])

    const decide = useCallback((key: string, value: string) => {
        setDecisions((prev) => ({ ...prev, [key]: value }))
    }, [])


    const apply = useCallback(async (finalDecisions: Record<string, string>) => {
        if (!review?.token || !token) return
        // Only the changes actually agreed to, with any user-typed replacement name carried as an
        // override the server re-validates. A skipped or unanswered proposal is simply absent.
        const approved: Array<{ proposal: Proposal; renameTo?: string }> = review.proposals.flatMap((p) => {
            const decision = finalDecisions[proposalKey(p)]
            if (!decision || decision === DECLINE) return []
            if (decision === ACCEPT) return [{ proposal: p }]
            return [{ proposal: p, renameTo: decision }]
        })
        if (approved.length === 0) return

        setState('applying')
        try {
            const res = await fetch(`/api/projects/${projectId}/files-agent/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    token: review.token,
                    proposals: approved.map((a) => a.proposal),
                    // Keyed by the same digest-stable identity the proposals carry, so the server
                    // can pair an override to its proposal without trusting array order.
                    overrides: Object.fromEntries(
                        approved.flatMap((a) => a.renameTo
                            ? [[proposalKey(a.proposal), a.renameTo]]
                            : []),
                    ),
                }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                addToast({ type: 'error', title: 'Could not apply', message: body.error ?? 'Please try again.' })
                return
            }

            const { applied, failed } = body.data
            addToast({
                type: failed > 0 ? 'warning' : 'success',
                title: failed > 0 ? `Applied ${applied}, ${failed} failed` : `Applied ${applied} change${applied === 1 ? '' : 's'}`,
                message: failed > 0
                    ? 'The rest were applied. Run the review again to retry.'
                    : 'Recorded in the audit trail as Brio, your Executive Assistant.',
            })

            // The token is spent whatever the outcome, so the review is over either way.
            setReview(null)
            onApplied?.()
        } catch {
            addToast({ type: 'error', title: 'Could not apply', message: 'Please try again.' })
        } finally {
            setState('idle')
        }
    }, [projectId, review, addToast, onApplied, token])

    /**
     * Records an answer, deciding what a TYPED one means for this kind of proposal.
     *
     * For a rename it is the new name, applied as an override. For a move or a new folder there is
     * nothing a typed string could safely be executed as — the destination is a folder that exists,
     * not a name — so it declines the change and keeps what was said. The user is still heard; the
     * agent simply does not act on words it cannot verify.
     */
    const answerProposal = useCallback((p: Proposal, value: string) => {
        const key = proposalKey(p)
        const executable = value === ACCEPT || value === DECLINE || p.kind === 'rename'
        const decision = executable ? value : DECLINE
        if (!executable) setNotes((prev) => ({ ...prev, [key]: value }))

        setDecisions((prev) => {
            const next = { ...prev, [key]: decision }
            // The last answer IS the confirmation. Asking again with an Apply button would be
            // asking the user to agree to what they just agreed to, one question at a time.
            //
            // Started from inside the updater so it sees the answer that completes the set:
            // `decisions` in this closure is still the previous value. Deferred a tick so the
            // state commit is not interleaved with a fetch.
            if (review && Object.keys(next).length === review.proposals.length) {
                setTimeout(() => void apply(next), 0)
            }
            return next
        })
    }, [review, apply])

    // The trigger: one more chip in the suggestion row, in the primary color because unlike its
    // neighbours it does not ask a question — it starts work that ends in file changes, and that
    // difference is worth seeing before you click.
    if (render === 'trigger') {
        if (review) return null
        return (
            <>
                <button
                    type="button"
                    onClick={() => void runReview()}
                    disabled={state === 'reviewing' || !token}
                    title="Check this engagement's files for inconsistent naming, duplicates and files in the wrong place — then propose fixes for you to approve."
                    className="inline-flex max-w-full shrink-0 items-center gap-1.5 truncate rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all hover:brightness-105 disabled:opacity-60"
                >
                    {state === 'reviewing'
                        ? <><Loader2 className="h-3 w-3 shrink-0 animate-spin" /> Reviewing…</>
                        : <><Sparkles className="h-3 w-3 shrink-0" /> Review file organization</>}
                </button>
                {error && <p className="w-full px-0.5 text-xs text-red-600">{error}</p>}
            </>
        )
    }

    if (!review) return null

    // Position in the queue: the first proposal with no decision yet.
    const pendingIndex = review.proposals.findIndex((p) => !(proposalKey(p) in decisions))
    const acceptedCount = review.proposals.filter((p) => {
        const d = decisions[proposalKey(p)]
        return d != null && d !== DECLINE
    }).length
    const allAnswered = pendingIndex === -1

    return (
        <div className="space-y-3">
            {/* The review's own report, as an ordinary Markdown message rather than a bespoke
                stats panel. A table renders in the normal message flow and serves any later answer
                that reports the same few fields across several rows; a purpose-built card serves
                exactly one. */}
            {review.summaryMarkdown && (
                // No card around it: this is the assistant's answer, so it reads like one. Only
                // the question below keeps a border, because that one is a control.
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <ChatMarkdown content={review.summaryMarkdown} />
                    </div>
                    <button
                        type="button"
                        onClick={() => setReview(null)}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Dismiss this review"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Stated BEFORE the first question, not after the last.
                Answering is now what commits the change, so the consequence has to be on screen
                while the user is deciding — telling them afterwards would be telling them about
                something they can no longer choose. */}
            {review.proposals.length > 0 && !allAnswered && (
                <p className="text-[10px] leading-relaxed text-gray-400">
                    Your answers apply directly to your Drive, recorded in the audit trail as Brio,
                    your Executive Assistant, with your name as the approver. Nothing is deleted —
                    a file that is renamed or moved keeps its contents, its sharing and its history,
                    and the Audit tab records every change.
                </p>
            )}

            {/* ONE QUESTION PER CHANGE, asked in order.
                Ten renames are ten questions rather than one list with ten checkboxes. A checkbox
                list can only ever offer include/exclude, so it cannot express "rename it to this",
                "leave it alone" or "rename it to something I will type" — and a pattern that cannot
                carry those cannot be reused for any other kind of confirmation. */}
            {review.proposals.map((p, i) => {
                const key = proposalKey(p)
                // ONLY the question being asked. Answered ones are not kept on screen: looking at
                // question 2 while question 1 sits above it is noise, and the decision is already
                // recorded in `decisions` either way.
                if (i !== pendingIndex) return null
                return (
                    <AgentPromptCard
                        key={key}
                        question={questionFor(p)}
                        options={optionsFor(p)}
                        step={i + 1}
                        stepCount={review.proposals.length}
                        answer={decisions[key] ?? undefined}
                        disabled={state === 'applying'}
                        onAnswer={(value) => answerProposal(p, value)}
                        onSkip={() => decide(key, DECLINE)}
                        freeTextLabel={freeTextLabelFor(p)}
                        freeTextPlaceholder={freeTextPlaceholderFor(p)}
                        // What they typed, where it could not be executed. The card shows the
                        // decision; this shows the words behind it, so a declined change does not
                        // read as a plain "no" when it was really "not like that".
                        answerNote={notes[key]}
                    />
                )
            })}

            {/* While applying. There is no Apply button: answering the last question IS the
                confirmation, so the run starts on that answer and this reports it. */}
            {state === 'applying' && (
                // Named work, not a bare spinner: the user answered several questions and the
                // agent is now carrying out what they agreed to, so the line says how many and
                // what kind. The pulsing dots reuse the search affordance rather than introducing
                // a second idiom for "working".
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        <p className="min-w-0 flex-1 text-xs text-gray-700">
                            Completing {acceptedCount} {taskWord(review.proposals, decisions)}
                            <span className="animate-search-dots">.</span>
                            <span className="animate-search-dots animate-search-dots-delay-1">.</span>
                            <span className="animate-search-dots animate-search-dots-delay-2">.</span>
                        </p>
                        <ElapsedTime className="shrink-0 text-[10px] text-gray-400" />
                    </div>
                    {/* Commentary, for a TASK rather than a question: these are changes to the
                        user's own Drive, so the wait is more tolerable when it says what is being
                        changed. Listed rather than counted — "Interviewer_Question_Bank (1).docx →
                        …_Archive.docx" is what they approved, and seeing it back confirms the right
                        thing is happening.

                        Not per-item progress: the route applies its batch in one call and returns
                        once, so there is no signal for which item is in flight. This says what the
                        run covers, not where it has got to. */}
                    <ul className="space-y-0.5 pl-5">
                        {review.proposals
                            .filter((p) => {
                                const d = decisions[proposalKey(p)]
                                return d != null && d !== DECLINE
                            })
                            .map((p) => (
                                <li key={proposalKey(p)} className="truncate text-[10px] text-gray-400">
                                    {commentaryFor(p, decisions[proposalKey(p)])}
                                </li>
                            ))}
                    </ul>
                </div>
            )}

            {review.dropped > 0 && (
                <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">
                    {review.dropped} suggestion{review.dropped === 1 ? '' : 's'} discarded as unsafe.
                </p>
            )}
        </div>
    )
}

/** The shape the caller holds while a review is open. */
export type FilesAgentReview = ReviewData
