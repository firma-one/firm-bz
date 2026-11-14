'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Plus, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import { Brio } from '@/components/ui/brio'
import { Hint } from '@/components/ui/tooltip'
import { LoadFailed } from '@/components/ui/load-failed'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { useToast } from '@/components/ui/toast'
import {
    NotesProposalsReview,
    proposalsFailureMessage,
    requestNotesProposals,
    useApplyNotesProposal,
    type ApplyOutcome,
    type NotesEngagementRef,
    type NotesProposalsFound,
} from '@/components/projects/notes-proposals-panel'
import { AddMemoSheet, type AddMemoInput, type AddMemoOutcome } from '@/components/projects/add-memo-sheet'
import { DiscussionsBarPortal } from '@/components/projects/discussions-switch'
import { AiAbortedError } from '@/lib/ai/fetch-timeout'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { cn } from '@/lib/utils'
import {
    appliedLabelOf,
    appliedTargetOf,
    boldSpeakers,
    byNewestMemo,
    memoMetaLine,
    resolveMemoReview,
    splitMemoMarkdown,
    type MemoListItem,
    type MemoRaidSuggestion,
    type MemoReviewPayload,
} from '@/lib/memos/memo-shared'
import { RAID_TYPE_LABEL, RAID_TYPE_LETTER } from '@/lib/raid/raid-shared'
import type { DeliverableProposal, NotesProposal } from '@/lib/ai/notes-proposals'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'

/*
 * Discussions › Memos (.claude/plans/brio-features-round-2.md, §8): call and meeting notes kept as one
 * Markdown file each in the engagement's "Internal Memos" folder, internal only. The list on the left,
 * newest call first; the memo beside it, read from storage when opened and never stored; and Action items,
 * where Brio's sparkle has it read that memo and propose reminders, due-date moves and new deliverables,
 * each editable before it's applied. From 1040 px wide the three are columns of one short, fixed height,
 * each scrolling on its own, so a long transcript scrolls while the list and the actions stay in view;
 * narrower, they stack. Leads and Full Access contributors only (the routes refuse anyone else).
 *
 * `MemosView` is the sub-tab alone, with what it does passed in, so /tour renders the same one over
 * memos kept in memory (components/demo/demo-memos.tsx). `EngagementMemosTab` is the app's, driven by
 * `useEngagementMemos`, which Discussions holds so the switch can count the memos on any sub-tab.
 */

export type ApplicableProposal = Exclude<NotesProposal, DeliverableProposal>

/** Proposals from one memo, with what a reminder needs to point back to the engagement. */
export interface MemoFound extends NotesProposalsFound {
    engagement?: NotesEngagementRef
}

export const MEMO_PROPOSALS_FOOTNOTE = 'Applied action items note this memo, so identifying them again shows them as done.'

/** Where the memos are kept, as the memos route names it. */
export type MemoStorageName = 'Google Drive' | 'OneDrive'

/** A memo as the pane shows it: its file's Markdown, and the link that opens it in storage when there is one. */
export interface MemoContent {
    text: string
    webUrl: string | null
}

/** "Nov" over "12": the day of the call. Spans, so it can sit inside a row's button. */
export function MemoDateBlock({ date }: { date: string }) {
    const d = new Date(`${date}T00:00:00Z`)
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    return (
        <span
            className="flex w-10 shrink-0 flex-col items-center rounded-control border border-line bg-surface py-1 leading-none"
            title={d.getUTCFullYear() === new Date().getFullYear() ? undefined : label}
            aria-label={label}
            role="img"
        >
            <span className="text-[11px] font-medium text-fg-subtle">{month}</span>
            <span className="mt-0.5 text-ui font-semibold tabular-nums text-fg">{d.getUTCDate()}</span>
        </span>
    )
}

const appliedLine = (n: number) => `${n} action item${n === 1 ? '' : 's'} applied`

// ── The app's memos ───────────────────────────────────────────────────────────────────────────

export type MemoSaveOutcome =
    | { ok: true; memo: MemoListItem; fileName: string; warning?: string }
    | { ok: false; error: string }

/**
 * The engagement's memos from the memos route, and what's done with them: save one, identify the action items
 * in one, apply one of those (then note it on the memo). Render `dueDialog`: a due date may stop to ask.
 */
