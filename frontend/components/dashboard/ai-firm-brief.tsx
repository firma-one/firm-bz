'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, Check, Clock, Copy, Sparkles, Square } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { ASSISTANT, ASSISTANT_POLICY, BRIO_GREEN } from '@/lib/ai/assistant'
import { Hint } from '@/components/ui/tooltip'
import { Brio } from '@/components/ui/brio'
import { BrioByline } from '@/components/ui/brio-byline'
import { ShimmerBar } from '@/components/ui/shimmer'
import { BrioReading, BrioSections, StreamingBrioSections } from '@/components/ui/brio-sections'
import { fetchWithTimeout, AI_TIMEOUT_MS } from '@/lib/ai/fetch-timeout'

export interface FirmBrief {
    content: string
    generatedAt: string
}

/**
 * The firm's brief: loads it, and rewrites it on request. A hook rather than a component so the
 * Overview knows whether there is a brief to lay the cards out beside.
 * `available` is false when the model isn't configured, or there is no brief to show.
 *
 * The rewrite streams (`streamText` grows as Brio writes) and the brief on screen is replaced only
 * when it completes; `stop` ends it early and keeps the old one.
 */
export function useFirmBrief(firmId: string) {
    const { session } = useAuth()
    const accessToken = session?.access_token

    const [brief, setBrief] = useState<FirmBrief | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    // Distinguishes "no API key configured" from "generation failed" — when unconfigured the
    // brief is left out entirely rather than showing an error to every user.
    const [configured, setConfigured] = useState(true)
    const [refreshError, setRefreshError] = useState<string | null>(null)
    const [streamText, setStreamText] = useState('')
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (!accessToken) return
        let cancelled = false

        setLoading(true)
        fetchWithTimeout(`/api/firms/${firmId}/ai-brief`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        }, AI_TIMEOUT_MS.brief)
            .then((r) => {
                // Without this, a 500 returning an HTML body throws on .json() into the same
                // silent catch as "no brief", making a real failure indistinguishable from
                // having nothing to show.
                if (!r.ok) throw new Error(`Brief request failed (${r.status})`)
                return r.json()
            })
            .then((d) => {
                if (cancelled) return
                setBrief(d.brief ?? null)
                setConfigured(d.configured !== false)
            })
            .catch(() => { if (!cancelled) setBrief(null) })
            .finally(() => { if (!cancelled) setLoading(false) })

        return () => { cancelled = true }
    }, [firmId, accessToken])

    const refresh = useCallback(async () => {
        if (!accessToken || refreshing) return
        const ctrl = new AbortController()
        abortRef.current = ctrl
        setRefreshing(true)
        setRefreshError(null)
        setStreamText('')
        // Gives up when Brio goes quiet for too long — reset on every piece of text, so a long
        // brief still being written is never cut off.
        let idle: ReturnType<typeof setTimeout> | undefined
        const arm = () => {
            clearTimeout(idle)
            idle = setTimeout(() => ctrl.abort('timeout'), AI_TIMEOUT_MS.brief)
        }
        arm()
        try {
            const res = await fetch(`/api/firms/${firmId}/ai-brief?stream=1`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: ctrl.signal,
            })
            if (!res.ok || !res.body) {
                const d = await res.json().catch(() => null)
                throw new Error(d?.error ?? `Rewrite failed (${res.status})`)
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let finished = false
            while (!finished) {
                const { value, done } = await reader.read()
                if (done) break
                arm()
                buffer += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const raw = buffer.slice(0, nl).trim()
                    buffer = buffer.slice(nl + 1)
                    if (!raw) continue
                    const msg = JSON.parse(raw) as { type: string; text?: string; brief?: FirmBrief; message?: string }
                    if (msg.type === 'delta' && msg.text) setStreamText((t) => t + msg.text)
                    else if (msg.type === 'done' && msg.brief) { setBrief(msg.brief); finished = true }
                    else if (msg.type === 'error') throw new Error(msg.message ?? 'Rewrite failed')
                }
            }
            if (!finished) throw new Error('The rewrite stopped before it finished')
        } catch {
            // Stopped on purpose: the old brief simply stays. Anything else, say so — the user
            // pressed a button and silence reads as "nothing happened".
            if (!(ctrl.signal.aborted && ctrl.signal.reason === 'stopped')) {
                setRefreshError(
                    ctrl.signal.reason === 'timeout'
                        ? `${ASSISTANT.name} took too long. The brief below is unchanged.`
                        : `Could not rewrite it. The brief below is unchanged.`,
                )
            }
        } finally {
            clearTimeout(idle)
            abortRef.current = null
            setRefreshing(false)
            setStreamText('')
        }
    }, [firmId, accessToken, refreshing])

    /** Ends the rewrite now; the brief on screen stays as it was. */
    const stop = useCallback(() => abortRef.current?.abort('stopped'), [])
    // Leaving the page stops it, rather than writing into a card no one sees.
    useEffect(() => () => abortRef.current?.abort('stopped'), [])

    return { brief, loading, refreshing, streamText, refreshError, refresh, stop, available: configured && (loading || !!brief) }
}

