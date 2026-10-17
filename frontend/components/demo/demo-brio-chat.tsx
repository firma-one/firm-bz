'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, ChevronDown, CornerDownRight, Folder, Info, MessageSquare, Send } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { StreamingText } from '@/components/ui/streaming-text'
import { ShimmerBar } from '@/components/ui/shimmer'
import { Hint } from '@/components/ui/tooltip'
import type { OpeningFact } from '@/lib/ai/chat-suggestions'
import { DEMO_FREEFORM_REPLY, type DemoChatTurn } from '@/lib/demo/demo-brio'

type Message = { role: 'user' | 'assistant'; content: string; done: boolean }

/** How long "Brio is thinking" shows before the answer starts, and the pace it arrives at. */
const THINK_MS = 900
const TICK_MS = 35

const FACT_TONE: Record<OpeningFact['tone'], string> = {
    red: 'bg-tag-red-fg',
    yellow: 'bg-tag-yellow-fg',
    gray: 'bg-fg-subtle',
}

/** The app's suggestion row (engagement-ai-chat.tsx), for starters, facts and "Ask next". */
function SuggestionRow({ leading, label, onClick, disabled }: { leading: React.ReactNode; label: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="group/row flex w-full min-w-0 items-start gap-2 rounded-control px-2 py-1.5 text-left text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
        >
            <span className="flex h-5 w-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{leading}</span>
            <span className="min-w-0 flex-1 leading-5">{label}</span>
            <Send className="mt-1 h-3 w-3 shrink-0 text-action/70 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" aria-hidden />
        </button>
    )
}

/**
 * Static counterpart to FloatingAiChat + EngagementAiChat (components/projects/): the same launcher
 * pill, one-row header, empty state (what Brio can do, what is true right now, questions to try),
 * "Ask next" under each answer, composer with its scope chip, shimmer while thinking, and ⌘J —
 * answering from canned replies built from the sample data (lib/demo/demo-brio.ts). Typed questions
 * get a reply saying the demo answers its own prompts. It floats only; there are no saved
 * conversations to list. Portalled to the body like the real panel.
 *
 * Sits left of the tour's own button, which owns the bottom-right corner.
 */
