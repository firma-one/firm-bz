'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Send, Sparkles } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { StreamingText } from '@/components/ui/streaming-text'
import { DEMO_FREEFORM_REPLY, type DemoChatTurn } from '@/lib/demo/demo-brio'

type Message = { role: 'user' | 'assistant'; content: string; done: boolean }

/** How long "Brio is thinking" shows before the answer starts, and the pace it arrives at. */
const THINK_MS = 650
const TICK_MS = 35

/**
 * Static counterpart to FloatingAiChat + EngagementAiChat (components/projects/): the same launcher
 * pill, panel, header, prompt hints and composer, answering from canned replies built from the
 * sample data (lib/demo/demo-brio.ts). Typed questions get a reply saying the demo answers its own
 * prompts. Portalled to the body like the real panel, so it carries the app's design tokens rather
 * than the demo shell's legacy ones.
 *
 * Sits left of the demo's tour button, which owns the bottom-right corner.
 */
export function DemoBrioChat({
    title,
    turns,
    placeholder = `Ask ${ASSISTANT.name} about this engagement…`,
    capabilityNote,
}: {
    /** Names the page on the launcher and in the header, e.g. "Files". */
    title?: string
    turns: DemoChatTurn[]
    placeholder?: string
    capabilityNote?: React.ReactNode
}) {
    const [mounted, setMounted] = useState(false)
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const timers = useRef<number[]>([])

    useEffect(() => {
        setMounted(true)
        const pending = timers.current
        return () => pending.forEach((t) => window.clearTimeout(t))
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages, open])

    const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.content))
    const suggestions = turns.filter((t) => !asked.has(t.question))

    const ask = (raw: string) => {
        const question = raw.trim()
        if (!question || busy) return
        const answer = turns.find((t) => t.question === question)?.answer ?? DEMO_FREEFORM_REPLY
        setInput('')
        setBusy(true)
        setMessages((prev) => [...prev, { role: 'user', content: question, done: true }, { role: 'assistant', content: '', done: false }])

        // Arrives a couple of words at a time, the way a real answer streams in.
        const tokens = answer.split(/(\s+)/)
        let shown = 0
        const setLast = (content: string, done: boolean) =>
            setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content, done }])
        const tick = () => {
            shown = Math.min(tokens.length, shown + 4)
            const done = shown >= tokens.length
            setLast(tokens.slice(0, shown).join(''), done)
            if (done) setBusy(false)
            else timers.current.push(window.setTimeout(tick, TICK_MS))
        }
        timers.current.push(window.setTimeout(tick, THINK_MS))
    }

    if (!mounted) return null

    const headerNote = capabilityNote ?? (
        <>
            <Brio /> answers from this engagement&apos;s data, and never changes anything without your consent.
        </>
    )

    return createPortal(
        <>
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    data-demo-tour="ask-brio"
                    style={{ transformOrigin: 'bottom right' }}
                    className="fixed bottom-6 right-[84px] z-40 flex animate-in fade-in zoom-in-95 items-center gap-2 rounded-full border border-line bg-surface py-2 pl-3 pr-3.5 shadow-popover duration-200 transition-colors hover:border-line-strong hover:bg-surface-hover"
                    aria-label="Open the engagement assistant"
                >
                    <span className="text-sm font-medium text-fg">
                        Ask <Brio className="text-sm text-action" />
                        {title ? <span className="ml-1 text-fg-subtle">· {title}</span> : null}
                    </span>
                </button>
            )}

            {open && (
                <div
                    style={{ transformOrigin: 'bottom right' }}
                    className="fixed bottom-6 right-[84px] z-40 flex h-[min(32rem,calc(100vh-6rem))] w-[23rem] max-w-[calc(100vw-7rem)] animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-dialog duration-200"
                >
                    <div className="border-b border-line px-4 py-3">
                        <div className="flex items-start gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="text-sm font-semibold text-fg">Ask</span>
                                <Brio className="text-sm text-action" />
                            </div>
                            <span className="shrink-0 pt-0.5 text-caption text-fg-subtle">{title ?? 'This engagement'}</span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                                aria-label="Collapse the assistant"
                            >
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-caption leading-snug text-fg-muted">{headerNote}</p>
                    </div>

                    <div ref={scrollRef} className="hover-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4">
                        {messages.length === 0 && (
                            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                                <Sparkles className="h-5 w-5 text-action/30" aria-hidden />
                                <p className="mt-2 text-xs font-medium text-fg-muted">
                                    Ask <Brio noIcon /> about this engagement
                                </p>
                                <p className="mt-1 max-w-[16rem] text-caption leading-relaxed text-fg-subtle">
                                    Pick one of the questions below, or type your own.
                                </p>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                {m.role === 'user' ? (
                                    <div className="max-w-[85%] rounded-card bg-surface-muted px-3 py-2 text-ui text-fg">{m.content}</div>
                                ) : !m.content ? (
                                    <span className="inline-flex items-center gap-1.5 py-1 text-small text-fg-subtle">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <Brio /> is thinking
                                    </span>
                                ) : m.done ? (
                                    <ChatMarkdown content={m.content} className="w-full break-words px-0.5 py-1 text-fg" />
                                ) : (
                                    <div className="w-full whitespace-pre-line break-words px-0.5 py-1 text-ui leading-relaxed text-fg">
                                        <StreamingText text={m.content} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {suggestions.length > 0 && !busy && (
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-line px-4 pb-2.5 pt-2.5">
                            {suggestions.map((s) => (
                                <button
                                    key={s.question}
                                    type="button"
                                    onClick={() => ask(s.question)}
                                    className="group/chip inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-left text-small text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                                >
                                    <span className="truncate">{s.question}</span>
                                    <Send className="h-3 w-3 shrink-0 text-action/70 opacity-0 transition-opacity group-hover/chip:opacity-100" aria-hidden />
                                </button>
                            ))}
                        </div>
                    )}

                    <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="border-t border-line px-3 pb-3 pt-2.5">
                        <div className="flex items-end gap-2 rounded-card border border-line-strong bg-surface px-3 py-2 transition-colors focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        ask(input)
                                    }
                                }}
                                placeholder={placeholder}
                                disabled={busy}
                                rows={1}
                                className="max-h-24 flex-1 resize-none bg-transparent text-ui leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || busy}
                                className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:bg-surface-muted disabled:text-fg-subtle"
                                aria-label="Send question"
                            >
                                <Send className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>,
        document.body,
    )
}
