'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Check, ChevronRight, Copy, RefreshCw, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Brio } from '@/components/ui/brio'
import { BrioSections } from '@/components/ui/brio-sections'
import { BrioTypedText, ThinkingDots, useTypedText } from '@/components/brio/brio-typing'
import { InfoHint } from './overview-charts'
import { cn, formatRelativeTime } from '@/lib/utils'
import { LEAD_PLACEHOLDER, LEAD_SECTIONS, hasRisks, isPlaceholderText, splitSections, withLeadSections, writeSection } from '@/lib/ai/summary-sections'

/** "Mitigation & Contingency" → "Mitigation & contingency", for a sentence. */
export const sectionInSentence = (heading: string) => heading.charAt(0) + heading.slice(1).toLowerCase()

/**
 * The warning before publishing or sending without the lead's sections (Deepak, 2026-11-17: "give
 * the writer enough warning to supply Mitigation and Next steps, if planned"). Null when both are written.
 */
export function MissingSectionsWarning({ missing, risks, action }: { missing: string[]; risks: boolean; action?: React.ReactNode }) {
    if (missing.length === 0) return null
    const names = missing.map(sectionInSentence)
    return (
        <div role="note" className="flex items-start gap-2 rounded-control bg-tag-yellow-bg px-3 py-2 text-caption text-tag-yellow-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1">
                <span className="font-semibold">No {names.join(' or ')}.</span>{' '}
                {risks && <>The update lists risks and says nothing about handling them. </>}
                <Brio /> leaves {missing.length === 1 ? 'this' : 'these'} to you because {missing.length === 1 ? 'it commits' : 'they commit'} the firm to a plan.
                {' '}If you&apos;ve planned {missing.length === 1 ? 'it' : 'them'}, write {missing.length === 1 ? 'it' : 'them'} in first.
            </span>
            {action}
        </div>
    )
}

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
    /** The lead's sections still unwritten: left out when published, and warned about before. */
    unfilledSections: string[]
    /**
     * 'draft' reviews Brio's draft; 'edit' is the person editing the published update by hand, every
     * section a box (the pencil, 2026-11-18). Default 'draft'.
     */
    kind?: 'draft' | 'edit'
    /**
     * Publish & send…: publishes, then opens Email this update filled in (the one place an email is
     * written, .claude/plans/publish-and-send-update.md). Absent: Publish only.
     */
    onPublishAndSend?: () => void
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

