'use client'

import { useState } from 'react'
import { ArrowRight, Pencil, X } from 'lucide-react'

/**
 * One question the agent needs answered, rendered as an interactive card in the thread.
 *
 * ## Why one question with real options, never a list with checkboxes
 *
 * A checkbox list can express exactly ONE kind of confirmation: approve some subset of N identical
 * actions. Every row offers the same single choice — include or exclude — so the moment a
 * confirmation needs genuinely different answers ("rename it to this, leave it alone, or rename it
 * to something I'll type"), the pattern has nothing to say and the UI gets rebuilt per feature.
 *
 * One question with its own options generalizes. Ten renames become ten questions, which is more
 * screens but each is a decision a person can actually read, and the same component then serves a
 * scaffold interview or a destructive-action confirmation unchanged.
 *
 * ## Shape
 *
 * Header carrying the question with its position and a dismiss; numbered full-bleed rows split by
 * hairlines, the first pre-highlighted as the default; a pencil-marked free-text row last; Skip in
 * its own footer. The numbering gives each option a short spoken name ("the second one") and makes
 * the list countable at a glance.
 *
 * ## "Something else" is always the last option
 *
 * Not a prop, not opt-out. Fixed options are faster to answer and keep the agent on paths it can
 * act on, but they are always a GUESS about what the user will want, and a question that cannot be
 * answered in the user's own words is a dead end — the only move left is abandoning the flow.
 *
 * It was briefly a prop, and two of the first three callers turned it off, each with a local reason
 * that read as sound: "a move's destination is a folder, not a name"; "every scaffold answer has to
 * map to a branch in the tree". Both were really saying the CALLER could not handle an unexpected
 * answer — which is the caller's problem to solve, not a reason to stop the user speaking. Callers
 * now receive whatever was typed and decide what to do with it.
 */

export interface AgentPromptOption {
    /** Stable value handed back to `onAnswer`. */
    value: string
    label: string
    /** One short clause on what this choice means. Optional — most options read fine alone. */
    description?: string
    /**
     * The answer the assistant would give if it had to choose.
     *
     * A PROPERTY of the option, not of its position. The highlight used to follow whichever option
     * came first, which meant a caller had to order its list to control the recommendation and a
     * caller with no recommendation to make still appeared to make one. At most one option should
     * carry this; {@link recommendedIndex} takes the first if more do.
     *
     * Leave it off entirely when the choices are genuinely equivalent — a recommendation nobody
     * meant is worse than none, because the user has no way to tell the two apart.
     */
    recommended?: boolean
}

/** The option to highlight, or -1 when the caller recommends nothing. */
export function recommendedIndex(options: AgentPromptOption[]): number {
    return options.findIndex((o) => o.recommended)
}

