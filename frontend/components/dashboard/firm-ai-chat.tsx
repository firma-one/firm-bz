'use client'

// No longer mounted: the firm Overview uses the floating Brio panel (FloatingAiChat with a firm subject), kept until Deepak signs off.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Square, SquarePen } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { ASSISTANT, ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { CREDIT_WEIGHTS } from '@/lib/ai/features'
import { Brio } from '@/components/ui/brio'
import { Button } from '@/components/ui/button'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { StreamingText } from '@/components/ui/streaming-text'
import { ShimmerBar } from '@/components/ui/shimmer'
import { ElapsedTime } from '@/components/ui/elapsed-time'
import { Hint } from '@/components/ui/tooltip'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError, AiAbortedError } from '@/lib/ai/fetch-timeout'
import {
    BRIO_ANSWER_CUT_OFF,
    BRIO_ANSWER_FAILED,
    BRIO_TOO_SLOW,
    BRIO_UNREACHABLE_RETRY,
} from '@/lib/ai/brio-failure'
import { isObviouslyOutOfScope, stripSources, MAX_HISTORY_MESSAGES, MAX_QUESTION_LENGTH } from '@/lib/ai/engagement-chat'
import {
    FIRM_OUT_OF_SCOPE_REPLY,
    buildFirmChatStarters,
    linkEngagementNames,
    parseFirmChatReply,
    type FirmChatLink,
} from '@/lib/ai/firm-chat'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { useInAppLinks } from '@/lib/hooks/use-in-app-links'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

/** One turn of the conversation. Kept in memory only: a reload starts a new conversation. */
export interface FirmChatTurn {
    role: 'user' | 'assistant'
    content: string
    /** The person pressed Stop: the text is kept, and said to be incomplete. */
    stopped?: boolean
    /** The stream broke off (the model failed, declined, or the connection dropped). */
    cutOff?: boolean
}

const credits = CREDIT_WEIGHTS.firmChat
/** The caption under the composer, per the mock. */
export const FIRM_CHAT_CAPTION = `Firm admins only. ${ASSISTANT_POLICY.short} ${credits} credit${credits === 1 ? '' : 's'} per answer.`

/** The mock's suggestion pill: a question that asks itself when clicked. */
const PILL = 'inline-flex h-7 max-w-full items-center rounded-full border border-line-strong bg-surface px-2.5 text-small text-fg transition-colors hover:bg-surface-hover disabled:opacity-50'

/**
 * The conversation with the firm chat route: ask, stream, stop. Mirrors the engagement chat's
 * handling (components/projects/engagement-ai-chat.tsx): a partial answer is kept and marked cut off
 * in Brio's words when the stream breaks, a stop keeps what arrived, and the route's own words are
 * shown when it refuses (the credit limit, for one).
 *
 * Also gives up when the answer goes quiet for too long, reset on every chunk, so a stalled stream
 * can't hold the composer forever (fetchWithTimeout only bounds the wait for the first byte).
 */
