'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError } from '@/lib/ai/fetch-timeout'
import { StreamingText } from '@/components/ui/streaming-text'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

const SUGGESTIONS = [
    "What's overdue right now?",
    'Which deliverables are at risk?',
    'Summarise where this engagement stands',
    'What needs my attention this week?',
]

export function EngagementAiChat({ projectId }: { projectId: string }) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Set when the API reports AI is unavailable (no key) — hides the panel entirely.
    const [unavailable, setUnavailable] = useState(false)

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])

    const ask = useCallback(async (question: string) => {
        const trimmed = question.trim()
        if (!trimmed || streaming) return

        setError(null)
        setInput('')

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

    return (
        <div className="bg-white border border-[#e5e7eb] rounded shadow-sm flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Ask</span>
                <Brio className="text-sm text-primary" />
            </div>

            <div ref={scrollRef} className="px-4 py-4 space-y-3 max-h-[420px] overflow-y-auto">
                {messages.length === 0 && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-500">
                            <Brio /> answers only from this engagement&apos;s data, and can&apos;t change anything.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => ask(s)}
                                    className="text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
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
                                <StreamingText
                                    text={m.content}
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