export function AgentPromptCard({
    question,
    options,
    onAnswer,
    answer,
    answerNote,
    disabled,
    step,
    stepCount,
    onDismiss,
    dismissLabel,
    onSkip,
    freeTextLabel = 'Something else',
    freeTextPlaceholder = 'Type your answer',
}: {
    question: string
    options: AgentPromptOption[]
    onAnswer: (value: string) => void
    /**
     * The chosen value once answered.
     *
     * Owned by the CALLER. The thread is the source of truth for what was said, and a card that
     * remembered its own answer would diverge from it on any re-render or replay.
     *
     * Callers that ask one question at a time unmount the card on answer and never pass this; it is
     * for a caller that wants the decision to stay on screen, such as a summary of a finished
     * sequence.
     */
    answer?: string | null
    /** Shown under an answered card: what the user typed, when it shaped the answer. */
    answerNote?: string
    disabled?: boolean
    /** 1-based position, shown as "1 of 3" while a sequence is in flight. */
    step?: number
    stepCount?: number
    onDismiss?: () => void
    /**
     * Words for leaving the flow, shown in the footer beside Skip.
     *
     * Omitted, only the header × offers the exit — right for a single question, wrong for a
     * sequence, where someone deciding they want none of it should not have to go hunting in the
     * chrome.
     */
    dismissLabel?: string
    onSkip?: () => void
    freeTextLabel?: string
    freeTextPlaceholder?: string
}) {
    const [writing, setWriting] = useState(false)
    const [draft, setDraft] = useState('')

    const answered = answer != null
    const chosen = options.find((o) => o.value === answer)
    const recommended = recommendedIndex(options)

    const submitFreeText = () => {
        const trimmed = draft.trim()
        if (!trimmed) return
        onAnswer(trimmed)
        setWriting(false)
        setDraft('')
    }

    return (
        /* Keyed on the question by the caller, so React swaps the element and this enter animation
           replays — the next question slides in from the right as the last one leaves. Only the
           CURRENT question is ever rendered: answered ones are not kept on screen, which is what
           the card is replacing, not accumulating. */
        <div className="animate-in fade-in slide-in-from-right-4 overflow-hidden rounded-xl border border-gray-200 bg-white duration-200">
            {/* The question, weightier than anything under it: everything below is an answer to it. */}
            <div className="flex items-start gap-2 px-3.5 pb-2.5 pt-3">
                <p className="min-w-0 flex-1 font-headline text-[13px] leading-snug text-gray-900">
                    {question}
                </p>
                {/* Shown whenever a position is given, including "1 of 1".
                    Hiding it on a single question meant the user could not tell a one-question
                    queue from a longer one whose length was simply not displayed — and "how many
                    more of these are there" is the first thing anyone asks of a sequence. */}
                {step != null && stepCount != null && (
                    <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-gray-400">
                        {step} of {stepCount}
                    </span>
                )}
                {onDismiss && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Dismiss this question"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {answered ? (
                /* Answered: the card keeps the decision in place rather than vanishing, so the
                   thread reads back as what was asked and what was agreed. */
                <div className="flex items-center gap-2.5 border-t border-gray-100 bg-primary/[0.04] px-3.5 py-2.5">
                    <span
                        aria-hidden
                        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-medium text-primary"
                    >
                        {chosen ? options.indexOf(chosen) + 1 : <Pencil className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-gray-700">
                            {chosen?.label ?? answer}
                        </span>
                        {answerNote && (
                            <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                                You asked: &ldquo;{answerNote}&rdquo;
                            </span>
                        )}
                    </span>
                </div>
            ) : (
                <>
                    <ul>
                        {options.map((option, i) => {
                        const isRecommended = i === recommended
                        return (
                            <li key={option.value} className="border-t border-gray-100">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => onAnswer(option.value)}
                                    /* The recommended option carries a resting highlight. The
                                       assistant chose it; the highlight says so without
                                       preselecting anything or taking the decision away. */
                                    className={`group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors disabled:opacity-50 ${
                                        isRecommended ? 'bg-gray-50 hover:bg-primary/[0.06]' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <span
                                        aria-hidden
                                        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-medium transition-colors ${
                                            isRecommended
                                                ? 'bg-white text-gray-600 group-hover:bg-primary/15 group-hover:text-primary'
                                                : 'bg-gray-100 text-gray-500 group-hover:bg-primary/15 group-hover:text-primary'
                                        }`}
                                    >
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-medium leading-snug text-gray-900">
                                            {option.label}
                                            {/* Inline with the label, not in its own column.
                                                As a sibling of the text block it took a fixed
                                                column of the row, squeezing the description into a
                                                narrow strip that wrapped over four lines. Here it
                                                flows with the label and costs nothing when the
                                                label is short.

                                                Said in words, not only in shading: a tinted row
                                                tells a screen reader nothing, and a user who cannot
                                                see the tint cannot tell which answer is advised. */}
                                            {isRecommended && (
                                                <span className="ml-1.5 whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 align-middle text-[9px] font-medium uppercase tracking-wide text-primary">
                                                    Recommended
                                                </span>
                                            )}
                                        </span>
                                        {/* Same size as the label, only a lighter colour.
                                            It was 11px grey, on the assumption a description is a
                                            short clause. The agent's reasons are full sentences,
                                            and a sentence set two steps smaller than the words
                                            above it reads as fine print rather than as the rest of
                                            the thought. Hierarchy here comes from weight and
                                            colour, not from shrinking the text. */}
                                        {option.description && (
                                            <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                    {/* On hover only: a permanent arrow on every row reads as
                                        several competing calls to action. */}
                                    <ArrowRight
                                        className="h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
                                        aria-hidden
                                    />
                                </button>
                            </li>
                        )})}

                        {/* Last and quieter: the fallback, not a peer of the options. Leading with
                            it would invite typing where a click would do. */}
                        {!writing && (
                            <li className="border-t border-gray-100">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => setWriting(true)}
                                    className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                                >
                                    <span
                                        aria-hidden
                                        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400 transition-colors group-hover:text-primary"
                                    >
                                        <Pencil className="h-2.5 w-2.5" />
                                    </span>
                                    <span className="text-xs text-gray-400 transition-colors group-hover:text-gray-600">
                                        {freeTextLabel}
                                    </span>
                                </button>
                            </li>
                        )}

                        {writing && (
                            <li className="border-t border-gray-100">
                                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                                    <span
                                        aria-hidden
                                        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
                                    >
                                        <Pencil className="h-2.5 w-2.5" />
                                    </span>
                                    <input
                                        autoFocus
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') submitFreeText()
                                            // Escape returns to the options rather than discarding
                                            // the question — a mis-click costs nothing.
                                            if (e.key === 'Escape') { setWriting(false); setDraft('') }
                                        }}
                                        placeholder={freeTextPlaceholder}
                                        className="min-w-0 flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={submitFreeText}
                                        disabled={!draft.trim()}
                                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary transition-colors hover:bg-primary/10 disabled:opacity-30"
                                        aria-label="Submit answer"
                                    >
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </li>
                        )}
                    </ul>

                    {/* Declining is a different act from answering, so it sits apart. */}
                    {(onSkip || dismissLabel) && (
                        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
                            {/* Leaving the flow sits HERE, beside Skip, not only as the × in the
                                header. Once the reader is working down a list of options the
                                header is out of their reading path entirely — the × is findable
                                when looking for it and invisible when the question in mind is
                                "do I want any of this?".

                                Left-aligned and quiet: it is an escape, not a third answer. */}
                            {dismissLabel && onDismiss ? (
                                <button
                                    type="button"
                                    onClick={onDismiss}
                                    disabled={disabled}
                                    className="rounded-lg px-2 py-1.5 text-[11px] text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
                                >
                                    {dismissLabel}
                                </button>
                            ) : <span />}
                            {onSkip && (
                                <button
                                    type="button"
                                    onClick={onSkip}
                                    disabled={disabled}
                                    className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                                >
                                    Skip
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
