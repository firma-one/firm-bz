'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Check, ChevronRight, Copy, RefreshCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { Brio } from '@/components/ui/brio'
import { BrioSections } from '@/components/ui/brio-sections'
import { StreamingText } from '@/components/ui/streaming-text'
import { InfoHint } from './overview-charts'
import { cn, formatRelativeTime } from '@/lib/utils'
import { LEAD_PLACEHOLDER, LEAD_SECTIONS, isPlaceholderText, splitSections, writeSection } from '@/lib/ai/summary-sections'

export type ReviewMode = 'preview' | 'edit'

export interface SummaryDraftReviewProps {
    streaming: boolean
    streamText: string
    /** When the pending draft was written; null while streaming a new one. */
    generatedAt: string | null
    value: string
    onChange: (next: string) => void
    /** Preview (sections, with the lead's own as text boxes) or the whole draft as Markdown. */
    mode: ReviewMode
    onModeChange: (mode: ReviewMode) => void
    /** Sections the firm has to write itself before the draft can be published. */
    unfilledSections: string[]
    busyAction: 'publish' | 'dismiss' | null
    onPublish: () => void
    onDismiss: () => void
    onCopy: () => void
    copied: boolean
    note: string | null
    published: { content: string; publishedAt: string | null } | null
    /** The engagement has changed since Brio wrote this draft. */
    draftBehind: boolean
    /** Asks Brio for a new draft from the current data. */
    onRewrite: () => void
    /** Stops Brio mid-draft: the unfinished draft is thrown away and the published summary stays. */
    onStop?: () => void
}

const LEAD_PROMPTS: Record<string, string> = {
    'Mitigation & Contingency': 'How the firm will handle the risks above, and the fallback if it can’t.',
    'Next Steps': 'What happens next, by when, and who does it.',
}

/**
 * A section the Engagement Lead writes, edited where it sits in the draft. Brio leaves these to a
 * person on purpose (lib/ai/summary-sections.ts): they commit the firm to a course of action.
 *
 * Typed text lives in local state and is written into the draft on every change, so spaces and
 * new lines at the end survive typing. The pane draws its content twice (docked, and in its full
 * screen view), so a field that is not being typed in picks up changes made in the other copy.
 */
function LeadSectionField({ heading, body, onChange }: { heading: string; body: string; onChange: (text: string) => void }) {
    const fromDraft = isPlaceholderText(body) ? '' : body
    const [text, setText] = useState(fromDraft)
    const ref = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
        if (document.activeElement !== ref.current && text.trim() !== fromDraft.trim()) setText(fromDraft)
    }, [fromDraft]) // eslint-disable-line react-hooks/exhaustive-deps -- only react to the draft changing
    useEffect(() => {
        // Grow with the text, so a long answer never scrolls inside a small box.
        const el = ref.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [text])
    const empty = !text.trim()
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{heading}</p>
                <span className={cn('text-caption', empty ? 'text-tag-orange-fg' : 'text-fg-subtle')}>
                    {empty ? 'Yours to write' : 'Written by you'}
                </span>
            </div>
            <textarea
                ref={ref}
                value={text}
                rows={3}
                onChange={(e) => {
                    setText(e.target.value)
                    // Cleared again: the placeholder goes back, so publishing stays blocked.
                    onChange(e.target.value.trim() ? e.target.value : LEAD_PLACEHOLDER)
                }}
                placeholder={LEAD_PROMPTS[heading] ?? 'Your input'}
                aria-label={heading}
                className={cn(
                    'w-full resize-none overflow-hidden rounded-control border bg-surface px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-fg-subtle focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20',
                    empty ? 'border-tag-orange-fg/40' : 'border-line',
                )}
            />
        </div>
    )
}

/**
 * Reviewing Brio's summary draft, in the right pane (.claude/plans/engagement-overview-redesign.md).
 *
 * The draft reads as it will publish, section by section. The two sections the lead writes are
 * text boxes in place, so filling them in is the whole job; Edit opens the draft as Markdown for
 * anything else. The published summary stays on the page, with a copy below the draft to compare.
 * One plain line says what publishing does, or what still stops it. A draft is one-off: Publish
 * saves it, Discard (or closing the pane) throws it away — it is never kept to come back to.
 */
