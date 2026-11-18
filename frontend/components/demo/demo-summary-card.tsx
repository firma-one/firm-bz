'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Copy, FileText, Mail, Sparkles, Trash2 } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { BrioByline } from '@/components/ui/brio-byline'
import { Hint } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LatestUpdate } from '@/components/projects/overview-layout'
import {
    SummaryDraftReviewPane,
    summaryReviewStore,
    type ReviewMode,
    type SummaryDraftReviewProps,
} from '@/components/projects/summary-draft-review'
import { useRightPane } from '@/lib/right-pane-context'
import { dropUnfilledLeadSections, findUnfilledSections } from '@/lib/ai/summary-sections'
import { buildDemoSummary, type DemoSummaryInput } from '@/lib/demo/demo-summary'
import { EmailUpdateSheet } from '@/components/projects/email-update-sheet'
import { BrioWorkingSparkle } from '@/components/brio/brio-working-sparkle'
import { updateSendText, type UpdateRecipientsInfo } from '@/lib/updates/update-send'
import { useUpdateEmail } from '@/components/projects/update-email-fields'
import { ROLE_NAME } from '@/lib/persona-ui-groups'
import { DEMO_ENGAGEMENT_MEMBERS } from './demo-engagement-members'

const CONTROL = 'inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-small transition-colors hover:border-line-strong hover:bg-surface-hover'
/** The header's actions, as in the app: 28px icon buttons named by a Hint and an aria-label. */
const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30'
/** The tour's signed-in person, who published the sample and publishes any rewrite. */
const TOUR_PUBLISHER = 'Demo User'

/**
 * Who the tour's update goes to: its engagement's people (demo-engagement-members.tsx) but the tour's
 * own signed-in Lead, as the app fills them in. Nothing is sent from the tour.
 */