/** Replaces the text before a summary's first heading. */
function writePreamble(text: string, body: string): string {
    const at = text.search(/^## /m)
    const rest = at === -1 ? '' : text.slice(at)
    return body.trim() ? `${body.trim()}\n\n${rest}` : rest
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
function SectionField({ heading, body, onChange, lead = true }: { heading: string; body: string; onChange: (text: string) => void; lead?: boolean }) {
    const fromDraft = lead && isPlaceholderText(body) ? '' : body
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
                <span className="text-caption text-fg-subtle">
                    {lead ? (empty ? 'Yours to write · left out if empty' : 'Written by you') : empty ? 'Left out if empty' : ''}
                </span>
            </div>
            <textarea
                ref={ref}
                value={text}
                rows={empty ? 2 : 3}
                onChange={(e) => {
                    setText(e.target.value)
                    // Cleared again: the section is left out when published (a lead section gets
                    // its placeholder back, which publishing drops).
                    onChange(e.target.value.trim() || !lead ? e.target.value : LEAD_PLACEHOLDER)
                }}
                placeholder={lead ? (LEAD_PROMPTS[heading] ?? 'Your input') : 'Left out of the update if empty'}
                aria-label={heading}
                className={cn(
                    'w-full resize-none overflow-hidden rounded-control border px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-fg-subtle focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20',
                    empty ? 'border-dashed border-line-strong bg-surface-subtle' : 'border-line bg-surface',
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
 * One plain line says what publishing does. Publish saves it; Publish & send… publishes and opens
 * Email this update; Discard throws a draft away. Closing the pane keeps a draft behind Review.
 *
 * `kind: 'edit'` is the same pane for editing the published update by hand: every section a box,
 * Markdown for anything else, Cancel instead of Discard.
 */
export function SummaryDraftReview({
    streaming, streamText, generatedAt, value, onChange, mode, onModeChange, unfilledSections, busyAction,
    onPublish, onDismiss, onCopy, copied, note, published, draftBehind, onRewrite, onStop, kind = 'draft', onPublishAndSend,
}: SummaryDraftReviewProps) {
    const [showPublished, setShowPublished] = useState(false)
    // Typed out as Brio writes it (components/brio/brio-typing.tsx); the draft is still being
    // written until its last word is on screen.
    const typed = useTypedText(streamText, streaming)
    const writing = streaming || typed.typing
    const busy = busyAction !== null
    const empty = !value.trim()
    // The lead's sections always get a box, where they belong, even when a draft came without them.
    const withLead = withLeadSections(value)
    const sections = splitSections(withLead)
    // Unwritten lead sections, present or not (`unfilledSections` only counts the present ones).
    const missing = LEAD_SECTIONS.filter((h) => unfilledSections.includes(h) || !sections.some((s) => s.heading === h && !isPlaceholderText(s.body)))
    const editing = kind === 'edit'
    // A summary in sections can be missing the lead's; one written by hand without any isn't.
    const structured = /^## /m.test(value)
    const warnMissing = structured ? missing : []

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-small text-fg-muted">
                    {editing ? 'Editing the published update' : writing ? <><Brio className="animate-pulse" /> is writing…</> : <>Suggested by <Brio /></>}
                </span>
                {!writing && generatedAt && <span className="text-caption text-fg-subtle">{formatRelativeTime(generatedAt)}</span>}
                {streaming && onStop && (
                    <button
                        type="button"
                        onClick={onStop}
                        className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-small text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                    >
                        <Square className="h-3 w-3 fill-current" /> Stop
                    </button>
                )}
                {!writing && (
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
                {draftBehind && !writing && (
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
                {writing ? (
                    <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">
                        {typed.shown ? (
                            <BrioTypedText shown={typed.shown} />
                        ) : (
                            <span className="inline-flex items-center gap-2 text-fg-subtle"><ThinkingDots /><span><Brio /> is reading this engagement…</span></span>
                        )}
                    </p>
                ) : mode === 'edit' ? (
                    <textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={busy}
                        aria-label="Summary draft (Markdown)"
                        className="min-h-[18rem] w-full flex-1 resize-none rounded-control border border-line bg-surface px-3 py-2 font-mono text-small leading-relaxed text-fg focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20 disabled:opacity-60"
                    />
                ) : empty && !editing ? (
                    <p className="text-small text-fg-subtle">The draft is empty. Open Markdown to write it.</p>
                ) : editing && !/^## /m.test(value) ? (
                    // Written by hand without sections: one box for all of it.
                    <SectionField heading="Update" body={value} lead={false} onChange={onChange} />
                ) : (
                    <div className="flex flex-col gap-6">
                        {sections.map((s, i) => s.heading && (editing || LEAD_SECTIONS.includes(s.heading)) ? (
                            <SectionField
                                key={s.heading}
                                heading={s.heading}
                                body={s.body}
                                lead={LEAD_SECTIONS.includes(s.heading)}
                                onChange={(text) => onChange(writeSection(withLead, s.heading!, text))}
                            />
                        ) : editing ? (
                            <SectionField key={`intro-${i}`} heading="Introduction" body={s.body} lead={false} onChange={(text) => onChange(writePreamble(withLead, text))} />
                        ) : (
                            <BrioSections key={s.heading ?? `intro-${i}`} content={s.heading ? `## ${s.heading}\n${s.body}` : s.body} className="text-fg" />
                        ))}
                    </div>
                )}

                {published && !writing && (
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

            {!writing && (
                <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                    {note && <p className="text-caption text-action">{note}</p>}
                    {/* Warned, not blocked: unwritten, they're left out of what publishes. */}
                    <MissingSectionsWarning missing={warnMissing} risks={hasRisks(withLead)} />
                    {/* One line: what publishing does. The detail is in the tip. */}
                    <p className="flex items-start gap-1.5 text-caption text-fg-muted">
                        <span>
                            Publishing saves this as the engagement summary everyone on it sees.
                            {onPublishAndSend && ' Publish & send opens the email next, filled in.'}
                        </span>
                        <InfoHint
                            label="About publishing"
                            text={`It is visible to everyone on the engagement and goes into the PDF.${published ? ' It replaces the summary published' + (published.publishedAt ? ` ${formatRelativeTime(published.publishedAt)}` : ' earlier') + '.' : ''}${warnMissing.length ? ` ${warnMissing.map(sectionInSentence).join(' and ')} ${warnMissing.length === 1 ? 'is' : 'are'} yours to write: Brio reports what the data shows and doesn't commit your firm to a plan.` : ''}`}
                        />
                    </p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={onCopy} disabled={empty} aria-label="Copy draft summary to clipboard" className="mr-auto">
                            {copied ? <Check className="h-3 w-3 text-action" /> : <Copy className="h-3 w-3" />}
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
                            {busyAction === 'dismiss' && <RefreshCw className="h-3 w-3 animate-spin" />}
                            {editing ? 'Cancel' : 'Discard'}
                        </Button>
                        {onPublishAndSend && (
                            <Button size="sm" variant="outline" onClick={onPublishAndSend} disabled={busy || empty}>
                                <Send className="h-3 w-3" aria-hidden />
                                Publish &amp; send…
                            </Button>
                        )}
                        <Button size="sm" onClick={onPublish} disabled={busy || empty}>
                            {busyAction === 'publish' && <RefreshCw className="h-3 w-3 animate-spin" />}
                            {warnMissing.length > 0 ? 'Publish without them' : 'Publish'}
                        </Button>
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
