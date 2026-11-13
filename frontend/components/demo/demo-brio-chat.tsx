'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, Building2, CornerDownRight, Folder, Info, MessageSquare, Send, Square } from 'lucide-react'
import { WindowGlyph } from '@/components/ui/window-glyph'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { StreamingText } from '@/components/ui/streaming-text'
import { ShimmerBar } from '@/components/ui/shimmer'
import { Hint } from '@/components/ui/tooltip'
import type { OpeningFact } from '@/lib/ai/chat-suggestions'
import { FIRM_CHAT_CAPABILITY, FIRM_CHAT_PLACEHOLDER, type FirmChatLink, type FirmChatSources } from '@/lib/ai/firm-chat'
import { FirmChatAnswer } from '@/components/brio/firm-chat-answer'
import { DEMO_FIRM_FREEFORM_REPLY, DEMO_FREEFORM_REPLY, type DemoChatTurn } from '@/lib/demo/demo-brio'

type Message = {
    role: 'user' | 'assistant'
    content: string
    done: boolean
    /** A firm answer's links line, shown once the answer has arrived. */
    sources?: FirmChatSources
    /** Stopped part-way, as in the app: the text is kept and said to be incomplete. */
    stopped?: boolean
}

/**
 * What the demo panel answers about, as the app's `ChatSubject`: an engagement (Overview, Files), or
 * the whole firm (the firm Overview), whose answers link the engagements they name to `hrefFor`.
 */
export type DemoChatSubject =
    | { kind: 'engagement' }
    | { kind: 'firm'; hrefFor: (link: FirmChatLink) => string }

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
 * With a firm `subject` it is the firm Overview's panel, as in the app: "Ask Brio about the firm",
 * the firm's capability line and placeholder, a "This firm" chip, and answers whose quoted
 * engagement names link to the tour's pages (`turns` carry the links line, lib/demo/demo-brio.ts
 * `firmChat`).
 *
 * Sits left of the tour's own button, which owns the bottom-right corner.
 */