function tourRecipients(today: Date): UpdateRecipientsInfo {
    return {
        recipients: DEMO_ENGAGEMENT_MEMBERS
            .filter((m) => m.slug !== 'eng_admin')
            .sort((a, b) => (a.slug === 'eng_viewer' ? -1 : b.slug === 'eng_viewer' ? 1 : a.name.localeCompare(b.name)))
            .map((m) => ({ userId: `tour-${m.email}`, name: m.name, role: ROLE_NAME[m.slug], email: m.email })),
        lastSent: { sentAt: new Date(today.getTime() - 14 * 86400000).toISOString(), to: ['Morgan Ellis'] },
    }
}

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
    const { addToast } = useToast()
    // Email this update and "Also email it to …", as the app has them, with the tour's people;
    // nothing is sent.
    const tourInfo = useMemo(() => tourRecipients(today), [today])
    const [emailSheetOpen, setEmailSheetOpen] = useState(false)
    const [emailOnPublish, setEmailOnPublish] = useState(false)
    const publishEmail = useUpdateEmail({ projectId: 'tour', active: true, demo: tourInfo })
    const [choosingRecipients, setChoosingRecipients] = useState(false)

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

    // As in the app: closing the pane only closes it. Brio keeps writing (the working sparkle opens it
    // again), and a finished draft waits behind Review. Discard throws it away; with typed text, ask first.
    const closeGuardRef = useRef<() => boolean>(() => true)
    const draftTyped = !!draft && draftEdit.trim() !== draft.content.trim()

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
        // Each draft starts unticked, as in the app.
        setEmailOnPublish(false)
        publishEmail.reset()
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
                if (!summaryReviewStore.isOpen()) {
                    addToast({ type: 'success', title: `${ASSISTANT.name}'s draft is ready`, message: 'Review it on the Latest update, then publish or send it.' })
                }
            }
        }, 45)
    }

    const publish = () => {
        // As the app publishes it: the lead's sections left unwritten are left out.
        setPublished({ content: dropUnfilledLeadSections(draftEdit) || draftEdit.trim(), publishedAt: new Date().toISOString() })
        setDraft(null)
        setDraftEdit('')
        clearPaneRef.current()
        addToast(emailOnPublish && publishEmail.count > 0
            ? updateSendText({ sent: publishEmail.count, total: publishEmail.count, failed: [] }, true)
            : { type: 'success', title: 'Summary published', message: 'Visible to everyone on the engagement and in exports.' })
        setEmailOnPublish(false)
        publishEmail.reset()
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
        onDismiss: () => { if (draftTyped) setConfirmOpen(true); else { discard(); clearPaneRef.current() } },
        onCopy: () => copy(draftEdit, 'draft'),
        copied: copied === 'draft',
        note: null,
        published,
        draftBehind: false,
        onRewrite: rewrite,
        // As in the app: stopping throws the unfinished draft away and closes the pane.
        onStop: () => { discard(); clearPaneRef.current() },
        // As the app: "Also email it to …" by the Publish button; Change opens the email form.
        email: { on: emailOnPublish, onToggle: setEmailOnPublish, state: publishEmail, onChange: () => setChoosingRecipients(true) },
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
            {/* As the app's Overview: the Latest update section (overview-layout.tsx), its first part
                on screen and the rest behind Read the full update. */}
            <LatestUpdate
                content={published.content}
                meta={<span className="text-small text-fg-muted">{new Date(published.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                actions={reviewing && !streaming ? (
                    <>
                        <span className="inline-flex items-center gap-1.5 text-small text-fg-muted">
                            <Brio /> drafted a new summary
                        </span>
                        <button type="button" disabled={paneOpen} onClick={openPane} className={`${CONTROL} font-medium text-action disabled:cursor-default disabled:text-fg-subtle disabled:hover:bg-surface`}>
                            {paneOpen ? 'Reviewing' : 'Review'}
                        </button>
                    </>
                ) : (
                    <>
                        <Hint label={copied === 'published' ? 'Copied' : 'Copy as Markdown'}>
                            <button type="button" onClick={() => copy(published.content, 'published')} aria-label="Copy the summary as Markdown" className={ICON_BUTTON}>
                                {copied === 'published' ? <Check className="h-4 w-4 text-status-done-icon" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </Hint>
                        {streaming ? (
                            // As in the app: Brio is still writing; the working sparkle opens the pane.
                            <Hint label={<><Brio /> is writing a new summary{paneOpen ? '' : ' · Open it'}</>}>
                                <button type="button" onClick={openPane} aria-label={`${ASSISTANT.name} is writing a new summary. Open it`} aria-busy="true" className={ICON_BUTTON}>
                                    <BrioWorkingSparkle />
                                </button>
                            </Hint>
                        ) : (
                            <Hint label={<>Rewrite with <Brio /></>}>
                                <button type="button" onClick={rewrite} aria-label={`Rewrite with ${ASSISTANT.name}`} className={ICON_BUTTON}>
                                    <Sparkles className="h-4 w-4" style={{ color: BRIO_GREEN }} />
                                </button>
                            </Hint>
                        )}
                        {/* As the app: last, the published update emailed as it is. */}
                        <Hint label="Email this update">
                            <button type="button" onClick={() => setEmailSheetOpen(true)} aria-label="Email this update" className={ICON_BUTTON}>
                                <Mail className="h-4 w-4" />
                            </button>
                        </Hint>
                    </>
                )}
                byline={<BrioByline source="ai" publisherName={TOUR_PUBLISHER} date={published.publishedAt} />}
            />

            <EmailUpdateSheet
                mode="choose"
                open={choosingRecipients}
                onOpenChange={setChoosingRecipients}
                projectId="tour"
                summary=""
                publishedAt={null}
                stale={false}
                state={publishEmail}
                demo={tourInfo}
                onDone={() => setEmailOnPublish(publishEmail.count > 0)}
            />
            <EmailUpdateSheet
                open={emailSheetOpen}
                onOpenChange={setEmailSheetOpen}
                projectId="tour"
                summary={published.content}
                publishedAt={published.publishedAt}
                stale={false}
                onRewrite={rewrite}
                demo={tourInfo}
            />

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