export function SummaryDraftReview({
    streaming, streamText, generatedAt, value, onChange, mode, onModeChange, unfilledSections, busyAction,
    onPublish, onDismiss, onCopy, copied, note, published, draftBehind, onRewrite, onStop,
}: SummaryDraftReviewProps) {
    const [showPublished, setShowPublished] = useState(false)
    const busy = busyAction !== null
    const blocked = unfilledSections.length > 0
    const empty = !value.trim()
    const sections = splitSections(value)

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-small text-fg-muted">
                    {streaming ? <><Brio className="animate-pulse" /> is writing…</> : <>Suggested by <Brio /></>}
                </span>
                {!streaming && generatedAt && <span className="text-caption text-fg-subtle">{formatRelativeTime(generatedAt)}</span>}
                {streaming && onStop && (
                    <button
                        type="button"
                        onClick={onStop}
                        className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-small text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                    >
                        <Square className="h-3 w-3 fill-current" /> Stop
                    </button>
                )}
                {!streaming && (
                    <div className="ml-auto flex items-center gap-0.5 rounded-control bg-surface-muted p-0.5" role="tablist" aria-label="Draft view">
                        {([['preview', 'Preview'], ['edit', 'Markdown']] as const).map(([m, label]) => (
                            <button
                                key={m}
                                type="button"
                                role="tab"
                                aria-selected={mode === m}
                                onClick={() => onModeChange(m)}
                                className={cn('rounded-[4px] px-2 py-0.5 text-caption font-medium transition-colors',
                                    mode === m ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg-muted')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                {/* Said before publishing: the draft describes the engagement as it was when Brio
                    wrote it. Publishing it anyway is the lead's call, and records today's data. */}
                {draftBehind && !streaming && (
                    <div className="mb-4 flex items-start gap-2 rounded-control bg-tag-yellow-bg px-3 py-2 text-caption text-tag-yellow-fg">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">
                            The engagement has changed since <Brio /> wrote this{generatedAt ? ` ${formatRelativeTime(generatedAt)}` : ''}.
                            Rewrite it from today&apos;s data, or publish it as it is.
                        </span>
                        <button type="button" onClick={onRewrite} disabled={busy} className="shrink-0 font-medium underline underline-offset-2 hover:text-fg disabled:opacity-60">
                            Rewrite
                        </button>
                    </div>
                )}
                {streaming ? (
                    <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">
                        <StreamingText text={streamText} />
                        <span
                            className="ml-0.5 inline-block h-[1.05em] w-[0.5em] -mb-[0.15em] translate-y-px bg-action align-baseline"
                            style={{ animation: 'fm-caret 1.3s ease-in-out infinite' }}
                        />
                        {!streamText && <span className="text-fg-subtle"><Brio /> is reading this engagement…</span>}
                    </p>
                ) : mode === 'edit' ? (
                    <textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={busy}
                        aria-label="Summary draft (Markdown)"
                        className="min-h-[18rem] w-full flex-1 resize-none rounded-control border border-line bg-surface px-3 py-2 font-mono text-small leading-relaxed text-fg focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20 disabled:opacity-60"
                    />
                ) : empty ? (
                    <p className="text-small text-fg-subtle">The draft is empty. Open Markdown to write it.</p>
                ) : (
                    <div className="flex flex-col gap-6">
                        {sections.map((s, i) => s.heading && LEAD_SECTIONS.includes(s.heading) ? (
                            <LeadSectionField
                                key={s.heading}
                                heading={s.heading}
                                body={s.body}
                                onChange={(text) => onChange(writeSection(value, s.heading!, text))}
                            />
                        ) : (
                            <BrioSections key={s.heading ?? `intro-${i}`} content={s.heading ? `## ${s.heading}\n${s.body}` : s.body} className="text-fg" />
                        ))}
                    </div>
                )}

                {published && !streaming && (
                    <div className="mt-6 border-t border-line pt-3">
                        <button
                            type="button"
                            onClick={() => setShowPublished((v) => !v)}
                            aria-expanded={showPublished}
                            className="flex w-full items-center gap-1.5 rounded-control py-1 text-left text-small text-fg-muted transition-colors hover:text-fg"
                        >
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', showPublished && 'rotate-90')} />
                            Currently published
                            {published.publishedAt && <span className="text-caption text-fg-subtle">{formatRelativeTime(published.publishedAt)}</span>}
                        </button>
                        {showPublished && <BrioSections content={published.content} className="mt-2 text-fg-muted" />}
                    </div>
                )}
            </div>

            {!streaming && (
                <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                    {note && <p className="text-caption text-action">{note}</p>}
                    {/* One line: what stops publishing, or what publishing does. The detail is in the tip. */}
                    <p className="flex items-start gap-1.5 text-caption text-fg-muted">
                        {blocked ? (
                            <span>Fill in <strong className="font-medium text-fg">{unfilledSections.join(' and ')}</strong> to publish.</span>
                        ) : (
                            <span>Publishing saves this as the engagement summary the client sees.</span>
                        )}
                        <InfoHint
                            label="About publishing"
                            text={blocked
                                ? `${unfilledSections.join(' and ')} ${unfilledSections.length === 1 ? 'is' : 'are'} yours to decide: Brio reports what the data shows and does not commit your firm to a plan.`
                                : `It is visible to the client and goes into PDF and email exports.${published ? ' It replaces the summary published' + (published.publishedAt ? ` ${formatRelativeTime(published.publishedAt)}` : ' earlier') + '.' : ''}`}
                        />
                    </p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={onCopy} disabled={empty} aria-label="Copy draft summary to clipboard" className="mr-auto">
                            {copied ? <Check className="h-3 w-3 text-action" /> : <Copy className="h-3 w-3" />}
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={onDismiss} disabled={busy}>
                            {busyAction === 'dismiss' && <RefreshCw className="h-3 w-3 animate-spin" />}
                            Discard
                        </Button>
                        {(() => {
                            const publish = (
                                <Button size="sm" onClick={onPublish} disabled={busy || empty || blocked}>
                                    {busyAction === 'publish' && <RefreshCw className="h-3 w-3 animate-spin" />}
                                    Publish
                                </Button>
                            )
                            // Why it's disabled, in the app's Hint rather than a native title. A disabled
                            // button gets no pointer events, so the Hint sits on a focusable wrapper.
                            return blocked ? (
                                <Hint label={`Fill in ${unfilledSections.join(' and ')} first`}>
                                    <span tabIndex={0} className="inline-flex rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30">
                                        {publish}
                                    </span>
                                </Hint>
                            ) : publish
                        })()}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Into the right pane ─────────────────────────────────────────────────────

/*
 * The right pane takes a node once and draws it twice — docked, and in its full-screen view — so
 * the review cannot be portaled into one copy (it was: the hidden copy mounted last and won, and
 * the pane showed empty). Instead the Overview publishes the review's current props here on every
 * render, and each copy of SummaryDraftReviewPane reads them. One review pane exists at a time.
 */
let current: SummaryDraftReviewProps | null = null
let mountedCopies = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const summaryReviewStore = {
    set(next: SummaryDraftReviewProps | null) {
        current = next
        emit()
    },
    subscribe(listener: () => void) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
    },
    get: () => current,
    /** Whether the pane is showing the review (any copy mounted). */
    isOpen: () => mountedCopies > 0,
}

/** What the right pane renders: the review, live from the Overview. */
export function SummaryDraftReviewPane() {
    const props = useSyncExternalStore(summaryReviewStore.subscribe, summaryReviewStore.get, () => null)
    useEffect(() => {
        mountedCopies += 1
        emit()
        return () => {
            mountedCopies -= 1
            emit()
        }
    }, [])
    return props ? <SummaryDraftReview {...props} /> : null
}
