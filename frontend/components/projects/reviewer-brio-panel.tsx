'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { ASSISTANT } from '@/lib/ai/assistant'
import { AI_TIMEOUT_MS, AiAbortedError, AiTimeoutError, fetchWithTimeout } from '@/lib/ai/fetch-timeout'
import { BRIO_ANSWER_CUT_OFF, BRIO_ANSWER_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY } from '@/lib/ai/brio-failure'
import { formatFullDate } from '@/lib/utils'
import { getWaitingOnMe, type WaitingOnMe } from '@/lib/actions/reviewer-brio'
import type { WaitingItem } from '@/lib/ai/reviewer-context'

const DAY_MS = 86_400_000
const SUGGESTIONS = ["What's been approved so far?", "What's due before the end of the month?"]

function ref(w: Pick<WaitingItem, 'docId' | 'name'>): string {
    return w.docId ? `${w.docId} · ${w.name}` : w.name
}

function daysSince(iso: string | null): number | null {
    if (!iso) return null
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS))
}

/** "Two things are with you." Written here, not by Brio: it costs nothing and is never wrong. */
function headline(waiting: WaitingItem[]): string {
    const n = waiting.length
    if (n === 0) return 'Nothing is waiting on you right now.'
    const words = ['One thing is', 'Two things are', 'Three things are', 'Four things are', 'Five things are']
    return `${n <= 5 ? words[n - 1] : `${n} things are`} with you.`
}

interface Turn { role: 'user' | 'assistant'; content: string; failed?: string }

/**
 * "What's waiting on you" on the Overview of a Reviewer or Limited Access contributor
 * (.claude/plans/brio-features-round-2.md, §3.6).
 *
 * The list is read straight from what they can see and costs nothing. Asking Brio is there only when
 * the firm has turned it on; answers come from the same facts, never from the firm's internal ones.
 */