export function DemoBrioChat({
    title,
    turns,
    facts = [],
    placeholder = `Ask ${ASSISTANT.name} about this engagement…`,
    capabilityNote,
}: {
    /** Names the page on the launcher, e.g. "Files". */
    title?: string
    turns: DemoChatTurn[]
    /** What the empty panel leads with (Overview). Each asks one of `turns`' questions. */
    facts?: OpeningFact[]
    placeholder?: string
    capabilityNote?: React.ReactNode
}) {
    const [mounted, setMounted] = useState(false)
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const [modKey, setModKey] = useState('⌘')
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const timers = useRef<number[]>([])

    useEffect(() => {
        setMounted(true)
        setModKey(/Mac|iPhone|iPod|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl+')
        const pending = timers.current
        return () => pending.forEach((t) => window.clearTimeout(t))
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages, open])

    // Opening focuses the composer, as in the app.
    useEffect(() => {
        if (!open) return
        const frame = requestAnimationFrame(() => inputRef.current?.focus())
        return () => cancelAnimationFrame(frame)
    }, [open])

    // ⌘J opens and focuses; from the composer it collapses.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return
            e.preventDefault()
            if (!open) setOpen(true)
            else if (document.activeElement === inputRef.current) setOpen(false)
            else inputRef.current?.focus()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.content))
    const suggestions = turns.filter((t) => !asked.has(t.question)).map((t) => t.question)
    const factQuestions = new Set(facts.map((f) => f.question))
    const starters = suggestions.filter((q) => !factQuestions.has(q))

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
    const onFiles = title === 'Files'
    const ScopeIcon = onFiles ? Folder : Briefcase
    let lastAssistant = -1
    messages.forEach((m, i) => { if (m.role === 'assistant') lastAssistant = i })
    const headerButton =
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted'

    return createPortal(
        <>
            {!open && (
                <Hint label={<>Ask <Brio noIcon /> · {modKey}J</>} side="left">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        data-demo-tour="ask-brio"
                        style={{ transformOrigin: 'bottom right' }}
                        className="fixed bottom-6 right-[84px] z-40 flex [[data-demo-pane=open]_&]:hidden animate-in fade-in zoom-in-95 items-center gap-2 rounded-full border border-line bg-surface py-2 pl-3 pr-3.5 shadow-popover duration-200 transition-colors hover:border-line-strong hover:bg-surface-hover"
                        aria-label="Open the engagement assistant"
                    >
                        <span className="text-sm font-medium text-fg">
                            Ask <Brio className="text-sm text-action" />
                            {title ? <span className="ml-1 text-fg-subtle">· {title}</span> : null}
                        </span>
                    </button>
                </Hint>
            )}

            {open && (
                <div
                    style={{ transformOrigin: 'bottom right' }}
                    className="fixed bottom-6 right-[84px] z-40 flex [[data-demo-pane=open]_&]:hidden h-[min(32rem,calc(100vh-6rem))] w-[23rem] max-w-[calc(100vw-7rem)] animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-dialog duration-200"
                >
                    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line pl-3 pr-1.5">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="text-ui font-semibold text-fg">Ask</span>
                            <Brio className="text-ui text-action" />
                            <Hint label={<span className="block max-w-[16rem]">{headerNote}</span>} side="bottom">
                                <button
                                    type="button"
                                    className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:text-fg-muted"
                                    aria-label={`What ${ASSISTANT.name} can do here`}
                                >
                                    <Info className="h-3.5 w-3.5" />
                                </button>
                            </Hint>
                        </div>
                        <Hint label={`Collapse · ${modKey}J`} side="bottom">
                            <button type="button" onClick={() => setOpen(false)} className={headerButton} aria-label="Collapse the assistant">
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </Hint>
                    </div>

                    <div ref={scrollRef} className="hover-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4">
                        {messages.length === 0 && (
                            <div className="flex min-h-full flex-col justify-end gap-4">
                                <div className="px-2">
                                    <p className="text-ui font-medium text-fg">
                                        Ask <Brio noIcon /> about {onFiles ? 'these files' : 'this engagement'}
                                    </p>
                                    <p className="mt-0.5 text-small leading-snug text-fg-muted">{headerNote}</p>
                                </div>
                                {facts.length > 0 && (
                                    <div className="flex flex-col gap-px">
                                        <p className="px-2 pb-0.5 text-caption text-fg-subtle">Right now</p>
                                        {facts.map((f) => (
                                            <SuggestionRow
                                                key={f.label}
                                                leading={<span className={`h-2 w-2 rounded-full ${FACT_TONE[f.tone]}`} aria-hidden />}
                                                label={f.label}
                                                onClick={() => ask(f.question)}
                                            />
                                        ))}
                                    </div>
                                )}
                                {starters.length > 0 && (
                                    <div className="flex flex-col gap-px">
                                        <p className="px-2 pb-0.5 text-caption text-fg-subtle">Try asking</p>
                                        {starters.map((q) => (
                                            <SuggestionRow key={q} leading={<MessageSquare />} label={q} onClick={() => ask(q)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                {m.role === 'user' ? (
                                    <div className="max-w-[85%] rounded-card bg-surface-muted px-3 py-2 text-ui text-fg">{m.content}</div>
                                ) : (
                                    <div className="w-full px-0.5 py-1 text-ui leading-relaxed text-fg">
                                        {!m.content ? (
                                            <div className="flex w-full flex-col gap-1.5 py-1" role="status">
                                                <ShimmerBar className="w-full" />
                                                <ShimmerBar className="w-[88%]" />
                                                <ShimmerBar className="w-[62%]" />
                                                <span className="mt-1 inline-flex items-center gap-1 text-caption text-fg-subtle">
                                                    <Brio /> is thinking
                                                </span>
                                            </div>
                                        ) : m.done ? (
                                            <ChatMarkdown content={m.content} className="w-full break-words text-fg" />
                                        ) : (
                                            <div className="whitespace-pre-line break-words">
                                                <StreamingText text={m.content} />
                                            </div>
                                        )}
                                        {i === lastAssistant && m.done && !busy && suggestions.length > 0 && (
                                            <div className="mt-2 flex flex-col gap-px">
                                                <p className="px-2 pb-0.5 text-caption text-fg-subtle">Ask next</p>
                                                {suggestions.map((q) => (
                                                    <SuggestionRow key={q} leading={<CornerDownRight />} label={q} onClick={() => ask(q)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="shrink-0 px-3 pb-3 pt-2">
                        <div className="flex flex-col rounded-card border border-line-strong bg-surface px-3 pb-1.5 pt-2 transition-colors focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20">
                            <textarea
                                ref={inputRef}
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
                                className="max-h-24 w-full resize-none bg-transparent text-ui leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
                            />
                            <div className="mt-1 flex items-center gap-1">
                                <span className="-ml-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-caption text-fg-muted">
                                    <ScopeIcon className="h-3 w-3" aria-hidden />
                                    {onFiles ? 'Files' : 'This engagement'}
                                </span>
                                <span className="flex-1" />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || busy}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:bg-surface-muted disabled:text-fg-subtle"
                                    aria-label="Send question"
                                >
                                    <Send className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </>,
        document.body,
    )
}
