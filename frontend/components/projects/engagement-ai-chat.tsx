'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2, Sparkles, Copy, Check, RotateCcw, History, X, ThumbsUp, ThumbsDown, ClipboardList, Square } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError, AiAbortedError } from '@/lib/ai/fetch-timeout'
import { StreamingText } from '@/components/ui/streaming-text'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getChatHistory, recordChatQuestion, clearChatHistory, type ChatHistoryEntry } from '@/lib/ai/chat-history'
import { reasonsFor, type FeedbackReason } from '@/lib/ai/feedback-reasons'
import { useToast } from '@/components/ui/toast'
import { buildChatTranscript } from '@/lib/ai/chat-transcript'
import { buildChatSuggestions } from '@/lib/ai/chat-suggestions'
import { isObviouslyOutOfScope, OUT_OF_SCOPE_REPLY, parseChatReply } from '@/lib/ai/engagement-chat'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

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
}: {
    projectId: string
    /** Insights payload the page already holds; drives data-aware suggestions. */
    data?: EngagementInsightsResponse | null
    /** Titles the exported transcript. Optional — it falls back to "this engagement". */
    engagementName?: string | null
    clientName?: string | null
}) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
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
    const dataSuggestions = useMemo(() => buildChatSuggestions(data, asked), [data, asked])

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const modelFollowUps = useMemo(() => {
        if (!lastAssistant?.content) return []
        return parseChatReply(lastAssistant.content).followUps.filter((q) => !asked.has(q))
    }, [lastAssistant?.content, asked])

    const suggestions = modelFollowUps.length > 0 ? modelFollowUps : dataSuggestions

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])

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
            <div className="bg-white border border-[#e5e7eb] rounded shadow-sm p-4">
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
        <div className="relative bg-white border border-primary/25 rounded shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-900">Ask</span>
                <Brio className="text-sm text-primary" />
                <span className="ml-auto text-[10px] uppercase tracking-wider text-primary/70">
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
                <div className="absolute inset-x-0 top-[2.75rem] z-20 border-b border-gray-200 bg-white px-4 py-2 shadow-md">
                    <div className="mb-1.5 flex items-center justify-between">
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
                    {/* Scrolls past about five entries rather than growing. The list is capped at
                        ten, and letting all ten render pushed the conversation out of the panel —
                        the history is a lookup, not the main view. */}
                    <div className="hover-scrollbar flex max-h-[9rem] flex-col gap-0.5 overflow-y-auto">
                        {history.map((h) => (
                            <button
                                key={`${h.question}-${h.askedAt}`}
                                type="button"
                                onClick={() => ask(h.question)}
                                disabled={streaming}
                                className="truncate rounded px-1.5 py-1 text-left text-xs text-gray-600 transition-colors hover:bg-white hover:text-primary disabled:opacity-50"
                            >
                                {h.question}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                        Answers are not stored — picking one asks it again against current data.
                    </p>
                </div>
            )}

            <div ref={scrollRef} className="hover-scrollbar px-4 py-4 space-y-3 max-h-[480px] min-h-[180px] overflow-y-auto">
                {messages.length === 0 && (
                    <p className="text-sm text-gray-500">
                        <Brio /> answers only from this engagement&apos;s data, and can&apos;t change anything.
                    </p>
                )}

                {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                            className={
                                m.role === 'user'
                                    // Grey bubble with black text rather than the former near-black
                                    // on white: the solid dark block pulled the eye to the question
                                    // instead of the answer. Kept light enough that black text
                                    // clears the 4.5:1 contrast minimum — a genuinely dark grey
                                    // would sit near 1.6:1 and be unreadable.
                                    ? 'bg-gray-200 text-gray-900 text-sm rounded-lg rounded-br-sm px-3 py-2 max-w-[85%]'
                                    : 'bg-gray-50 border border-gray-100 text-gray-800 text-sm rounded-lg rounded-bl-sm px-3 py-2 max-w-[85%] whitespace-pre-line leading-relaxed'
                            }
                        >
                            {m.content ? (
                                // Only the final assistant bubble is still arriving; earlier turns
                                // render plain so they don't re-animate on every new token.
                                //
                                // Assistant text is parsed rather than shown raw: the reply carries
                                // its follow-up questions after a sentinel, and parseChatReply also
                                // hides a half-streamed marker so "<<FOLL" never flashes mid-answer.
                                <StreamingText
                                    text={m.role === 'assistant' ? parseChatReply(m.content).answer : m.content}
                                    animate={m.role === 'assistant' && streaming && i === messages.length - 1}
                                />
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-gray-400">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <Brio /> is thinking
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
                ))}

                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            {/* Suggestions live ABOVE the input and outside the scroll area, so they survive the
                first question. Previously they rendered only while the thread was empty, which
                meant clicking one destroyed the other three with no way back short of a reload —
                turning a discovery aid into a single use. Each chip disappears once asked, so the
                row stays useful rather than repeating what is already answered above. */}
            {suggestions.length > 0 && !streaming && (
                // Wraps rather than scrolling horizontally. A scroll row clipped the second chip
                // mid-word with no scrollbar and no affordance, so the options simply looked
                // broken; at this column width two per line is the honest layout.
                <TooltipProvider delayDuration={150}>
                    <div className="flex flex-wrap gap-1.5 px-4 pb-2.5 pt-0.5">
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
                    placeholder={`Ask ${ASSISTANT.name} about this engagement…`}
                    disabled={streaming}
                    maxLength={1000}
                    rows={1}
                    // maxHeight comes from the same constant the grow effect clamps to; as a
                    // Tailwind class it would be a second number to keep in step.
                    style={{ maxHeight: MAX_COMPOSER_HEIGHT_PX }}
                    className="hover-scrollbar flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 outline-none placeholder:text-gray-400 disabled:opacity-50"
                />
                    {/* While streaming this becomes Stop rather than a spinner. A spinner says
                        "wait"; a question the user already regrets should be stoppable, and a turn
                        costs a credit. type="button" so it never submits the form. */}
                    {streaming ? (
                        <button
                            type="button"
                            onClick={stop}
                            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-700"
                            aria-label="Stop generating"
                            title="Stop generating"
                        >
                            <Square className="h-3 w-3 fill-current" />
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