export function ReviewerBrioPanel({ projectId, engagementBase }: { projectId: string; engagementBase: string }) {
    const [state, setState] = useState<WaitingOnMe | null>(null)
    const [turns, setTurns] = useState<Turn[]>([])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const ctrlRef = useRef<AbortController | null>(null)

    useEffect(() => {
        let cancelled = false
        getWaitingOnMe(projectId)
            .then((r) => { if (!cancelled && r.ok) setState(r.data) })
            .catch(() => { /* the panel is an addition; the Overview stands without it */ })
        return () => { cancelled = true; ctrlRef.current?.abort() }
    }, [projectId])

    const ask = useCallback(async (q: string) => {
        const question = q.trim()
        if (!question || streaming) return
        const history = turns.filter((t) => !t.failed && t.content).slice(-12).map(({ role, content }) => ({ role, content }))
        setInput('')
        setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
        setStreaming(true)
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        const failTurn = (failed: string) => setTurns((prev) => {
            const next = [...prev]
            next[next.length - 1] = { ...next[next.length - 1], failed }
            return next
        })
        let received = false
        try {
            const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-chat/reviewer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, history }),
            }, AI_TIMEOUT_MS.stream, ctrl.signal)
            if (!res.ok || !res.body) {
                const d = await res.json().catch(() => null)
                throw new Error(d?.error ?? BRIO_ANSWER_FAILED)
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let text = ''
            while (true) {
                const { value, done } = await reader.read()
                if (done) break
                text += decoder.decode(value, { stream: true })
                received = true
                setTurns((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = { role: 'assistant', content: text }
                    return next
                })
            }
            setState((s) => (s ? { ...s, answersLeftToday: Math.max(0, s.answersLeftToday - 1) } : s))
        } catch (e) {
            if (e instanceof AiAbortedError) return
            failTurn(
                e instanceof AiTimeoutError ? BRIO_TOO_SLOW
                    : received ? BRIO_ANSWER_CUT_OFF
                        : e instanceof TypeError ? BRIO_UNREACHABLE_RETRY
                            : e instanceof Error && e.message ? e.message : BRIO_ANSWER_FAILED,
            )
        } finally {
            setStreaming(false)
            ctrlRef.current = null
        }
    }, [projectId, streaming, turns])

    if (!state) return null
    const { waiting, brioEnabled, answersLeftToday } = state
    const href = (w: WaitingItem) => !engagementBase ? undefined
        : w.kind === 'review' ? `${engagementBase}/shares/board#doc-file:${w.documentId}`
            : `${engagementBase}/comments#doc-comment:${w.documentId}`

    return (
        <section aria-labelledby="waiting-on-you-h" className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
                <h2 id="waiting-on-you-h" className="text-h3 text-fg">What&apos;s waiting on you</h2>
                <span className="flex-1" />
                {brioEnabled && <Brio className="text-caption text-action" />}
            </div>
            <p className="px-4 pb-3 text-ui text-fg">{headline(waiting)}</p>

            {waiting.length > 0 && (
                <ul>
                    {waiting.map((w) => {
                        const days = daysSince(w.since)
                        return (
                            <li key={`${w.kind}:${w.documentId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5">
                                <span className="inline-flex h-5 shrink-0 items-center rounded-control bg-[var(--ui-status-waiting-bg)] px-1.5 text-caption text-[var(--ui-status-waiting-fg)]">
                                    {w.kind === 'review'
                                        ? `In review${days !== null ? ` · ${days} ${days === 1 ? 'day' : 'days'}` : ''}`
                                        : 'New reply'}
                                </span>
                                <a href={href(w)} className="min-w-0 flex-1 truncate text-ui text-action hover:underline">{ref(w)}</a>
                                <span className="text-small text-fg-muted">
                                    {w.kind === 'review'
                                        ? (w.dueDate ? `due ${formatFullDate(w.dueDate)}` : '')
                                        : (w.since ? formatFullDate(w.since) : '')}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}

            {brioEnabled && (
                <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
                    {turns.length > 0 && (
                        <div className="flex flex-col gap-3" aria-live="polite">
                            {turns.map((t, i) => t.role === 'user' ? (
                                <p key={i} className="self-end rounded-card bg-surface-muted px-3 py-1.5 text-ui text-fg">{t.content}</p>
                            ) : (
                                <div key={i} className="text-ui text-fg">
                                    {t.content ? <ChatMarkdown content={t.content} /> : !t.failed && <span className="text-fg-muted">Thinking…</span>}
                                    {t.failed && <p className="mt-1 text-small text-danger">{t.failed}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    {turns.length === 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => void ask(s)}
                                    disabled={answersLeftToday === 0}
                                    className="inline-flex h-7 items-center rounded-full border border-line-strong bg-surface px-2.5 text-small text-fg hover:bg-surface-hover disabled:opacity-50"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                    <form
                        className="flex items-center gap-2 rounded-card border border-line-strong px-2.5 py-1.5"
                        onSubmit={(e) => { e.preventDefault(); void ask(input) }}
                    >
                        <label htmlFor="reviewer-brio-ask" className="sr-only">Ask {ASSISTANT.name} about this engagement</label>
                        <input
                            id="reviewer-brio-ask"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={answersLeftToday === 0 ? 'No questions left today' : 'Ask about this engagement'}
                            disabled={answersLeftToday === 0}
                            maxLength={1000}
                            className="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
                        />
                        {streaming ? (
                            <button type="button" onClick={() => ctrlRef.current?.abort()} aria-label="Stop" className="inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover">
                                <Square className="h-3 w-3 fill-current" aria-hidden />
                            </button>
                        ) : (
                            <button type="submit" disabled={!input.trim() || answersLeftToday === 0} aria-label="Ask" className="inline-flex h-7 w-7 items-center justify-center rounded-control bg-action text-action-fg disabled:opacity-40">
                                <ArrowUp className="h-4 w-4" aria-hidden />
                            </button>
                        )}
                    </form>
                    <p className="text-caption font-normal text-fg-muted">
                        {ASSISTANT.name} answers from what you can see here. It can&apos;t change anything.
                        {answersLeftToday < 10 && ` ${answersLeftToday} ${answersLeftToday === 1 ? 'question' : 'questions'} left today.`}
                    </p>
                </div>
            )}
        </section>
    )
}