const CONTROL = 'inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-small transition-colors hover:border-line-strong hover:bg-surface-hover disabled:cursor-default disabled:opacity-50'
/** The header's actions: 28px icon buttons, as on the engagement summary. */
const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:cursor-default disabled:opacity-50'

/**
 * Today's brief as a card, with the Engagement Summary's header: title, how old it is, Copy, and
 * "Rewrite with Brio". Presentational: the Overview feeds it from useFirmBrief, the tour from its
 * sample data.
 */
export function FirmBriefCard({ brief, loading = false, refreshing = false, streamText = '', refreshError = null, onRewrite, onStop, source = 'your current data', reading = 'your firm’s data' }: {
    brief: FirmBrief | null
    loading?: boolean
    /** A rewrite is being written: the card shows it streaming in, in place of the brief. */
    refreshing?: boolean
    /** What Brio has written of the rewrite so far. */
    streamText?: string
    refreshError?: string | null
    /** Omitted where a rewrite isn't possible. */
    onRewrite?: () => void
    /** Ends the rewrite and keeps the brief as it was. */
    onStop?: () => void
    /** What it was written from, for the line under it. */
    source?: string
    /** What Brio reads before writing ("your firm's data"). */
    reading?: string
}) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        if (!brief) return
        void navigator.clipboard.writeText(brief.content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
    }
    const busy = loading || refreshing || !brief
    // Said once at the start and once at the end, not word by word.
    const [announce, setAnnounce] = useState('')
    const wasRefreshing = useRef(false)
    useEffect(() => {
        if (refreshing && !wasRefreshing.current) setAnnounce(`${ASSISTANT.name} is writing a new brief.`)
        else if (!refreshing && wasRefreshing.current) setAnnounce(refreshError ? refreshError : 'The new brief is ready.')
        wasRefreshing.current = refreshing
    }, [refreshing, refreshError])

    return (
        <div data-firm-brief className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 pb-2 pt-3">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-small font-medium text-fg-muted">Today&apos;s brief</span>
                    {refreshing ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-caption text-fg-muted">
                            <Brio className="animate-pulse" /> is writing a new brief…
                        </span>
                    ) : brief && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-caption text-fg-subtle">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(brief.generatedAt)}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 print:hidden">
                    {/* As on the engagement summary: icon actions named by a Hint and an aria-label;
                        Stop stays a labeled button while Brio writes. */}
                    <Hint label={copied ? 'Copied' : 'Copy as Markdown'}>
                        <button type="button" onClick={copy} disabled={busy} aria-label="Copy the brief as Markdown" className={ICON_BUTTON}>
                            {copied ? <Check className="h-4 w-4 text-status-done-icon" /> : <Copy className="h-4 w-4" />}
                        </button>
                    </Hint>
                    {refreshing && onStop ? (
                        <button type="button" onClick={onStop} className={`${CONTROL} text-fg-muted hover:text-fg`}>
                            <Square className="h-3 w-3 fill-current" /> Stop
                        </button>
                    ) : onRewrite && (
                        <Hint label={<>Rewrite with <Brio /></>}>
                            <button type="button" onClick={onRewrite} disabled={busy} aria-label={`Rewrite with ${ASSISTANT.name}`} className={ICON_BUTTON}>
                                <Sparkles className="h-4 w-4" style={{ color: BRIO_GREEN }} />
                            </button>
                        </Hint>
                    )}
                </div>
            </div>

            {refreshError && (
                <p role="status" className="flex items-center gap-1.5 px-4 pt-3 text-small text-fg-muted">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-tag-yellow-fg" />
                    {refreshError}
                </p>
            )}

            <p className="sr-only" aria-live="polite">{announce}</p>

            {refreshing ? (
                <StreamingBrioSections text={streamText} placeholder={<BrioReading what={reading} />} className="px-4 py-3 text-fg-muted" />
            ) : loading || !brief ? (
                <div className="space-y-2 px-4 py-4" aria-busy="true">
                    <ShimmerBar className="w-full" />
                    <ShimmerBar className="w-[92%]" />
                    <ShimmerBar className="w-[78%]" />
                </div>
            ) : (
                <BrioSections content={brief.content} className="px-4 py-3 text-fg-muted" />
            )}

            {/* The byline every piece of Brio's work carries, in plain text. No publisher: the brief
                has no review step. */}
            <BrioByline className="mt-auto border-t border-line px-4 py-2.5">
                from {source}. {ASSISTANT_POLICY.short}
            </BrioByline>
        </div>
    )
}