export function useFirmChat(firmId: string) {
    const { session } = useAuth()
    const accessToken = session?.access_token
    const [turns, setTurns] = useState<FirmChatTurn[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // The route answered 503: AI isn't configured, so the panel leaves the page.
    const [unavailable, setUnavailable] = useState(false)
    const abortRef = useRef<AbortController | null>(null)
    // The conversation as of the last render, for `ask` to send as history without re-creating it.
    const turnsRef = useRef(turns)
    useEffect(() => { turnsRef.current = turns }, [turns])

    const ask = useCallback(async (raw: string) => {
        const question = raw.trim().slice(0, MAX_QUESTION_LENGTH)
        if (!question || abortRef.current) return
        setError(null)

        // Plainly off-topic: answered here, instantly and without a credit. The route repeats it.
        if (isObviouslyOutOfScope(question)) {
            setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: FIRM_OUT_OF_SCOPE_REPLY }])
            return
        }

        // The conversation so far, without the server's bookkeeping line. The route caps it too.
        const history = turnsRef.current
            .filter((t) => t.content)
            .slice(-MAX_HISTORY_MESSAGES)
            .map((t) => ({ role: t.role, content: stripSources(t.content) }))
        setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
        setBusy(true)

        const controller = new AbortController()
        abortRef.current = controller
        // Where it got to, so a failure says the right thing: the request never left, the route
        // refused it (its own words), or the answer broke off part-way.
        let phase: 'request' | 'response' | 'stream' = 'request'
        let received = false
        let idle: ReturnType<typeof setTimeout> | undefined
        const markLast = (patch: Partial<FirmChatTurn>) => setTurns((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            // No text arrived: drop the empty bubble rather than mark it.
            if (!last.content) return prev.slice(0, -1)
            return [...prev.slice(0, -1), { ...last, ...patch }]
        })

        try {
            const res = await fetchWithTimeout(`/api/firms/${firmId}/ai-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // As the brief sends it; the route also reads the session cookie.
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({ question, history }),
            }, AI_TIMEOUT_MS.stream, controller.signal)

            phase = 'response'
            if (!res.ok) {
                if (res.status === 503) setUnavailable(true)
                const detail = await res.json().catch(() => null) as { error?: string } | null
                throw new Error(detail?.error || BRIO_ANSWER_FAILED)
            }
            if (!res.body) throw new Error(BRIO_ANSWER_FAILED)

            phase = 'stream'
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            // Stop, or silence past the budget, cancels the read in progress; the loop then ends.
            const cancel = () => { void reader.cancel().catch(() => {}) }
            controller.signal.addEventListener('abort', cancel, { once: true })
            const arm = () => {
                clearTimeout(idle)
                idle = setTimeout(() => controller.abort('timeout'), AI_TIMEOUT_MS.stream)
            }
            arm()
            try {
                for (;;) {
                    const { done, value } = await reader.read()
                    if (controller.signal.aborted || done) break
                    arm()
                    const chunk = decoder.decode(value, { stream: true })
                    if (!chunk) continue
                    received = true
                    setTurns((prev) => {
                        const next = [...prev]
                        const last = next[next.length - 1]
                        next[next.length - 1] = { ...last, content: last.content + chunk }
                        return next
                    })
                }
            } finally {
                controller.signal.removeEventListener('abort', cancel)
            }
            if (controller.signal.aborted) {
                throw controller.signal.reason === 'timeout' ? new AiTimeoutError(AI_TIMEOUT_MS.stream) : new AiAbortedError()
            }
        } catch (e) {
            if (e instanceof AiAbortedError) {
                // A deliberate stop: no error, and what arrived is kept as incomplete.
                markLast({ stopped: true })
                return
            }
            if (e instanceof AiTimeoutError) {
                markLast({ cutOff: true })
                setError(BRIO_TOO_SLOW)
                return
            }
            if (phase === 'stream') {
                // The route fails the stream on a model error or a declined answer; a dropped
                // connection reads the same. Brio's words, never the browser's "network error".
                markLast({ cutOff: true })
                if (!received) setError(BRIO_ANSWER_FAILED)
                return
            }
            setError(
                phase === 'request' && e instanceof TypeError
                    ? BRIO_UNREACHABLE_RETRY
                    // The route's words, thrown above.
                    : e instanceof Error && e.name === 'Error' && e.message ? e.message : BRIO_ANSWER_FAILED,
            )
            markLast({})
        } finally {
            clearTimeout(idle)
            abortRef.current = null
            setBusy(false)
            // Tells the top bar's credit balance to refresh: one was spent.
            window.dispatchEvent(new Event('firma-ai-credit-spent'))
        }
    }, [firmId, accessToken])

    /** Ends the answer now. The server meters what was generated; the text so far stays. */
    const stop = useCallback(() => abortRef.current?.abort('stopped'), [])
    /** Starts a new conversation: the next question goes without the history. */
    const reset = useCallback(() => {
        if (abortRef.current) return
        setTurns([])
        setError(null)
    }, [])
    // Leaving the page stops the answer rather than streaming into a panel no one sees.
    useEffect(() => () => abortRef.current?.abort('stopped'), [])

    return { turns, busy, error, unavailable, ask, stop, reset }
}

/**
 * The firm chat as the mock draws it: a card under the brief with its heading, the conversation
 * (questions right, answers left with their tables and engagement links, "Drew on N engagements",
 * follow-up pills), one input with Ask, and the caption. Presentational, so the tour can feed it a
 * canned conversation (components/demo/demo-firm-chat.tsx).
 */
export function FirmChatPanel({
    turns,
    busy,
    error,
    starters,
    onAsk,
    onStop,
    onReset,
    hrefFor,
}: {
    turns: FirmChatTurn[]
    busy: boolean
    error?: string | null
    /** Questions for the empty panel. */
    starters: string[]
    onAsk: (question: string) => void
    onStop: () => void
    /** Starts a new conversation. Shown once there is one. */
    onReset?: () => void
    /** Where an engagement link goes, built from the server's slugs. */
    hrefFor: (link: FirmChatLink) => string
}) {
    const [input, setInput] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)
    const onLinkClick = useInAppLinks()

    const lastAssistant = useMemo(() => {
        for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === 'assistant') return i
        return -1
    }, [turns])
    const asked = useMemo(() => new Set(turns.filter((t) => t.role === 'user').map((t) => t.content)), [turns])

    // Follow the conversation while the reader is at the bottom; leave them be if they scrolled up.
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 || !busy) el.scrollTop = el.scrollHeight
    }, [turns, busy])

    // Said once when an answer starts and once when it ends, not word by word.
    const [announce, setAnnounce] = useState('')
    const wasBusy = useRef(false)
    useEffect(() => {
        if (busy && !wasBusy.current) setAnnounce(`${ASSISTANT.name} is answering.`)
        // A failure is announced by its own alert below, so it isn't said twice.
        else if (!busy && wasBusy.current) setAnnounce(error ? '' : 'The answer is ready.')
        wasBusy.current = busy
    }, [busy, error])

    const submit = (question: string) => {
        if (!question.trim() || busy) return
        setInput('')
        onAsk(question)
    }

    const pills = (questions: string[]) => (
        <div className="flex flex-wrap gap-1.5">
            {questions.map((question) => (
                <button key={question} type="button" disabled={busy} onClick={() => submit(question)} className={PILL}>
                    <span className="truncate">{question}</span>
                </button>
            ))}
        </div>
    )

    const freshStarters = starters.filter((s) => !asked.has(s))

    return (
        <section aria-labelledby="firm-chat-heading" data-firm-chat className="flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
                {/* h4: it sits inside the Business overview card, whose title is the h3. Sized like
                    the engagement chat's own heading, beside the brief's small header. */}
                <h4 id="firm-chat-heading" className="text-ui font-medium text-fg">
                    Ask <Brio noIcon /> about the firm
                </h4>
                {onReset && turns.length > 0 && (
                    <Hint label="New conversation">
                        <button
                            type="button"
                            onClick={onReset}
                            disabled={busy}
                            aria-label="New conversation"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                    </Hint>
                )}
            </div>

            <p className="sr-only" aria-live="polite">{announce}</p>

            {turns.length === 0 ? (
                freshStarters.length > 0 && pills(freshStarters)
            ) : (
                <div ref={scrollRef} className="hover-scrollbar flex max-h-[36rem] flex-col gap-3.5 overflow-y-auto overflow-x-hidden">
                    {turns.map((turn, i) => {
                        if (turn.role === 'user') {
                            return (
                                <div key={i} className="max-w-[70%] self-end whitespace-pre-line break-words rounded-card bg-surface-muted px-3 py-2 text-ui text-fg">
                                    {turn.content}
                                </div>
                            )
                        }
                        const parsed = parseFirmChatReply(turn.content)
                        const streamingThis = busy && i === turns.length - 1
                        // Under the newest answer: its own follow-ups, or the starting questions when
                        // it has none (an off-topic reply, a stopped answer), so there is always a next step.
                        const modelFollowUps = parsed.followUps.filter((f) => !asked.has(f))
                        const followUps = i === lastAssistant && !busy
                            ? (modelFollowUps.length > 0 ? modelFollowUps : freshStarters)
                            : []
                        const drewOn = parsed.sources?.drewOn ?? 0
                        return (
                            <div key={i} className="flex min-w-0 flex-col gap-2.5 text-ui text-fg">
                                {!turn.content ? (
                                    // Thinking: shaped like the answer that is coming, with the time
                                    // so far, as the engagement chat does.
                                    <div className="flex w-full flex-col gap-1.5 py-1" role="status">
                                        <ShimmerBar className="w-full" />
                                        <ShimmerBar className="w-[88%]" />
                                        <ShimmerBar className="w-[62%]" />
                                        <span className="mt-1 inline-flex items-center gap-1 text-caption text-fg-subtle">
                                            <Brio /> is thinking
                                            <ElapsedTime className="text-caption text-fg-subtle" />
                                        </span>
                                    </div>
                                ) : streamingThis ? (
                                    <span className="whitespace-pre-line break-words leading-relaxed">
                                        <StreamingText text={parsed.answer} />
                                    </span>
                                ) : (
                                    <div onClickCapture={onLinkClick}>
                                        <ChatMarkdown content={linkEngagementNames(parsed.answer, parsed.sources?.engagements, hrefFor)} />
                                    </div>
                                )}
                                {turn.stopped && (
                                    <p className="text-caption italic text-fg-subtle">Stopped · this answer is incomplete.</p>
                                )}
                                {turn.cutOff && (
                                    <p role="status" className="text-caption italic text-fg-subtle">{BRIO_ANSWER_CUT_OFF}</p>
                                )}
                                {!streamingThis && drewOn > 0 && (
                                    <p className="text-small text-fg-muted">
                                        Drew on {drewOn} engagement{drewOn === 1 ? '' : 's'}
                                    </p>
                                )}
                                {followUps.length > 0 && pills(followUps)}
                            </div>
                        )
                    })}
                </div>
            )}

            {error && <p role="alert" className="text-small text-danger">{error}</p>}

            <form
                onSubmit={(e) => { e.preventDefault(); submit(input) }}
                className="flex items-center gap-2 rounded-control border border-line-strong bg-surface py-1.5 pl-3 pr-1.5 transition-[border-color,box-shadow] focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20"
            >
                <label htmlFor="firm-chat-input" className="sr-only">Ask {ASSISTANT.name} about the firm</label>
                <input
                    id="firm-chat-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={busy}
                    maxLength={MAX_QUESTION_LENGTH}
                    placeholder="Ask about engagements, clients or deadlines"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
                />
                {busy ? (
                    <Button type="button" size="sm" variant="outline" onClick={onStop}>
                        <Square className="h-3 w-3 fill-current" aria-hidden /> Stop
                    </Button>
                ) : (
                    <Button type="submit" size="sm" disabled={!input.trim()}>Ask</Button>
                )}
            </form>

            <p className="text-caption font-normal text-fg-muted">{FIRM_CHAT_CAPTION}</p>
        </section>
    )
}

/**
 * Ask Brio about the firm (.claude/plans/brio-features-round-2.md §3.4), on the firm's Analytics
 * tab under the brief. Firm admins only: the tab is, and the route checks `can_manage` again.
 * Leaves the page when AI isn't configured.
 */
export function FirmAiChat({ firmId, groupSlug, firmSlug, data }: {
    firmId: string
    groupSlug: string
    firmSlug: string
    /** The insights the Overview already holds, for the starting questions. */
    data?: FirmInsightsResponse | null
}) {
    const chat = useFirmChat(firmId)
    const starters = useMemo(() => buildFirmChatStarters(data), [data])
    const hrefFor = useCallback(
        (l: FirmChatLink) => engagementPath(groupSlug, firmSlug, l.clientSlug, l.slug, { tab: 'analytics' }),
        [groupSlug, firmSlug],
    )
    if (chat.unavailable) return null
    return (
        <FirmChatPanel
            turns={chat.turns}
            busy={chat.busy}
            error={chat.error}
            starters={starters}
            onAsk={(q) => void chat.ask(q)}
            onStop={chat.stop}
            onReset={chat.reset}
            hrefFor={hrefFor}
        />
    )
}