export function DemoBrioChat({
    title,
    turns,
    facts = [],
    subject = { kind: 'engagement' },
    placeholder,
    capabilityNote,
}: {
    /** Names the page on the launcher, e.g. "Files". */
    title?: string
    turns: DemoChatTurn[]
    /** What the empty panel leads with (Overview). Each asks one of `turns`' questions. */
    facts?: OpeningFact[]
    /** An engagement (the default) or the firm. */
    subject?: DemoChatSubject
    placeholder?: string
    capabilityNote?: React.ReactNode
}) {
    const firm = subject.kind === 'firm' ? subject : null
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
        const turn = turns.find((t) => t.question === question)
        const answer = turn?.answer ?? (firm ? DEMO_FIRM_FREEFORM_REPLY : DEMO_FREEFORM_REPLY)
        setInput('')
        setBusy(true)
        setMessages((prev) => [...prev, { role: 'user', content: question, done: true }, { role: 'assistant', content: '', done: false }])

        // Arrives a couple of words at a time, the way a real answer streams in. The links line
        // comes with the last of it, as the route sends it after the answer.
        const tokens = answer.split(/(\s+)/)
        let shown = 0
        const setLast = (content: string, done: boolean) =>
            setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content, done, sources: done ? turn?.sources : undefined }])
        const tick = () => {
            shown = Math.min(tokens.length, shown + 4)
            const done = shown >= tokens.length
            setLast(tokens.slice(0, shown).join(''), done)
            if (done) setBusy(false)
            else timers.current.push(window.setTimeout(tick, TICK_MS))
        }
        timers.current.push(window.setTimeout(tick, THINK_MS))
    }

    /** Ends the answer now, as the app's Stop does: what arrived is kept and marked incomplete. */
    const stop = () => {
        timers.current.splice(0).forEach((t) => window.clearTimeout(t))
        setBusy(false)
        setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return last.content ? [...prev.slice(0, -1), { ...last, done: true, stopped: true }] : prev.slice(0, -1)
        })
    }

    if (!mounted) return null

    const headerNote = capabilityNote ?? (firm ? FIRM_CHAT_CAPABILITY : (
        <>
            <Brio /> answers from this engagement&apos;s data, and never changes anything without your consent.
        </>
    ))
    const onFiles = !firm && title === 'Files'
    const ScopeIcon = firm ? Building2 : onFiles ? Folder : Briefcase
    const scopeLabel = firm ? 'This firm' : onFiles ? 'Files' : 'This engagement'
    const composerPrompt = placeholder ?? (firm ? FIRM_CHAT_PLACEHOLDER : `Ask ${ASSISTANT.name} about this engagement…`)
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
                        // The guided tour's Brio steps point at the engagement pages' launcher; the
                        // firm Overview's has its own anchor so a step never lands on the wrong one.
                        data-demo-tour={firm ? 'firm-chat' : 'ask-brio'}
                        style={{ transformOrigin: 'bottom right' }}
                        className="fixed bottom-6 right-[84px] z-40 flex [[data-demo-pane=open]_&]:hidden animate-in fade-in zoom-in-95 items-center gap-2 rounded-full border border-line bg-surface py-2 pl-3 pr-3.5 shadow-popover duration-200 transition-colors hover:border-line-strong hover:bg-surface-hover"
                        aria-label={firm ? 'Open the firm assistant' : 'Open the engagement assistant'}
                    >
                        <span className="text-sm font-medium text-fg">
                            Ask <Brio className="text-sm text-action" />
                            {firm ? ' about the firm' : title ? <span className="ml-1 text-fg-subtle">· {title}</span> : null}
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
                                <WindowGlyph variant="minimize" />
                            </button>
                        </Hint>
                    </div>

                    <div ref={scrollRef} className="hover-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4">
                        {messages.length === 0 && (
                            <div className="flex min-h-full flex-col justify-end gap-4">
                                <div className="px-2">
                                    <p className="text-ui font-medium text-fg">
                                        Ask <Brio noIcon /> about {firm ? 'the firm' : onFiles ? 'these files' : 'this engagement'}
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
                                            firm ? (
                                                <FirmChatAnswer answer={m.content} links={m.sources?.engagements} hrefFor={firm.hrefFor} />
                                            ) : (
                                                <ChatMarkdown content={m.content} className="w-full break-words text-fg" />
                                            )
                                        ) : (
                                            <div className="whitespace-pre-line break-words">
                                                <StreamingText text={m.content} />
                                            </div>
                                        )}
                                        {m.stopped && (
                                            <p className="mt-1 text-caption italic text-fg-subtle">Stopped · this answer is incomplete.</p>
                                        )}
                                        {/* What a firm answer drew on, as the app shows it. */}
                                        {m.done && !m.stopped && (m.sources?.drewOn ?? 0) > 0 && (
                                            <p className="mt-1.5 text-caption text-fg-subtle">
                                                Based on {m.sources!.drewOn} engagement{m.sources!.drewOn === 1 ? '' : 's'}
                                            </p>
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
                                placeholder={composerPrompt}
                                disabled={busy}
                                rows={1}
                                className="max-h-24 w-full resize-none bg-transparent text-ui leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
                            />
                            <div className="mt-1 flex items-center gap-1">
                                <span className="-ml-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-caption text-fg-muted">
                                    <ScopeIcon className="h-3 w-3" aria-hidden />
                                    {scopeLabel}
                                </span>
                                <span className="flex-1" />
                                {/* As in the app: while answering, the spinner is the stop control. */}
                                {busy ? (
                                    <button
                                        type="button"
                                        onClick={stop}
                                        className="group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg-muted"
                                        aria-label="Stop generating"
                                    >
                                        <span aria-hidden className="absolute inset-0 animate-spin rounded-full border-2 border-line border-t-action" />
                                        <Square className="h-2.5 w-2.5 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={!input.trim()}
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:bg-surface-muted disabled:text-fg-subtle"
                                        aria-label="Send question"
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </>,
        document.body,
    )
}
