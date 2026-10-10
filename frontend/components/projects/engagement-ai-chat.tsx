'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2, Sparkles, Copy, Check, RotateCcw, History, X, ThumbsUp, ThumbsDown, ClipboardList, Square, Clock } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError, AiAbortedError } from '@/lib/ai/fetch-timeout'
import { StreamingText } from '@/components/ui/streaming-text'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { readThread, writeThread } from '@/lib/ai/chat-thread-store'
import { ElapsedTime } from '@/components/ui/elapsed-time'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getChatHistory, recordChatQuestion, clearChatHistory, type ChatHistoryEntry } from '@/lib/ai/chat-history'
import { formatRelativeTime, formatDateTimeWithTZ } from '@/lib/utils'
import { reasonsFor, type FeedbackReason } from '@/lib/ai/feedback-reasons'
import { useToast } from '@/components/ui/toast'
import { buildChatTranscript } from '@/lib/ai/chat-transcript'
import { buildChatSuggestions } from '@/lib/ai/chat-suggestions'
import { isObviouslyOutOfScope, OUT_OF_SCOPE_REPLY, parseChatReply } from '@/lib/ai/engagement-chat'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/** What a panel rendered inside the thread can do to it. */
export interface ChatThreadApi {
    /** Appends a turn. Persisted and rendered exactly like a typed question or a streamed answer. */
    append: (role: 'user' | 'assistant', content: string) => void
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    /** When the turn was created, for the relative timestamp in the action bar. */
    at: number
    /**
     * Stable identity for an assistant turn, minted here because nothing about the thread exists
     * server-side — the chat endpoint is stateless and receives the whole array each turn.
     *
     * Sent with a rating so that correcting one replaces the stored row rather than adding a second
     * and double-counting in the efficacy report. Lives only as long as the thread does, which is
     * exactly the window in which an answer is on screen to be re-rated.
     */
    answerId?: string
    /**
     * Set when the user stopped this answer mid-stream. The text is kept — the first paragraph is
     * often the useful part — but the turn is marked so it is never presented as a complete answer,
     * and so it cannot be rated: a thumbs-down on half an answer would poison the efficacy data.
     */
    stopped?: boolean
}

/**
 * Three lines at the composer's 1.5rem line-height. Past this it scrolls rather than growing, so a
 * pasted paragraph cannot push the Action Center off the page.
 */
const MAX_COMPOSER_HEIGHT_PX = 72

/**
 * How far from the bottom still counts as "following along".
 *
 * Generous enough to survive a part-rendered line, small enough that a reader who has deliberately
 * scrolled up is not dragged back down by the next token.
 */
const AUTOSCROLL_SLACK_PX = 80

/**
 * A rating already given on an answer. `null`/`undefined` means not yet rated.
 *
 * `undefined` is in the type deliberately: the caller looks the rating up out of a sparse
 * `Record<number, …>`, so an unrated answer arrives as `undefined`, not `null`. Typing this as
 * `| null` alone made every `rating !== null` guard true on first paint and left both thumbs
 * permanently disabled. Guards below test falsiness rather than a specific empty value.
 */
type Rating = { helpful: boolean; reason?: FeedbackReason } | null | undefined

/**
 * Icon-only actions under a settled answer: copy, retry, and a thumbs rating.
 *
 * Labels were dropped because four actions with text crowded a narrow column and competed with the
 * answer for attention. Each icon carries the shared Radix tooltip and an `aria-label`, so the
 * meaning is available on hover and to a screen reader without taking horizontal space.
 *
 * ## Ratings stay editable
 *
 * A rating used to lock on the first click, to stop someone toggling and double-counting themselves
 * in the efficacy report. That is now handled where it belongs — the server upserts on `answerId`,
 * so a correction replaces the row — which frees the UI to let people fix a mistake.
 *
 * It matters because the chip panel opens *after* the thumb is clicked: a locked rating meant
 * anyone who dismissed the panel was stuck with a reason-less rating they could never complete, and
 * anyone who picked the wrong chip was stuck with the wrong one.
 */
