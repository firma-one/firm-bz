'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError } from '@/lib/ai/fetch-timeout'
import { StreamingText } from '@/components/ui/streaming-text'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { buildChatSuggestions } from '@/lib/ai/chat-suggestions'
import { isObviouslyOutOfScope, OUT_OF_SCOPE_REPLY, parseChatReply } from '@/lib/ai/engagement-chat'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

export function EngagementAiChat({
    projectId,
    data,
}: {
    projectId: string
    /** Insights payload the page already holds; drives data-aware suggestions. */
    data?: EngagementInsightsResponse | null
}) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Set when the API reports AI is unavailable (no key) — hides the panel entirely.
    const [unavailable, setUnavailable] = useState(false)
    // Questions already put to the model this session, so a chip is not offered twice.
    const [asked, setAsked] = useState<Set<string>>(() => new Set())

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

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

        // Refuse the plainly off-topic without a round-trip: instant, and it costs no credit. This
        // is a convenience gate, not the boundary — the real one is the system prompt plus a
        // context that contains nothing but this engagement's own counts and statuses.
        if (isObviouslyOutOfScope(trimmed)) {
            setMessages((prev) => [
                ...prev,
                { role: 'user', content: trimmed },
                { role: 'assistant', content: OUT_OF_SCOPE_REPLY },
            ])
            inputRef.current?.focus()
            return
        }

        // History excludes the message being sent; the route appends it as the final user turn.
        const history = messages.slice(-12)
        setMessages((prev) => [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }])
        setStreaming(true)

        try {
            const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: trimmed, history }),
            }, AI_TIMEOUT_MS.stream)

            if (!res.ok) {
                if (res.status === 503) setUnavailable(true)
                const detail = await res.json().catch(() => null)
                throw new Error(detail?.error ?? 'Could not get an answer')
            }
            if (!res.body) throw new Error('No response stream')

            const reader = res.body.getReader()
            const decoder = new TextDecoder()

            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = {
                        role: 'assistant',
                        content: next[next.length - 1].content + chunk,
                    }
                    return next
                })
            }
        } catch (e) {
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
            setStreaming(false)
            inputRef.current?.focus()
        }
    }, [projectId, messages, streaming])

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
    return (
        <div className="bg-white border border-primary/25 rounded shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-900">Ask</span>
                <Brio className="text-sm text-primary" />
                <span className="ml-auto text-[10px] uppercase tracking-wider text-primary/70">
                    This engagement
                </span>
            </div>

            <div ref={scrollRef} className="px-4 py-4 space-y-3 max-h-[480px] min-h-[180px] overflow-y-auto">
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
                                    ? 'bg-gray-900 text-white text-sm rounded-lg rounded-br-sm px-3 py-2 max-w-[85%]'
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
                className="flex items-center gap-2 px-4 py-3 border-t border-gray-100"
            >
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Ask ${ASSISTANT.name} about this engagement…`}
                    disabled={streaming}
                    maxLength={1000}
                    className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={streaming || !input.trim()}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors shrink-0"
                    aria-label="Send question"
                >
                    {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </form>
        </div>
    )
}
