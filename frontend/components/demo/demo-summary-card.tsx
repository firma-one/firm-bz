'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Clock, Copy, FileText, Square, Trash2 } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { BrioSections } from '@/components/ui/brio-sections'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    SummaryDraftReviewPane,
    summaryReviewStore,
    type ReviewMode,
    type SummaryDraftReviewProps,
} from '@/components/projects/summary-draft-review'
import { useRightPane } from '@/lib/right-pane-context'
import { findUnfilledSections } from '@/lib/ai/summary-sections'
import { buildDemoSummary, type DemoSummaryInput } from '@/lib/demo/demo-summary'
import { formatRelativeTime } from '@/lib/utils'

const CONTROL = 'inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-small transition-colors hover:border-line-strong hover:bg-surface-hover'

/**
 * The tour's Engagement Summary: a sample already "published" two days ago, and a Rewrite with
 * Brio that behaves like the app's — a fresh draft typed out word by word (no AI call; the tour
 * has no backend), reviewed in the same docked right pane the app uses (the tour shell has it),
 * with the lead's two sections to fill in, then published over the sample or discarded. Closing
 * the pane discards the draft, asking first if anything was typed. Resets on reload.
 */
export function DemoSummaryCard({ input, today }: { input: DemoSummaryInput; today: Date }) {
    const [published, setPublished] = useState(() => ({
        content: buildDemoSummary(input, { leadFilled: true }),
        publishedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
    }))
    const [draft, setDraft] = useState<{ content: string; generatedAt: string } | null>(null)
    const [draftEdit, setDraftEdit] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [streamText, setStreamText] = useState('')
    const [mode, setMode] = useState<ReviewMode>('preview')
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [copied, setCopied] = useState<'published' | 'draft' | null>(null)
    const timer = useRef<number | null>(null)

    // The pane, exactly as the app's Overview drives it (engagement-insights-dashboard.tsx).
    const rightPane = useRightPane()
    const paneOpen = useSyncExternalStore(summaryReviewStore.subscribe, summaryReviewStore.isOpen, () => false)
    const clearPaneRef = useRef(rightPane.clearPane)
    useEffect(() => { clearPaneRef.current = rightPane.clearPane }, [rightPane.clearPane])

    const stopTyping = () => {
        if (timer.current !== null) window.clearInterval(timer.current)
        timer.current = null
    }

    /** Drops the draft. The pane closes on its own when called from its ×; otherwise call clearPane. */
    const discard = () => {
        stopTyping()
        setStreaming(false)
        setStreamText('')
        setDraft(null)
        setDraftEdit('')
    }

    // Closing the pane (its ×) discards the draft; with typed text, ask first.
    const closeGuardRef = useRef<() => boolean>(() => true)
    useEffect(() => {
        closeGuardRef.current = () => {
            if (draft && draftEdit.trim() !== draft.content.trim()) {
                setConfirmOpen(true)
                return false
            }
            discard()
            return true
        }
    })

    const openPane = () => {
        if (summaryReviewStore.isOpen()) return
        rightPane.setTitle('Summary draft')
        rightPane.setHeaderIcon(<FileText className="h-4 w-4" />)
        rightPane.setHeaderSubtitle('')
        rightPane.setHeaderActions(null)
        rightPane.setPaneSize('medium')
        rightPane.setContent(<SummaryDraftReviewPane />)
        rightPane.setBeforeClose(() => closeGuardRef.current())
    }

    const rewrite = () => {
        stopTyping()
        const text = buildDemoSummary(input, { leadFilled: false })
        // Words with their trailing spaces, released a couple at a time: reads as typing.
        const words = text.split(/(?<=\s)/)
        setDraft(null)
        setDraftEdit('')
        setMode('preview')
        setStreamText('')
        setStreaming(true)
        openPane()
        let shown = 0
        timer.current = window.setInterval(() => {
            shown = Math.min(words.length, shown + 2)
            setStreamText(words.slice(0, shown).join(''))
            if (shown >= words.length) {
                stopTyping()
                setStreaming(false)
                setStreamText('')
                setDraft({ content: text, generatedAt: new Date().toISOString() })
                setDraftEdit(text)
            }
        }, 45)
    }

    const publish = () => {
        setPublished({ content: draftEdit.trim(), publishedAt: new Date().toISOString() })
        setDraft(null)
        setDraftEdit('')
        clearPaneRef.current()
    }

    const copy = async (text: string, which: 'published' | 'draft') => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(which)
            window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
        } catch { /* clipboard blocked: the text is on screen */ }
    }

    // What the pane shows, published on every render (the pane holds SummaryDraftReviewPane).
    const reviewing = streaming || !!draft
    const reviewProps: SummaryDraftReviewProps = {
        streaming,
        streamText,
        generatedAt: draft?.generatedAt ?? null,
        value: draftEdit,
        onChange: setDraftEdit,
        mode,
        onModeChange: setMode,
        unfilledSections: findUnfilledSections(draftEdit),
        busyAction: null,
        onPublish: publish,
        onDismiss: () => { discard(); clearPaneRef.current() },
        onCopy: () => copy(draftEdit, 'draft'),
        copied: copied === 'draft',
        note: null,
        published,
        draftBehind: false,
        onRewrite: rewrite,
        // As in the app: stopping throws the unfinished draft away and closes the pane.
        onStop: () => { discard(); clearPaneRef.current() },
    }
    useLayoutEffect(() => {
        summaryReviewStore.set(reviewing ? reviewProps : null)
    })
    // Leaving the page takes the pane and the typing with it.
    useEffect(() => () => {
        stopTyping()
        if (summaryReviewStore.isOpen()) clearPaneRef.current()
        summaryReviewStore.set(null)
    }, [])

    return (
        <>
            <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 pb-2 pt-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-small font-medium text-fg-muted">Engagement Summary</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-caption text-fg-subtle">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(published.publishedAt)}
                        </span>
                    </div>
                    {reviewing ? (
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-small text-fg-muted">
                                {streaming ? <><Brio className="animate-pulse" /> is writing a new summary…</> : <><Brio /> drafted a new summary</>}
                            </span>
                            <button type="button" disabled={paneOpen} onClick={openPane} className={`${CONTROL} font-medium text-action disabled:cursor-default disabled:text-fg-subtle disabled:hover:bg-surface`}>
                                {paneOpen ? 'Reviewing' : 'Review'}
                            </button>
                            {streaming && (
                                <button type="button" onClick={() => { discard(); clearPaneRef.current() }} className={`${CONTROL} text-fg-muted hover:text-fg`}>
                                    <Square className="h-3 w-3 fill-current" /> Stop
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex shrink-0 items-center gap-2">
                            <button type="button" onClick={() => copy(published.content, 'published')} aria-label="Copy summary to clipboard" className={`${CONTROL} text-fg-muted hover:text-fg`}>
                                {copied === 'published' ? <Check className="h-3 w-3 text-action" /> : <Copy className="h-3 w-3" />}
                                {copied === 'published' ? 'Copied' : 'Copy'}
                            </button>
                            <button type="button" onClick={rewrite} className={`${CONTROL} font-medium text-action`}>
                                Rewrite with <Brio />
                            </button>
                        </div>
                    )}
                </div>
                <BrioSections content={published.content} className="px-4 py-3 text-fg-muted" />
            </div>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                icon={<Trash2 />}
                iconVariant="amber"
                title="Discard this draft?"
                description="What you typed in it will be lost. The published summary stays as it is."
                cancelLabel="Keep reviewing"
                confirmLabel="Discard"
                confirmVariant="red"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                    setConfirmOpen(false)
                    discard()
                    clearPaneRef.current()
                }}
            />
        </>
    )
}