function AnswerActions({
    at, copied, rating, disabled, rateable = true, onCopy, onRetry, onRate,
}: {
    at: number
    copied: boolean
    rating: Rating
    disabled: boolean
    /** False for an answer the user stopped — see the call site. */
    rateable?: boolean
    onCopy: () => void
    onRetry: () => void
    onRate: (helpful: boolean, reason?: FeedbackReason) => void
}) {
    /** Which chip list is open, if any. Both signs have one, so this holds the sign rather than a flag. */
    const [picking, setPicking] = useState<boolean | null>(null)

    const iconButton =
        'inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40'

    // Clicking a thumb records the rating immediately and opens its chips. Recording first means a
    // user who ignores the chips has still been counted — the chip is detail, the thumb is the
    // signal. Clicking the thumb that is already set just reopens its chips to change the answer.
    const onThumb = (helpful: boolean) => {
        if (rating?.helpful !== helpful) onRate(helpful, undefined)
        setPicking((cur) => (cur === helpful ? null : helpful))
    }

    return (
        <div className="mt-1.5 border-t border-gray-200/70 pt-1">
            <TooltipProvider delayDuration={150}>
                <div className="flex items-center gap-0.5">
                    {/* Relative time, with the absolute timestamp in its own tooltip. Answers are
                        regenerated against live data, so how old one is tells the reader whether
                        its figures still stand. */}
                    <RelativeDateTime
                        date={new Date(at)}
                        className="mr-1.5"
                        textClassName="text-[10px] text-gray-400"
                        iconClassName="hidden"
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" onClick={onCopy} className={iconButton} aria-label="Copy answer">
                                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{copied ? 'Copied' : 'Copy'}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" onClick={onRetry} disabled={disabled} className={iconButton} aria-label="Ask again">
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Ask again</TooltipContent>
                    </Tooltip>

                    {rateable && (
                    <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onThumb(true)}
                                aria-label="Good response"
                                aria-pressed={rating?.helpful === true}
                                className={`${iconButton} ${rating?.helpful === true ? 'text-primary' : ''}`}
                            >
                                <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            {rating?.helpful === true ? 'Marked helpful — click to change' : 'Good response'}
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onThumb(false)}
                                aria-label="Bad response"
                                aria-pressed={rating?.helpful === false}
                                className={`${iconButton} ${rating?.helpful === false ? 'text-amber-600' : ''}`}
                            >
                                <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            {rating?.helpful === false ? 'Marked unhelpful — click to change' : 'Bad response'}
                        </TooltipContent>
                    </Tooltip>
                    </>
                    )}
                </div>
            </TooltipProvider>

            {/* Single-select: one click records and closes. Each list is a single ordered axis whose
                options are mutually exclusive, so "the strongest thing you felt" always has one
                right answer — multi-select would need a confirm button and cost us ratings. */}
            {rateable && picking !== null && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-gray-500">
                        {picking ? 'What was good about it?' : 'What went wrong?'}
                    </span>
                    {reasonsFor(picking).map((r) => {
                        const active = rating?.helpful === picking && rating?.reason === r.value
                        const tone = picking
                            ? 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
                            : 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                        const activeTone = picking
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-amber-300 bg-amber-50 text-amber-800'
                        return (
                            <button
                                key={r.value}
                                type="button"
                                onClick={() => {
                                    onRate(picking, r.value as FeedbackReason)
                                    setPicking(null)
                                }}
                                aria-pressed={active}
                                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                                    active ? activeTone : `border-gray-200 text-gray-600 ${tone}`
                                }`}
                            >
                                {r.label}
                            </button>
                        )
                    })}
                    {/* The thumb is already recorded, so this only closes the panel. */}
                    <button
                        type="button"
                        onClick={() => setPicking(null)}
                        className="px-1 text-[10px] text-gray-400 underline transition-colors hover:text-gray-700"
                    >
                        Skip
                    </button>
                </div>
            )}
        </div>
    )
}

export function EngagementAiChat({
    projectId,
    data,
    engagementName,
    clientName,
    chrome = 'card',
    suggestionsOverride,
    suggestionActions,
    aboveThread,
    placeholder,
    emptyStateNote,
    capabilityNote,
    surface = 'overview',
    threadRef,
    onBusyChange,
}: {
    projectId: string
    /** Insights payload the page already holds; drives data-aware suggestions. */
    data?: EngagementInsightsResponse | null
    /** Titles the exported transcript. Optional — it falls back to "this engagement". */
    engagementName?: string | null
    clientName?: string | null
    /**
     * 'card' (default) draws the panel's own border and shadow, for the in-column placement.
     * 'floating' drops both, because the surrounding overlay already supplies them — two nested
     * borders read as a box inside a box.
     */
    chrome?: 'card' | 'floating'
    /**
     * Starting prompts supplied by the host page, replacing the engagement-derived set.
     *
     * The Files page needs questions about files, and has no insights payload to derive the
     * engagement ones from anyway. Passed in rather than branched on inside, so this component
     * stays unaware of which page it is on.
     */
    suggestionsOverride?: string[]
    /**
     * Rendered as the last chip in the suggestion row.
     *
     * A caller-supplied ACTION, not a question — the Files page puts "Review file organization"
     * here so it reads as one of the things you can ask for, in the place the eye already goes for
     * them, rather than as a banner above the conversation.
     */
    suggestionActions?: React.ReactNode
    /**
     * Agent output, rendered INSIDE the thread at the top.
     *
     * Not above the panel: a review rendered outside the conversation appeared before the "Ask
     * Brio" header that introduces it, so the panel read as output-then-title. Anything the
     * assistant produces belongs in the message area, below that header and scrolling with the
     * rest of the conversation.
     */
    aboveThread?: React.ReactNode
    /**
     * Overrides the composer's prompt text.
     *
     * The default names the engagement, which is right on Overview and wrong on Files — a panel
     * that answers questions about folders and due dates should say so, since the placeholder is
     * the one hint a user reads before typing anything.
     */
    placeholder?: string
    /** Replaces the default empty-state line where a surface needs different wording. */
    emptyStateNote?: React.ReactNode
    /**
     * One line in the header saying what this panel can do here.
     *
     * Page-specific, because the answer differs: on Overview Brio only answers questions, while on
     * Files it can also reorganize and scaffold. A single hardcoded line would be wrong on one of
     * them.
     */
    capabilityNote?: React.ReactNode
    /**
     * Which page this panel is on, for thread persistence.
     *
     * Overview and Files hold different conversations about the same engagement, so they keep
     * separate threads — see `lib/ai/chat-thread-store.ts`.
     */
    surface?: string
    /**
     * Handed a way to post turns into this thread.
     *
     * An agent confirmation is a question the assistant asked and an answer the user gave, so it
     * belongs in the conversation like any other exchange — visible in the record, scrollable, and
     * persisted with everything else. Without this the answers lived as state inside the panel and
     * vanished on reload, leaving a thread that showed the review happening but not what was
     * decided.
     */
    threadRef?: React.MutableRefObject<ChatThreadApi | null>
    /**
     * Reports whether an answer is in flight.
     *
     * Lifted so the collapsed launcher can show that something is still running — the panel is
     * kept mounted but hidden while collapsed, so the work continues where the user cannot see it.
     */
    onBusyChange?: (busy: boolean) => void
}) {
    const [messages, setMessages] = useState<Message[]>([])

    /**
     * Restores the thread on mount, so it survives navigation and reload within the session.
     *
     * In an effect rather than the initializer: this component renders on the server, where
     * sessionStorage does not exist, and reading it during the first client render would mismatch
     * the server's markup.
     */
    useEffect(() => {
        const stored = readThread(projectId, surface)
        if (stored.length > 0) {
            setMessages(stored)
            // Everything restored was produced before this page load, so the divider sits above it.
            setRestoredCount(stored.length)
        }
    }, [projectId, surface])

    /** How many leading turns came from storage, so the divider knows where "now" begins. */
    const [restoredCount, setRestoredCount] = useState(0)

    // Published once, so a panel rendered in `aboveThread` can write into the conversation it sits
    // in. A ref rather than a callback prop because the consumer is a sibling, not a child.
    useEffect(() => {
        if (!threadRef) return
        threadRef.current = {
            append: (role, content) =>
                setMessages((prev) => [...prev, { role, content, at: Date.now() }]),
        }
        return () => { threadRef.current = null }
    }, [threadRef])

    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    useEffect(() => { onBusyChange?.(streaming) }, [streaming, onBusyChange])

    // Persisted on every settled change. Not while streaming: a half-written answer would be
    // stored truncated and restored with no sign it was cut off.
    useEffect(() => {
        if (streaming) return
        writeThread(projectId, surface, messages)
    }, [messages, streaming, projectId, surface])
    const [error, setError] = useState<string | null>(null)
    // Set when the API reports AI is unavailable (no key) — hides the panel entirely.
    const [unavailable, setUnavailable] = useState(false)
    // Questions already put to the model this session, so a chip is not offered twice.
    const [asked, setAsked] = useState<Set<string>>(() => new Set())
    // Questions asked previously, surviving reload. Loaded in an effect rather than from a lazy
    // initialiser because localStorage is unavailable during server render.
    const [history, setHistory] = useState<ChatHistoryEntry[]>([])
    const [historyOpen, setHistoryOpen] = useState(false)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
    const [transcriptCopied, setTranscriptCopied] = useState(false)
    // Ratings by message index. Session-only: the thumbs are an affordance on an answer still on
    // screen, and the durable record lives server-side in platform_ai_feedback.
    const [ratings, setRatings] = useState<Record<number, { helpful: boolean; reason?: FeedbackReason }>>({})
    const { addToast } = useToast()

    /**
     * Identity of this conversation, for grouping its ratings together in the efficacy dashboard —
     * a run of good answers turning bad after a topic shift is a different signal from the same
     * number of unrelated complaints.
     *
     * Minted here rather than server-side because the chat endpoint is stateless: it receives the
     * whole message array each turn and holds no continuity, so a server-minted id would be fresh
     * on every request, which is the opposite of grouping. Keyed on `projectId` so switching
     * engagements starts a new thread rather than merging two conversations.
     */
    /**
     * Aborts the in-flight turn when the user presses Stop.
     *
     * Worth having because a Brio turn costs a credit from a capped allowance: a question the user
     * immediately realises was wrong should not have to run to completion. The server still meters
     * whatever tokens were generated, so stopping is honest rather than free.
     */
    const abortRef = useRef<AbortController | null>(null)

    const threadIdRef = useRef<{ key: string; id: string } | null>(null)
    if (threadIdRef.current?.key !== projectId) {
        threadIdRef.current = { key: projectId, id: crypto.randomUUID() }
    }

    useEffect(() => { setHistory(getChatHistory(projectId)) }, [projectId])

    // Grow the composer with its content, up to three lines.
    //
    // Driven from `input` rather than from the keystroke, so it is also correct when the value
    // changes some other way — picking a suggestion, clearing after send. Height is reset to `auto`
    // first because scrollHeight never shrinks below the element's current height, so without the
    // reset the box would grow and never come back down.
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`
    }, [input])

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Two sources, in priority order.
    //
    // Before the first answer there is no conversation to follow on from, so chips come from the
    // engagement's own data — a chip is only offered when it has an answer ("What's overdue?" on an
    // engagement with nothing overdue costs a credit to say "nothing").
    //
    // After an answer the model's own follow-ups win, because only it knows what it just said. They
    // arrive on a sentinel line in the same stream, so they cost no extra call. Falling back to the
    // data-driven list keeps the row populated if a reply omits the marker.
    //
    // `suggestionsOverride` is honoured even when EMPTY. A caller that supplies its own prompts
    // asynchronously (Files fetches them server-side) passes `[]` while they load, and showing the
    // engagement set in that gap made the chips visibly swap out from under the user. An absent
    // override — Overview, which has no prompts of its own — still gets the engagement chips.
    const dataSuggestions = useMemo(
        () => suggestionsOverride
            ? suggestionsOverride.filter((q) => !asked.has(q))
            : buildChatSuggestions(data, asked),
        [suggestionsOverride, data, asked],
    )

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const modelFollowUps = useMemo(() => {
        if (!lastAssistant?.content) return []
        return parseChatReply(lastAssistant.content).followUps.filter((q) => !asked.has(q))
    }, [lastAssistant?.content, asked])

    const suggestions = modelFollowUps.length > 0 ? modelFollowUps : dataSuggestions

    /**
     * Keeps the newest content in view as it arrives, and again once the turn settles.
     *
     * `streaming` is a dependency, not just `messages`: the action bar — copy, retry, the rating
     * thumbs — renders only after streaming stops, in a render that no message change triggers. So
     * scrolling on `messages` alone always landed a row short, leaving those controls just below
     * the fold.
     *
     * The settled scroll runs after paint rather than inside the effect body, because the action
     * bar has not been laid out yet at effect time and `scrollHeight` would still be the old value.
     *
     * `aboveThread` is a dependency too: an agent question renders there, not as a message, so a
     * new one arriving changed neither `messages` nor `streaming` and the view stayed where it was
     * — the question appeared below the fold and the user had to scroll to find what they were
     * being asked.
     */
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        // Auto-follow only while the reader is already at the bottom. Yanking the view back while
        // someone is scrolled up re-reading an earlier answer is worse than not following at all.
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AUTOSCROLL_SLACK_PX
        if (!nearBottom && streaming) return

        const toBottom = (behavior: ScrollBehavior) =>
            el.scrollTo({ top: el.scrollHeight, behavior })

        if (streaming) {
            // Instant while tokens arrive: a smooth scroll is still animating when the next chunk
            // lands, so each one restarts it and the view never catches up.
            toBottom('auto')
            return
        }

        const frame = requestAnimationFrame(() => toBottom('smooth'))
        return () => cancelAnimationFrame(frame)
    }, [messages, streaming, aboveThread])

    const ask = useCallback(async (question: string) => {
        const trimmed = question.trim()
        if (!trimmed || streaming) return

        setError(null)
        setInput('')
        setAsked((prev) => new Set(prev).add(trimmed))
        setHistory(recordChatQuestion(projectId, trimmed))
        setHistoryOpen(false)

        // Refuse the plainly off-topic without a round-trip: instant, and it costs no credit. This
        // is a convenience gate, not the boundary — the real one is the system prompt plus a
        // context that contains nothing but this engagement's own counts and statuses.
        if (isObviouslyOutOfScope(trimmed)) {
            setMessages((prev) => [
                ...prev,
                { role: 'user', content: trimmed, at: Date.now() },
                { role: 'assistant', content: OUT_OF_SCOPE_REPLY, at: Date.now(), answerId: crypto.randomUUID() },
            ])
            inputRef.current?.focus()
            return
        }

        // History excludes the message being sent; the route appends it as the final user turn.
        const history = messages.slice(-12)
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed, at: Date.now() },
            { role: 'assistant', content: '', at: Date.now(), answerId: crypto.randomUUID() },
        ])
        setStreaming(true)

        const controller = new AbortController()
        abortRef.current = controller

        try {
            const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: trimmed, history }),
            }, AI_TIMEOUT_MS.stream, controller.signal)

            if (!res.ok) {
                if (res.status === 503) setUnavailable(true)
                const detail = await res.json().catch(() => null)
                throw new Error(detail?.error ?? 'Could not get an answer')
            }
            if (!res.body) throw new Error('No response stream')

            const reader = res.body.getReader()
            const decoder = new TextDecoder()

            for (;;) {
                // The fetch signal aborts the request, but a reader already handed out keeps
                // resolving, so the stop is enforced here too: cancel the body and leave the loop.
                if (controller.signal.aborted) {
                    await reader.cancel().catch(() => {})
                    throw new AiAbortedError()
                }
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = {
                        ...next[next.length - 1],
                        content: next[next.length - 1].content + chunk,
                    }
                    return next
                })
            }
        } catch (e) {
            // A deliberate stop is not a failure, so it shows no error. Whatever had arrived is
            // kept and marked stopped; if nothing had, the empty bubble is dropped like any other
            // turn that produced no answer.
            if (e instanceof AiAbortedError) {
                setMessages((prev) => {
                    if (!prev.length) return prev
                    const last = prev[prev.length - 1]
                    if (last.role !== 'assistant') return prev
                    if (!last.content) return prev.slice(0, -1)
                    return [...prev.slice(0, -1), { ...last, stopped: true }]
                })
                return
            }
            // A timeout gets its own wording: "Could not get an answer" reads like a refusal,
            // when in fact nothing came back in time and retrying is worthwhile.
            setError(
                e instanceof AiTimeoutError
                    ? `${ASSISTANT.name} took too long to answer. Try asking again.`
                    : e instanceof Error ? e.message : 'Something went wrong',
            )
            // Drop the empty assistant placeholder so a failed turn leaves no blank bubble.
            setMessages((prev) => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev))
        } finally {
            abortRef.current = null
            setStreaming(false)
            inputRef.current?.focus()
            // Tells the top-bar balance to refresh. An event rather than a poll: credits only move
            // when someone spends one, and this is the moment that happened.
            window.dispatchEvent(new Event('firma-ai-credit-spent'))
        }
    }, [projectId, messages, streaming])

    /**
     * Stops the answer currently streaming.
     *
     * The server meters whatever was generated, so this saves the user the rest of the answer, not
     * the whole credit — the request had already reached the model.
     */
    const stop = useCallback(() => {
        abortRef.current?.abort()
    }, [])

    /**
     * Re-asks the question that produced a given answer.
     *
     * Drops the old question/answer pair before re-asking so the thread does not fill with
     * near-identical replies — a retry is a correction, not a new turn. Costs a credit like any
     * other question, which is why it is a deliberate click rather than automatic on a poor answer.
     */
    const retry = useCallback((assistantIndex: number) => {
        if (streaming) return
        const question = messages[assistantIndex - 1]
        if (question?.role !== 'user') return
        setMessages((prev) => prev.slice(0, assistantIndex - 1))
        // Ratings are keyed by position in the message array, and the retried pair is about to be
        // dropped — so every rating from here on would otherwise re-attach to whatever lands in its
        // slot, showing a thumbs-down on an answer the user never saw. The stored rows are
        // unaffected: they are keyed by answerId, not position.
        setRatings((prev) => {
            const next: typeof prev = {}
            for (const [k, v] of Object.entries(prev)) {
                if (Number(k) < assistantIndex - 1) next[Number(k)] = v
            }
            return next
        })
        void ask(question.content)
    }, [messages, streaming, ask])

    /**
     * Records or corrects a thumbs rating on an answer.
     *
     * Optimistic: the UI marks the rating immediately, because a thumb that waits on the network
     * before responding feels broken. The toast then confirms what actually reached the server.
     *
     * The rating is written on the thumb click and again when a chip is picked. Both carry the same
     * `answerId`, so the server upserts and the second write corrects the first rather than adding a
     * row — which is what makes the rating editable without inflating the efficacy counts.
     *
     * The question is sent so a negative rating is actionable; without it a thumbs-down says only
     * that something was wrong, on an answer nobody can see. The answer itself is never sent.
     */
    const rate = useCallback(async (assistantIndex: number, helpful: boolean, reason?: FeedbackReason) => {
        const previous = ratings[assistantIndex]
        setRatings((prev) => ({ ...prev, [assistantIndex]: { helpful, reason } }))

        const question = messages[assistantIndex - 1]?.role === 'user'
            ? messages[assistantIndex - 1].content
            : undefined

        try {
            const res = await fetch(`/api/projects/${projectId}/ai-feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    helpful,
                    reason,
                    question,
                    answerId: messages[assistantIndex]?.answerId,
                    threadId: threadIdRef.current?.id,
                }),
            })
            if (!res.ok) throw new Error(String(res.status))

            addToast({
                type: 'success',
                title: 'Thanks — feedback recorded',
                // Only say what we actually do with it. This does not retrain anything, and the
                // detail is what makes the rating usable rather than a bare tally.
                message: reason
                    ? 'It tells us which prompts to fix.'
                    : helpful
                        ? 'Tell us what was good about it to make it more useful.'
                        : 'Tell us what went wrong to make it more useful.',
            })
        } catch {
            // Roll back so the UI does not claim a rating the server never took — the user can
            // click again. Silent failure was acceptable when nothing confirmed success; now that
            // a toast does, a thumb left marked after a failed write would be a lie.
            setRatings((prev) => {
                const next = { ...prev }
                if (previous) next[assistantIndex] = previous
                else delete next[assistantIndex]
                return next
            })
            addToast({
                type: 'error',
                title: "Couldn't record that",
                message: 'Your rating was not saved. Please try again.',
            })
        }
    }, [projectId, messages, ratings, addToast])

    /**
     * Copies the whole conversation as Markdown.
     *
     * Copy rather than download: a Brio conversation almost always ends up pasted into an
     * engagement note, a client update, or a message to a colleague. A .md file in ~/Downloads is a
     * worse clipboard.
     */
    const copyTranscript = useCallback(async () => {
        const text = buildChatTranscript(messages, {
            engagementName: engagementName ?? undefined,
            clientName: clientName ?? undefined,
        })
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            setTranscriptCopied(true)
            setTimeout(() => setTranscriptCopied(false), 1500)
        } catch {
            // Clipboard blocked (permissions, insecure context). Nothing useful to say.
        }
    }, [messages, engagementName, clientName])

    /** Copies the visible answer — parsed, so the follow-up sentinel never lands on the clipboard. */
    const copyAnswer = useCallback(async (index: number, content: string) => {
        try {
            await navigator.clipboard.writeText(parseChatReply(content).answer)
            setCopiedIndex(index)
            setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500)
        } catch {
            // Clipboard blocked (permissions, insecure context). Nothing useful to say.
        }
    }, [])

    // Deliberately not `return null`: the panel renders before we can know AI is unconfigured,
    // so unmounting here would make it vanish underneath the user right after they asked a
    // question. Show it inert with an explanation instead.
    if (unavailable) {
        return (
            <div className={`bg-white p-4 ${
                chrome === 'floating' ? 'rounded-b-lg' : 'border border-[#e5e7eb] rounded shadow-sm'
            }`}>
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-gray-900">Ask</span>
                    <Brio className="text-sm text-gray-400" />
                </div>
                <p className="text-xs text-gray-500">
                    {ASSISTANT.name} is not available right now. Everything else on this page works as usual.
                </p>
            </div>
        )
    }

    // The primary accent and tinted header are deliberate: this panel sits in a column of
    // uniformly white cards, where it read as one more widget rather than the one thing on the
    // page that answers questions.
    //
    // `relative` on the card anchors the history overlay; `overflow-hidden` then keeps that overlay
    // inside the card, which is what we want — it should never spill over the Action Center below.
    return (
        <div className={`relative bg-white flex flex-col overflow-hidden ${
            chrome === 'floating' ? 'min-h-0 flex-1 rounded-b-lg' : 'border border-primary/25 rounded shadow-sm'
        }`}>
            <div className="flex items-start gap-2 border-b border-primary/15 bg-primary/5 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {/* No separate sparkle: the Brio mark already carries one, and two side by
                            side read as two different things rather than one brand. */}
                        <span className="text-sm font-semibold text-gray-900">Ask</span>
                        <Brio className="text-sm text-primary" />
                    </div>
                    {/* What this panel can DO, under the name rather than in the thread.
                        As an empty-state line it was the first thing in the conversation and the
                        first thing pushed out of it — the one moment a user wants to know what is
                        on offer is before they have asked anything, and it vanished the instant
                        they did. In the header it stays. */}
                    {capabilityNote && (
                        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                            {capabilityNote}
                        </p>
                    )}
                </div>
                <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-primary/70">
                    This engagement
                </span>
                {/* Only offered once there is something to recall. Questions survive reload;
                    answers deliberately do not — see lib/ai/chat-history.ts. */}
                {/* Only once there is a conversation to export, and only on this panel — which
                    internal roles alone can see, so a transcript cannot reach an external
                    collaborator who never had access to Brio in the first place. */}
                {messages.some((m) => m.content.trim()) && (
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => void copyTranscript()}
                                    aria-label="Copy conversation"
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-primary/70 transition-colors hover:bg-primary/10"
                                >
                                    {transcriptCopied
                                        ? <Check className="h-3 w-3" />
                                        : <ClipboardList className="h-3 w-3" />}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                {transcriptCopied
                                    ? 'Conversation copied'
                                    : 'Copy this conversation as Markdown, ready to paste into a note or update'}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                {history.length > 0 && (
                    // The count alone did not say what it counted — a clock and a number could as
                    // easily have meant elapsed time or unread items.
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => setHistoryOpen((o) => !o)}
                                    aria-expanded={historyOpen}
                                    aria-label={historyOpen
                                        ? 'Hide recent questions'
                                        : `Show ${history.length} recent question${history.length === 1 ? '' : 's'}`}
                                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                                        historyOpen ? 'bg-primary/15 text-primary' : 'text-primary/70 hover:bg-primary/10'
                                    }`}
                                >
                                    {historyOpen ? <X className="h-3 w-3" /> : <History className="h-3 w-3" />}
                                    {history.length}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                {historyOpen
                                    ? 'Hide recent questions'
                                    : `${history.length} question${history.length === 1 ? '' : 's'} you have asked here before. Answers are not saved — picking one asks it again against current data.`}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Overlays the conversation rather than displacing it. In normal flow this pushed the
                thread down by its own height, so opening history scrolled the answer you were
                reading off screen — and closing it jumped you back. */}
            {historyOpen && (
                /* `bottom-0` as well as `top`: anchored only from the top, the overlay had no
                   height of its own and the panel's overflow-hidden clipped the list mid-line
                   instead of letting it scroll. Bounding it to the panel gives the inner list a
                   real height to scroll within. `min-h-0` lets that child actually shrink — a flex
                   item defaults to min-content and would otherwise refuse to. */
                <div className="absolute inset-x-0 bottom-0 top-[2.75rem] z-20 flex flex-col border-b border-gray-200 bg-white px-4 py-2 shadow-md">
                    <div className="mb-1.5 flex shrink-0 items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Recent questions
                        </span>
                        <button
                            type="button"
                            onClick={() => { clearChatHistory(projectId); setHistory([]); setHistoryOpen(false) }}
                            className="text-[10px] text-gray-400 transition-colors hover:text-gray-700"
                        >
                            Clear
                        </button>
                    </div>
                    {/* Takes the space the overlay has rather than a fixed ceiling, so a tall
                        panel shows more of the ten entries and a short one still scrolls.

                        Chips, matching the suggestion row below: as plain stacked lines these read
                        as prose rather than as things to click, and a truncated line with no border
                        looked like broken text instead of a shortened label. Wrapping chips make
                        each entry a discrete target, and the short ones share a row instead of each
                        taking a full line. */}
                    <TooltipProvider delayDuration={150}>
                        <div className="hover-scrollbar flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto">
                            {history.map((h) => (
                                // Same Radix tooltip as the suggestion chips: the questions a user
                                // typed are often longer than the panel is wide, so truncation is
                                // the norm here and the full text has to stay reachable on hover.
                                <Tooltip key={`${h.question}-${h.askedAt}`}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => ask(h.question)}
                                            disabled={streaming}
                                            className="flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1.5 pl-2.5 pr-3 text-left text-xs text-gray-600 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                                        >
                                            {/* When it was last asked, inside the chip rather than
                                                on a second line: these answers are regenerated
                                                against live data, so how stale the previous one was
                                                is the thing that decides whether to re-ask. */}
                                            <Clock className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                                            <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
                                                {formatRelativeTime(new Date(h.askedAt))}
                                            </span>
                                            <span className="truncate">{h.question}</span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                        {h.question}
                                        <span className="mt-0.5 block text-[10px] opacity-70">
                                            Last asked {formatDateTimeWithTZ(new Date(h.askedAt))}
                                        </span>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    </TooltipProvider>
                    <p className="mt-1.5 shrink-0 text-[10px] text-gray-400">
                        Answers are not stored — picking one asks it again against current data.
                    </p>
                </div>
            )}

            <div
                ref={scrollRef}
                /* Floating gets the taller window and no minimum: the overlay should hug an empty
                   thread rather than reserve a blank 180px above the composer. In-column keeps the
                   minimum, where a collapsing card would make the rail jump. */
                className={`hover-scrollbar px-4 py-4 space-y-3 overflow-y-auto ${
                    chrome === 'floating'
                        // Fills the frame's fixed height and scrolls inside it, rather than
                        // setting the panel's height by growing.
                        ? 'min-h-0 flex-1'
                        : 'max-h-[480px] min-h-[180px]'
                }`}
            >
                {/* Shown only where the header does not already say what this panel does.
                    "Without your consent" rather than a flat "can't change anything": the latter
                    was true when Brio only answered questions and became false the moment it could
                    rename a file. The promise worth making is not that it cannot act — it is that
                    it never acts unasked, which holds on every surface and stays true as the agent
                    gains more it can do. */}
                {messages.length === 0 && !aboveThread && !capabilityNote && (
                    <p className="text-sm text-gray-500">
                        {emptyStateNote ?? (
                            <>
                                <Brio /> answers from this engagement&apos;s data, and never changes
                                anything without your consent.
                            </>
                        )}
                    </p>
                )}

                {messages.map((m, i) => (
                    <React.Fragment key={i}>
                    {/* Marks where the restored thread ends and this visit begins.
                        Restored answers were true when produced and may not be now — "3
                        deliverables are overdue" was right an hour ago. Dropping them on reload
                        loses the conversation; restoring them silently presents a stale figure as
                        current. The time each turn was produced is shown, so the reader can judge
                        rather than be told. */}
                    {restoredCount > 0 && i === restoredCount && (
                        // A wave rather than a straight rule — see `.fm-wave-rule` in
                        // globals.css for why, and why it is CSS rather than an inline SVG.
                        <div className="flex items-center gap-2 py-1 text-gray-300">
                            <div className="fm-wave-rule flex-1" aria-hidden />
                            <span className="shrink-0 text-[10px] text-gray-400">
                                Earlier · figures were current when asked
                            </span>
                            <div className="fm-wave-rule flex-1" aria-hidden />
                        </div>
                    )}
                    <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                            className={
                                m.role === 'user'
                                    // Grey bubble with black text rather than the former near-black
                                    // on white: the solid dark block pulled the eye to the question
                                    // instead of the answer. Kept light enough that black text
                                    // clears the 4.5:1 contrast minimum — a genuinely dark grey
                                    // would sit near 1.6:1 and be unreadable.
                                    // An absolute ceiling as well as the percentage: 85% of a
                                    // resized panel is still 85%, so without it a widened panel
                                    // produces bubbles of 150-character lines. The percentage keeps
                                    // bubbles off the opposite edge at narrow widths; the rem value
                                    // keeps the line readable at wide ones.
                                    ? 'bg-gray-200 text-gray-900 text-sm rounded-lg rounded-br-sm px-3 py-2 max-w-[85%] sm:max-w-[38rem]'
                                    // The ASSISTANT bubble takes the full width, and the cap moves
                                    // inside it (see ChatMarkdown): its prose is capped at the same
                                    // measure, but a table must be free to use the width the user
                                    // widened the panel for. Capping the bubble would make the
                                    // table scroll inside a 38rem box in a 56rem panel.
                                    : 'bg-gray-50 border border-gray-100 text-gray-800 text-sm rounded-lg rounded-bl-sm px-3 py-2 w-full whitespace-pre-line leading-relaxed'
                            }
                        >
                            {m.content ? (
                                // Only the final assistant bubble is still arriving; earlier turns
                                // render plain so they don't re-animate on every new token.
                                //
                                // Assistant text is parsed rather than shown raw: the reply carries
                                // its follow-up questions after a sentinel, and parseChatReply also
                                // hides a half-streamed marker so "<<FOLL" never flashes mid-answer.
                                m.role === 'assistant' && !(streaming && i === messages.length - 1) ? (
                                    // Settled assistant turns render as Markdown, so an answer can
                                    // carry a table or a list instead of needing a purpose-built
                                    // card per kind of structured output.
                                    <ChatMarkdown content={parseChatReply(m.content).answer} />
                                ) : (
                                    // Still streaming, or a user turn. Markdown is not rendered
                                    // mid-stream: a half-written table is a wall of pipes, and the
                                    // word animation needs plain text to tokenise.
                                    <StreamingText
                                        text={m.role === 'assistant' ? parseChatReply(m.content).answer : m.content}
                                        animate={m.role === 'assistant' && streaming && i === messages.length - 1}
                                    />
                                )
                            ) : (
                                // Elapsed time but no commentary: an answer is one model call, so
                                // there are no steps to narrate — listing them would be inventing
                                // detail. The timer still earns its place, since it is what tells a
                                // waiting user whether a slow answer is slow or stuck.
                                <span className="inline-flex items-center gap-1.5 text-gray-400">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <Brio /> is thinking
                                    <ElapsedTime className="text-[10px] text-gray-400" />
                                </span>
                            )}
                            {/* Says plainly that the answer is incomplete. Without this a stopped
                                turn is indistinguishable from a finished one, and a half-answer
                                about an engagement would read as the whole picture. */}
                            {m.stopped && (
                                <p className="mt-1 text-[11px] italic text-gray-400">
                                    Stopped — this answer is incomplete.
                                </p>
                            )}
                            {/* Actions on a settled answer only. While streaming the text is still
                                arriving, so copying it would capture a fragment and retrying would
                                race the in-flight request.

                                A stopped turn can be copied and re-asked but NOT rated: a thumbs
                                down on an answer the user cut short measures their impatience, not
                                the model, and would quietly corrupt the efficacy report. */}
                            {m.role === 'assistant' && m.content && !(streaming && i === messages.length - 1) && (
                                <AnswerActions
                                    at={m.at}
                                    copied={copiedIndex === i}
                                    rating={ratings[i]}
                                    disabled={streaming}
                                    rateable={!m.stopped}
                                    onCopy={() => void copyAnswer(i, m.content)}
                                    onRetry={() => retry(i)}
                                    onRate={(helpful, reason) => void rate(i, helpful, reason)}
                                />
                            )}
                        </div>
                    </div>
                    </React.Fragment>
                ))}

                {/* Agent questions render LAST, after the messages.
                    A conversation runs top to bottom with the newest turn at the bottom, and an
                    open question is the newest thing in it — the agent has just asked and is
                    waiting. Rendered first, the question sat above the report that prompted it,
                    so the exchange read backwards. */}
                {aboveThread}

                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            {/* Suggestions live ABOVE the input and outside the scroll area, so they survive the
                first question. Previously they rendered only while the thread was empty, which
                meant clicking one destroyed the other three with no way back short of a reload —
                turning a discovery aid into a single use. Each chip disappears once asked, so the
                row stays useful rather than repeating what is already answered above. */}
            {(suggestions.length > 0 || suggestionActions) && !streaming && (
                // Wraps rather than scrolling horizontally. A scroll row clipped the second chip
                // mid-word with no scrollbar and no affordance, so the options simply looked
                // broken; at this column width two per line is the honest layout.
                <TooltipProvider delayDuration={150}>
                    {/* A rule above the chips, marking where the conversation ends and the
                        controls begin. Without it the row sat flush against the scrolling thread
                        and read as the tail of the last answer rather than a set of actions.
                        Hairline, not a heavy divider: it separates two things that belong to the
                        same panel. */}
                    <div className="flex min-w-0 flex-wrap gap-1.5 border-t border-gray-100 px-4 pb-2.5 pt-2.5">
                        {suggestions.map((s) => (
                            // The shared Radix tooltip, not `title=`: the native one is slow to
                            // appear, unstyled, and sits outside the product's visual language.
                            <Tooltip key={s}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => ask(s)}
                                        className="max-w-full truncate rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-xs text-gray-600 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                                    >
                                        {s}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                    {s}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                        {suggestionActions}
                    </div>
                </TooltipProvider>
            )}

            <form
                onSubmit={(e) => { e.preventDefault(); ask(input) }}
                // A tinted strip behind the composer separates it from the thread without a rule.
                // The border alone was ambiguous where a message bubble ended near it.
                className="border-t border-gray-100 bg-gray-50/60 px-3 pb-3 pt-2.5"
            >
                {/* The composer is its own surface — a bordered, rounded box inset from the card —
                    rather than a hairline rule with text beneath it. At the bottom of a long thread
                    a divider alone did not read as somewhere to type. `focus-within` moves the ring
                    to this wrapper so the whole box lights up, not just the textarea inside it. */}
                <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20">
                {/* A textarea, not an input: a long question scrolled sideways in a single line, so
                    the user could not read back what they had typed. It grows to three rows and
                    scrolls beyond that, which keeps the panel from pushing the Action Center down
                    the page. Enter still sends; Shift+Enter starts a new line. */}
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void ask(input)
                        }
                    }}
                    placeholder={placeholder ?? `Ask ${ASSISTANT.name} about this engagement…`}
                    disabled={streaming}
                    maxLength={1000}
                    rows={1}
                    // maxHeight comes from the same constant the grow effect clamps to; as a
                    // Tailwind class it would be a second number to keep in step.
                    style={{ maxHeight: MAX_COMPOSER_HEIGHT_PX }}
                    className="hover-scrollbar flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 outline-none placeholder:text-gray-400 disabled:opacity-50"
                />
                    {/* While streaming, the spinner itself is the stop control: the ring carries the
                        "working" signal and the small square inside it says it can be interrupted.
                        A solid dark button read as a heavier commitment than stopping deserves, and
                        competed with the answer arriving beside it.

                        type="button" so it never submits the form. */}
                    {streaming ? (
                        <button
                            type="button"
                            onClick={stop}
                            className="group mb-0.5 relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-700"
                            aria-label="Stop generating"
                            title="Stop generating"
                        >
                            {/* Ring drawn as a bordered circle with one darker edge, so it reads as
                                a spinner without a second icon stacked over the square. */}
                            <span
                                aria-hidden
                                className="absolute inset-0 animate-spin rounded-full border-2 border-gray-200 border-t-primary"
                            />
                            <Square className="h-2.5 w-2.5 fill-current" />
                        </button>
                    ) : (
                        /* Filled once there is something to send, so the affordance is obvious
                           rather than a grey glyph that looks permanently disabled. */
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:brightness-105 disabled:bg-gray-100 disabled:text-gray-400"
                            aria-label="Send question"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </form>
        </div>
    )
}