export function useEngagementMemos(projectId: string) {
    const [memos, setMemos] = useState<MemoListItem[] | null>(null)
    const [readOnly, setReadOnly] = useState(false)
    const [storage, setStorage] = useState<MemoStorageName | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)
    // Memos saved here whose action items (§13) are still being identified: the list is read again every
    // few seconds while the tab is visible, until each has its review or three minutes have passed.
    const [awaiting, setAwaiting] = useState<string[]>([])
    const { apply: applyProposal, dialog: dueDialog } = useApplyNotesProposal(projectId)

    useEffect(() => {
        let live = true
        void (async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/memos`)
                if (!res.ok) throw await failureFrom(res)
                const body = await res.json() as { data: { memos?: MemoListItem[]; readOnly?: boolean; storage?: MemoStorageName | null } }
                if (!live) return
                const list = body.data.memos ?? []
                setMemos(list)
                setAwaiting((ids) => ids.filter((id) => !list.find((m) => m.id === id)?.reviewedAt))
                setReadOnly(!!body.data.readOnly)
                setStorage(body.data.storage ?? null)
                setLoadError(null)
            } catch (e) {
                if (live) setLoadError(failureReason(e))
            }
        })()
        return () => { live = false }
    }, [projectId, tick])

    const reload = useCallback(() => setTick((t) => t + 1), [])

    const awaitingCount = awaiting.length
    useEffect(() => {
        if (awaitingCount === 0) return
        let polls = 0
        const id = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return
            polls += 1
            if (polls > REVIEW_POLLS) {
                setAwaiting([])
                return
            }
            setTick((t) => t + 1)
        }, REVIEW_POLL_MS)
        return () => window.clearInterval(id)
    }, [awaitingCount])

    const save = useCallback(async (input: AddMemoInput): Promise<MemoSaveOutcome> => {
        try {
            const res = await fetch(`/api/projects/${projectId}/memos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            })
            if (!res.ok) throw await failureFrom(res)
            const out = await res.json() as { data: { memo: MemoListItem; fileName: string }; warning?: string }
            const memo = out.data.memo
            setMemos((list) => [memo, ...(list ?? []).filter((m) => m.id !== memo.id)].sort(byNewestMemo))
            setAwaiting((ids) => [...ids, memo.id])
            return { ok: true, memo, fileName: out.data.fileName, ...(out.warning ? { warning: out.warning } : {}) }
        } catch (e) {
            return { ok: false, error: failureReason(e) }
        }
    }, [projectId])

    const findActions = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoFound> => {
        try {
            return await requestNotesProposals(projectId, { memoDocumentId: memo.id }, signal)
        } catch (e) {
            if (e instanceof AiAbortedError) throw e
            throw new Error(proposalsFailureMessage(e))
        }
    }, [projectId])

    /** Applies it as a person would, then notes it on the memo. A note that fails doesn't undo the apply. */
    const apply = useCallback(async (memo: MemoListItem, found: MemoFound, p: ApplicableProposal, original?: ApplicableProposal): Promise<ApplyOutcome> => {
        const outcome = await applyProposal(p, found.engagement ?? null, `From the memo “${memo.title}”: “${p.quote}”`)
        if (!outcome.ok) return outcome
        // What Brio found is what's recorded, so identifying them again knows it's done even after an edit.
        const target = appliedTargetOf(original ?? p)
        try {
            const res = await fetch(`/api/projects/${projectId}/memos/${memo.id}/applied`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...target, label: appliedLabelOf(p) }),
            })
            if (!res.ok) throw await failureFrom(res)
            const body = await res.json() as { data: { appliedCount: number } }
            setMemos((list) => (list ?? []).map((m) => (m.id === memo.id ? { ...m, appliedCount: body.data.appliedCount } : m)))
            // What still waits on the memo changed with it.
            setTick((t) => t + 1)
            return outcome
        } catch (e) {
            const done = p.kind === 'reminder' ? 'Reminder added' : 'Due date moved'
            return { ok: true, warning: `${done}, but the memo doesn't note it. ${failureReason(e)}` }
        }
    }, [applyProposal, projectId])

    /** What waits on a memo (§13), from the database: read on every open and after every action. */
    const loadReview = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoReviewPayload> => {
        const res = await fetch(`/api/projects/${projectId}/memos/${memo.id}/review`, { signal })
        if (!res.ok) throw await failureFrom(res)
        return (await res.json() as { data: MemoReviewPayload }).data
    }, [projectId])

    /** Dismiss all: the memo's action items no longer wait. Throws an error carrying the words to show. */
    const dismissReview = useCallback(async (memo: MemoListItem): Promise<void> => {
        const res = await fetch(`/api/projects/${projectId}/memos/${memo.id}/review`, { method: 'DELETE' })
        if (!res.ok) throw await failureFrom(res)
        setTick((t) => t + 1)
    }, [projectId])

    /** Accepts or dismisses one of the memo's RAID suggestions, through the RAID log's own route. */
    const actOnRaid = useCallback(async (_memo: MemoListItem, itemId: string, action: 'accept' | 'dismiss'): Promise<void> => {
        const res = await fetch(`/api/projects/${projectId}/raid/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        })
        if (!res.ok) throw await failureFrom(res)
        setTick((t) => t + 1)
    }, [projectId])

    return {
        memos, readOnly, storage, loadError, reload, save, findActions, apply, dueDialog,
        loadReview, dismissReview, actOnRaid, identifyingIds: awaiting,
    }
}

/** How often, and how many times, the list is read again for a new memo's action items (§13). */
const REVIEW_POLL_MS = 5_000
const REVIEW_POLLS = 36

export type EngagementMemosController = ReturnType<typeof useEngagementMemos>

/** Discussions › Memos in the app: the view over the memos route, the content route and the Add sheet. */
export function EngagementMemosTab({
    projectId,
    memos: m,
    engagementBase,
    readOnly = false,
    selectedId,
    onSelect,
}: {
    projectId: string
    memos: EngagementMemosController
    /** The engagement's path: a memo storage gives no link for opens in its Files tab. */
    engagementBase?: string
    /** The engagement is completed: memos read, nothing added or applied. */
    readOnly?: boolean
    selectedId: string | null
    onSelect: (memoId: string) => void
}) {
    const { addToast } = useToast()
    const [adding, setAdding] = useState(false)

    const loadContent = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoContent> => {
        const res = await fetch(`/api/projects/${projectId}/memos/${memo.id}/content`, { signal })
        if (!res.ok) throw await failureFrom(res)
        const body = await res.json() as { data: MemoContent }
        return { text: body.data.text ?? '', webUrl: body.data.webUrl ?? null }
    }, [projectId])

    const filesHref = useCallback(
        (memo: MemoListItem) => (engagementBase ? `${engagementBase}/files#doc-file:${memo.id}` : undefined),
        [engagementBase],
    )

    const save = async (input: AddMemoInput): Promise<AddMemoOutcome> => {
        const out = await m.save(input)
        if (!out.ok) return out
        onSelect(out.memo.id)
        addToast({
            type: out.warning ? 'warning' : 'success',
            title: 'Memo saved',
            message: out.warning ?? `Saved as ${out.fileName} in Internal Memos.`,
        })
        return { ok: true }
    }

    return (
        <>
            <MemosView
                memos={m.memos}
                loadError={m.loadError}
                onRetry={m.reload}
                readOnly={readOnly || m.readOnly}
                storage={m.storage}
                addDisabledReason={m.memos !== null && !m.storage ? 'Connect Google Drive or OneDrive for this client to add memos.' : null}
                onAdd={() => setAdding(true)}
                selectedId={selectedId}
                onSelect={onSelect}
                loadContent={loadContent}
                filesHref={filesHref}
                findActions={m.findActions}
                apply={m.apply}
                loadReview={m.loadReview}
                dismissReview={m.dismissReview}
                actOnRaid={m.actOnRaid}
                identifyingIds={m.identifyingIds}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
        </>
    )
}

// ── The view ──────────────────────────────────────────────────────────────────────────────────

export interface MemosViewProps {
    /** Null while loading. */
    memos: MemoListItem[] | null
    loadError?: string | null
    onRetry?: () => void
    /** A completed engagement: listed and read, nothing added or applied. */
    readOnly: boolean
    /** Where the memos are kept; null when no storage is connected. */
    storage: MemoStorageName | null
    /** Why "Add internal memo" is off, when it is. */
    addDisabledReason?: string | null
    onAdd: () => void
    /** The memo asked for (the URL's); the newest is shown when it's none of these. */
    selectedId: string | null
    onSelect: (memoId: string) => void
    /** The memo's file. Throws an error carrying the words to show. */
    loadContent: (memo: MemoListItem, signal: AbortSignal) => Promise<MemoContent>
    /** Where Open goes when storage gave no link: the memo in Files. */
    filesHref?: (memo: MemoListItem) => string | undefined
    /** Why Open is off when there's no link at all (/tour). */
    openUnavailable?: string
    /** Brio's proposals from one memo. Throws an error carrying the words to show (or an AiAbortedError). */
    findActions: (memo: MemoListItem, signal: AbortSignal) => Promise<MemoFound>
    /**
     * Applies one reminder or due date found in `memo`: `proposal` as the person edited it, `original`
     * as Brio found it (what the memo records as applied).
     */
    apply: (memo: MemoListItem, found: MemoFound, proposal: ApplicableProposal, original?: ApplicableProposal) => Promise<ApplyOutcome>
    /** What waits on a memo (§13): its action items and RAID suggestions. Absent: nothing waits. */
    loadReview?: (memo: MemoListItem, signal: AbortSignal) => Promise<MemoReviewPayload>
    /** Dismiss all: the memo's action items no longer wait. Throws an error carrying the words to show. */
    dismissReview?: (memo: MemoListItem) => Promise<void>
    /** Accepts or dismisses one of the memo's RAID suggestions. Throws an error carrying the words to show. */
    actOnRaid?: (memo: MemoListItem, itemId: string, action: 'accept' | 'dismiss') => Promise<void>
    /** Memos whose action items are being identified right now (just added). */
    identifyingIds?: readonly string[]
}

/**
 * The list, the memo and Action items. From 1040 px wide (the view, not the window): three columns of
 * one short, fixed height, each scrolling on its own, so a 30-minute transcript scrolls inside the memo
 * while the list and the action items stay beside it. Narrower, they stack, and the memo keeps the same
 * short height. Deepak asked for the memo to be "quite short" (2026-11-14); one number to tune.
 */
// Written out whole: Tailwind only builds classes it can read in the source.
const MEMO_COLUMNS_HEIGHT = '@[1040px]:h-[480px]'
const MEMO_STACKED_MAX_HEIGHT = 'max-h-[480px]'

function MemosColumns({ withActions, children }: { withActions: boolean; children: ReactNode }) {
    return (
        <div className="@container">
            <div
                className={cn(
                    // The bottom edge closes the columns, so their dividers don't just stop.
                    'flex flex-wrap border-b border-line @[1040px]:grid',
                    MEMO_COLUMNS_HEIGHT,
                    withActions
                        ? '@[1040px]:grid-cols-[260px_minmax(0,1fr)_minmax(300px,360px)]'
                        : '@[1040px]:grid-cols-[260px_minmax(0,1fr)]',
                )}
            >
                {children}
            </div>
        </div>
    )
}

export function MemosView({
    memos,
    loadError,
    onRetry,
    readOnly,
    storage,
    addDisabledReason,
    onAdd,
    selectedId,
    onSelect,
    loadContent,
    filesHref,
    openUnavailable,
    findActions,
    apply,
    loadReview,
    dismissReview,
    actOnRaid,
    identifyingIds,
}: MemosViewProps) {
    const [query, setQuery] = useState('')
    // Files read this visit, so going back to a memo doesn't read it again. Never stored anywhere else.
    const [contents, setContents] = useState<Record<string, MemoContent>>({})
    const remember = useCallback((id: string, content: MemoContent) => setContents((prev) => ({ ...prev, [id]: content })), [])

    const q = query.trim().toLowerCase()
    const shown = useMemo(() => {
        if (!memos) return []
        if (!q) return memos
        return memos.filter((m) => m.title.toLowerCase().includes(q) || m.authorFirstName.toLowerCase().includes(q))
    }, [memos, q])
    const selected = memos?.find((m) => m.id === selectedId) ?? shown[0] ?? null
    const hasMemos = !!memos && memos.length > 0

    return (
        <>
            <DiscussionsBarPortal>
                <span className="text-small text-fg-muted">Internal only · Leads and Full Access contributors</span>
                <span className="flex-1" />
                {hasMemos && (
                    <div className="relative w-52">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" aria-hidden />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Title or who wrote it"
                            aria-label="Search memos by title or who wrote it"
                            className="h-7 pl-8 text-small"
                        />
                    </div>
                )}
                {readOnly ? (
                    <span className="text-small text-fg-subtle">Read only · completed</span>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        onClick={onAdd}
                        disabled={!!addDisabledReason || memos === null}
                        title={addDisabledReason ?? undefined}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add internal memo
                    </Button>
                )}
            </DiscussionsBarPortal>

            <div className="border-t border-line">
                {loadError && memos === null ? (
                    <LoadFailed what="the memos" reason={loadError} onRetry={onRetry} />
                ) : memos === null ? (
                    <MemosSkeleton />
                ) : memos.length === 0 ? (
                    <p className="px-4 py-6 text-small text-fg-muted">
                        {readOnly ? 'No memos were added to this engagement.' : 'No memos yet. Add one after your next call.'}
                    </p>
                ) : (
                    <MemosColumns withActions={!readOnly}>
                        <section
                            aria-label="Memos"
                            className="min-w-0 flex-[1_1_320px] border-line sm:max-w-[420px] sm:border-r @[1040px]:min-h-0 @[1040px]:max-w-none @[1040px]:overflow-y-auto"
                        >
                            {shown.length === 0 ? (
                                <p className="border-b border-line px-4 py-3 text-small text-fg-muted">No memos match “{query.trim()}”.</p>
                            ) : (
                                <ul>
                                    {shown.map((memo) => {
                                        const isSelected = selected?.id === memo.id
                                        return (
                                            <li key={memo.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(memo.id)}
                                                    aria-current={isSelected ? 'true' : undefined}
                                                    data-testid={`memo-row-${memo.id}`}
                                                    className={cn(
                                                        'flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors',
                                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/30',
                                                        isSelected ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                                                    )}
                                                >
                                                    <MemoDateBlock date={memo.date} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-ui font-semibold text-fg">{memo.title}</span>
                                                        <span className="block text-small text-fg-muted">{memoMetaLine(memo)}</span>
                                                        {memo.toReview > 0 ? (
                                                            <span className="mt-0.5 block text-caption font-medium text-fg">{memo.toReview} to review</span>
                                                        ) : memo.appliedCount > 0 && (
                                                            <span className="mt-0.5 block text-caption font-normal text-fg-muted">{appliedLine(memo.appliedCount)}</span>
                                                        )}
                                                    </span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                            {storage && (
                                <p className="px-4 py-3 text-small text-fg-muted">
                                    Each memo is a Markdown file in “Internal Memos” in your {storage}.
                                </p>
                            )}
                        </section>
                        {selected && (
                            <MemoPane
                                key={selected.id}
                                memo={selected}
                                storage={storage}
                                readOnly={readOnly}
                                cached={contents[selected.id]}
                                onLoaded={remember}
                                loadContent={loadContent}
                                filesHref={filesHref}
                                openUnavailable={openUnavailable}
                                findActions={findActions}
                                apply={apply}
                                loadReview={loadReview}
                                dismissReview={dismissReview}
                                actOnRaid={actOnRaid}
                                identifying={!!identifyingIds?.includes(selected.id)}
                            />
                        )}
                    </MemosColumns>
                )}
            </div>
        </>
    )
}

type PaneContent =
    | { status: 'loading' }
    | { status: 'ready'; content: MemoContent }
    | { status: 'error'; reason: string }

/** Headings in a memo's own notes, at the pane's sizes (the file's title is drawn apart). */
const MEMO_BODY_CLASS = cn(
    'text-ui leading-[22px] text-fg',
    '[&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:text-ui [&_h1]:font-semibold [&_h1]:text-fg',
    '[&_h2]:text-ui [&_h2]:text-fg [&_h4]:font-semibold',
)

/**
 * The open memo and its Actions, two sections side by side in the view's columns: the memo's header row
 * (Internal only, the file, Open) over its notes, which scroll on their own; then Actions, with Brio's
 * sparkle at the heading's right (Identify action items) and the proposals, editable, under it.
 */
function MemoPane({
    memo,
    storage,
    readOnly,
    cached,
    onLoaded,
    loadContent,
    filesHref,
    openUnavailable,
    findActions,
    apply,
    loadReview,
    dismissReview,
    actOnRaid,
    identifying,
}: {
    memo: MemoListItem
    storage: MemoStorageName | null
    readOnly: boolean
    cached?: MemoContent
    onLoaded: (id: string, content: MemoContent) => void
    loadContent: MemosViewProps['loadContent']
    filesHref?: MemosViewProps['filesHref']
    openUnavailable?: string
    findActions: MemosViewProps['findActions']
    apply: MemosViewProps['apply']
    loadReview?: MemosViewProps['loadReview']
    dismissReview?: MemosViewProps['dismissReview']
    actOnRaid?: MemosViewProps['actOnRaid']
    identifying: boolean
}) {
    const [content, setContent] = useState<PaneContent>(() => (cached ? { status: 'ready', content: cached } : { status: 'loading' }))
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        // A memo read before this visit is shown as read; Try again reads it afresh.
        if (attempt === 0 && cached) return
        const ctrl = new AbortController()
        setContent({ status: 'loading' })
        loadContent(memo, ctrl.signal)
            .then((c) => {
                if (ctrl.signal.aborted) return
                setContent({ status: 'ready', content: c })
                onLoaded(memo.id, c)
            })
            .catch((e: unknown) => {
                if (!ctrl.signal.aborted) setContent({ status: 'error', reason: failureReason(e) })
            })
        return () => ctrl.abort()
        // The pane is keyed by the memo: only Try again asks again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt])

    // Identify action items: one round at a time, in the Action items column.
    const [round, setRound] = useState(0)
    const [busy, setBusy] = useState(false)
    const [found, setFound] = useState<MemoFound | null>(null)
    const [findError, setFindError] = useState<string | null>(null)
    const ctrlRef = useRef<AbortController | null>(null)
    useEffect(() => () => ctrlRef.current?.abort(), [])

    const find = async () => {
        ctrlRef.current?.abort()
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setRound((r) => r + 1)
        setBusy(true)
        setFound(null)
        setFindError(null)
        try {
            const result = await findActions(memo, ctrl.signal)
            if (ctrlRef.current === ctrl) setFound(result)
        } catch (e) {
            if (e instanceof AiAbortedError || ctrl.signal.aborted) return
            setFindError(e instanceof Error && e.message ? e.message : failureReason(e))
        } finally {
            if (ctrlRef.current === ctrl) setBusy(false)
        }
    }

    // What waits on the memo (§13): read on open, when a new memo's action items land, and after actions.
    const [waitingPayload, setWaitingPayload] = useState<MemoReviewPayload | null>(null)
    const [reviewTick, setReviewTick] = useState(0)
    const [actionError, setActionError] = useState<string | null>(null)
    useEffect(() => {
        if (!loadReview || readOnly) return
        const ctrl = new AbortController()
        loadReview(memo, ctrl.signal)
            .then((p) => { if (!ctrl.signal.aborted) setWaitingPayload(p) })
            // Nothing waiting is shown; the sparkle still works.
            .catch(() => undefined)
        return () => ctrl.abort()
        // The pane is keyed by the memo: it asks again only when told to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reviewTick])
    // A memo just added: its action items land a little after the save, so read them when they do.
    const wasIdentifying = useRef(identifying)
    useEffect(() => {
        if (wasIdentifying.current && !identifying) setReviewTick((t) => t + 1)
        wasIdentifying.current = identifying
    }, [identifying])

    const dismiss = () => {
        ctrlRef.current?.abort()
        setFound(null)
        setFindError(null)
        setBusy(false)
        setActionError(null)
        // What waits on the memo goes too, whether Brio found it on its own or by hand.
        setWaitingPayload((p) => (p ? { ...p, review: null } : p))
        dismissReview?.(memo).catch((e: unknown) => {
            setActionError(e instanceof Error && e.message ? e.message : failureReason(e))
            setReviewTick((t) => t + 1)
        })
    }

    const actRaid = async (item: MemoRaidSuggestion, action: 'accept' | 'dismiss') => {
        if (!actOnRaid) return
        setActionError(null)
        try {
            await actOnRaid(memo, item.id, action)
            setWaitingPayload((p) => (p ? { ...p, raid: p.raid.filter((r) => r.id !== item.id) } : p))
        } catch (e) {
            setActionError(e instanceof Error && e.message ? e.message : failureReason(e))
        }
    }

    const webUrl = content.status === 'ready' ? content.content.webUrl : null
    const inFiles = filesHref?.(memo)
    const open = content.status === 'loading' ? null
        : webUrl && storage ? (
            <Button asChild variant="ghost" size="sm">
                <a href={webUrl} target="_blank" rel="noopener noreferrer">Open in {storage}</a>
            </Button>
        ) : inFiles ? (
            <Button asChild variant="ghost" size="sm">
                <a href={inFiles}>Open in Files</a>
            </Button>
        ) : openUnavailable ? (
            <Hint label={openUnavailable} side="bottom">
                <span className="inline-flex">
                    <Button type="button" variant="ghost" size="sm" disabled>Open in {storage ?? 'storage'}</Button>
                </span>
            </Hint>
        ) : null

    const parts = content.status === 'ready' ? splitMemoMarkdown(content.content.text) : null
    const body = parts ? (memo.source === 'transcript' ? boldSpeakers(parts.body) : parts.body) : ''

    const actionsHeadingId = `memo-actions-${memo.id}`
    // What waits on the memo, its quotes filled in from the memo itself (only anchors are stored).
    const memoText = content.status === 'ready' ? content.content.text : null
    const waiting: MemoFound | null = waitingPayload?.review && memoText !== null
        ? { ...resolveMemoReview(waitingPayload.review, memoText), alreadyApplied: waitingPayload.alreadyApplied, engagement: waitingPayload.engagement }
        : null
    const shown = found ?? waiting
    const shownKey = found ? `run-${round}` : `waiting-${waitingPayload?.review?.at ?? ''}`
    const raidItems = waitingPayload?.raid ?? []
    const raidSection = raidItems.length > 0 ? <MemoRaidSuggestions items={raidItems} onAct={actRaid} /> : null

    return (
        <>
            <section
                aria-label="Memo"
                className="flex min-w-0 flex-[999_1_480px] flex-col border-t border-line sm:border-t-0 @[1040px]:min-h-0 @[1040px]:border-r"
            >
                <div className="flex flex-none flex-wrap items-center gap-2 border-b border-line px-6 py-3">
                    <Tag color="gray">Internal only</Tag>
                    <span className="min-w-0 truncate text-small text-fg-muted" title={memo.fileName}>{memo.fileName}</span>
                    <span className="flex-1" />
                    {open}
                </div>

                {/* The notes scroll inside the pane: a 30-minute transcript never pushes the actions away. */}
                <div tabIndex={0} aria-label={`${memo.title}, notes`} className={cn(MEMO_STACKED_MAX_HEIGHT, 'overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/30 @[1040px]:max-h-none @[1040px]:min-h-0 @[1040px]:flex-1')}>
                    {content.status === 'loading' ? (
                        <MemoBodySkeleton />
                    ) : content.status === 'error' ? (
                        <LoadFailed compact what="this memo" reason={content.reason} onRetry={() => setAttempt((a) => a + 1)} />
                    ) : (
                        <article className="flex max-w-[720px] flex-col gap-2.5 px-6 py-5" aria-label={memo.title}>
                            <h3 className="text-h3 text-fg">{parts?.title || memo.title}</h3>
                            {parts?.byline && <p className="text-small text-fg-muted">{parts.byline}</p>}
                            {body.trim()
                                ? <ChatMarkdown content={body} className={MEMO_BODY_CLASS} />
                                : <p className="text-small text-fg-muted">This memo has no notes under its title.</p>}
                        </article>
                    )}
                </div>
            </section>

            {!readOnly && (
                <section
                    aria-labelledby={actionsHeadingId}
                    className="flex min-w-0 basis-full flex-col border-t border-line @[1040px]:min-h-0 @[1040px]:border-t-0"
                >
                    <div className="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5">
                        <h3 id={actionsHeadingId} className="text-ui font-semibold text-fg">Action items</h3>
                        <span className="text-small text-fg-muted">from this memo</span>
                        <span className="flex-1" />
                        <Hint
                            label={
                                <span className="flex flex-col gap-0.5">
                                    <span>Identify action items with <Brio /></span>
                                    <span className="opacity-70">1 credit · reads this memo</span>
                                </span>
                            }
                        >
                            {/* aria-disabled, not disabled, while Brio reads: a disabled button shows no tooltip. */}
                            <button
                                type="button"
                                onClick={() => { if (!busy) void find() }}
                                aria-disabled={busy}
                                aria-label={`Identify action items in ${memo.title}`}
                                className={cn(ICON_BUTTON, busy && 'cursor-default hover:bg-transparent')}
                            >
                                <Sparkles className={cn('h-4 w-4', busy && 'animate-pulse')} style={{ color: BRIO_GREEN }} aria-hidden />
                            </button>
                        </Hint>
                    </div>

                    <div className="@[1040px]:min-h-0 @[1040px]:flex-1 @[1040px]:overflow-y-auto">
                        {busy ? (
                            <div className="flex flex-col gap-2.5 px-4 py-4" aria-busy="true">
                                <LoadingAnnouncement label={`${ASSISTANT.name} is reading the memo`} />
                                <ShimmerBar className="h-3 w-3/5" />
                                <ShimmerBar className="w-full" />
                                <ShimmerBar className="w-[85%]" />
                            </div>
                        ) : findError ? (
                            <div className="flex flex-wrap items-center gap-2 px-4 py-4">
                                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {findError}
                                </p>
                                <Button type="button" variant="ghost" size="sm" onClick={dismiss}>Dismiss</Button>
                            </div>
                        ) : shown ? (
                            <NotesProposalsReview
                                key={shownKey}
                                found={shown}
                                apply={(p, original) => apply(memo, shown, p, original)}
                                onDismiss={dismiss}
                                readOnly={readOnly}
                                footnote={MEMO_PROPOSALS_FOOTNOTE}
                                layout="column"
                                extra={raidSection}
                            />
                        ) : raidSection ? (
                            raidSection
                        ) : identifying ? (
                            <div className="flex flex-col gap-2.5 px-4 py-4" aria-busy="true">
                                <LoadingAnnouncement label={`${ASSISTANT.name} is identifying the action items`} />
                                <p className="text-small text-fg-muted">
                                    <Brio /> is identifying this memo&apos;s action items. They&apos;ll appear here in a moment.
                                </p>
                                <ShimmerBar className="h-3 w-3/5" />
                                <ShimmerBar className="w-full" />
                            </div>
                        ) : (
                            <div className="px-4 py-5 @[1040px]:pt-16">
                                <p className="text-ui text-fg-muted">
                                    <Brio /> reads this memo and suggests reminders, due-date moves and new deliverables.
                                </p>
                                <p className="mt-2 text-small text-fg-muted">
                                    You can edit each one before it&apos;s applied, and nothing changes until you apply it.
                                </p>
                            </div>
                        )}
                        {actionError && (
                            <p className="flex items-start gap-1 px-4 py-2 text-small text-danger" role="alert">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {actionError}
                            </p>
                        )}
                    </div>
                </section>
            )}
        </>
    )
}

/**
 * A memo's RAID suggestions (§13), under its action items: each accepted into the RAID log or dismissed
 * here, through the log's own route. Nothing of the memo's text is kept with them.
 */
function MemoRaidSuggestions({ items, onAct }: { items: MemoRaidSuggestion[]; onAct: (item: MemoRaidSuggestion, action: 'accept' | 'dismiss') => Promise<void> }) {
    const [acting, setActing] = useState<string | null>(null)
    const act = async (item: MemoRaidSuggestion, action: 'accept' | 'dismiss') => {
        setActing(item.id)
        try {
            await onAct(item, action)
        } finally {
            setActing(null)
        }
    }
    return (
        <section aria-label="RAID suggestions" className="border-t border-line px-4 py-3">
            <h4 className="text-ui font-semibold text-fg">RAID suggestions</h4>
            <p className="text-caption font-normal text-fg-muted">
                Risks, Assumptions, Issues and Decisions from this memo. What you accept goes into the RAID log.
            </p>
            <ul className="mt-2 flex flex-col">
                {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 border-t border-line py-2.5 first:border-t-0">
                        <span
                            role="img"
                            aria-label={RAID_TYPE_LABEL[item.type]}
                            title={RAID_TYPE_LABEL[item.type]}
                            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control bg-surface-muted text-caption font-semibold text-fg"
                        >
                            {RAID_TYPE_LETTER[item.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-small text-fg">{item.title}</p>
                            <div className="mt-1.5 flex justify-end gap-1.5">
                                <Button type="button" variant="ghost" size="sm" disabled={acting === item.id} onClick={() => void act(item, 'dismiss')}>
                                    Dismiss
                                </Button>
                                <Button type="button" variant="outline" size="sm" disabled={acting === item.id} onClick={() => void act(item, 'accept')}>
                                    Accept
                                </Button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    )
}

/** Brio's sparkle as an icon button, as on Your brief and the RAID log. */
const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30'

/**
 * A memo's text while it's read from Drive or OneDrive, the slow part of opening one: the heading, the
 * byline and a page of lines, as the memo will sit.
 */
function MemoBodySkeleton() {
    return (
        <div className="flex max-w-[720px] flex-col gap-3 px-6 py-5" aria-busy="true">
            <LoadingAnnouncement label="Loading the memo" />
            <ShimmerBar className="h-4 w-2/5" />
            <ShimmerBar className="h-2 w-1/4" />
            <div className="mt-1 flex flex-col gap-2.5">
                {['w-full', 'w-[94%]', 'w-[88%]', 'w-full', 'w-[72%]', 'w-[90%]', 'w-[60%]'].map((w, i) => (
                    <ShimmerBar key={i} className={w} />
                ))}
            </div>
        </div>
    )
}

/** The memos list while it loads: rows shaped like the loaded ones, beside an empty reading pane. */
function MemosSkeleton() {
    return (
        <div className="flex flex-wrap" aria-busy="true">
            <LoadingAnnouncement label="Loading memos" />
            <div className="w-full max-w-[420px] flex-[1_1_360px] border-r border-line">
                {['w-2/3', 'w-1/2', 'w-3/5'].map((w, i) => (
                    <div key={i} className="flex items-start gap-3 border-b border-line px-4 py-3">
                        <ShimmerBlock className="h-10 w-11 rounded-card" />
                        <div className="flex flex-1 flex-col gap-2 pt-1">
                            <ShimmerBar className={w} />
                            <ShimmerBar className="h-2 w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="min-w-0 flex-[999_1_520px]">
                <MemoBodySkeleton />
            </div>
        </div>
    )
}

