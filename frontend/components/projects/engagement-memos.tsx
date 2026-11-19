'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InternalOnlyTag } from '@/components/ui/internal-only-tag'
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WindowGlyph } from '@/components/ui/window-glyph'
import { LoadFailed } from '@/components/ui/load-failed'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { useToast } from '@/components/ui/toast'
import {
    NotesProposalsReview,
    proposalsFailureMessage,
    useApplyNotesProposal,
    type AcceptSelected,
    type ApplyOutcome,
    type NotesEngagementRef,
    type NotesProposalsFound,
} from '@/components/projects/notes-proposals-panel'
import { MEMO_COLUMN_HEAD, MemoBrioPanel, type MemoBrioTab, type MemoSuggestionChanges } from '@/components/projects/memo-brio-panel'
import { BRIO_PROPOSALS_FAILED } from '@/lib/ai/brio-failure'
import { AddMemoSheet, type AddMemoInput, type AddMemoOutcome, type EditMemoContext, type MemoEditInput } from '@/components/projects/add-memo-sheet'
import { DiscussionsBarPortal } from '@/components/projects/discussions-switch'
import { AiAbortedError, fetchWithTimeout } from '@/lib/ai/fetch-timeout'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { cn } from '@/lib/utils'
import {
    appliedLabelOf,
    appliedTargetOf,
    boldSpeakers,
    byNewestMemo,
    memoBodyHash,
    memoMetaLine,
    resolveMemoReview,
    splitMemoMarkdown,
    type MemoListItem,
    type MemoRaidSuggestion,
    type MemoReviewPayload,
} from '@/lib/memos/memo-shared'
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

export const MEMO_PROPOSALS_FOOTNOTE = 'Accepted action items note this memo, so identifying them again shows them as done.'

/** Where the memos are kept, as the memos route names it. */
export type MemoStorageName = 'Google Drive' | 'OneDrive'

/** A memo as the pane shows it: its file's Markdown, and the link that opens it in storage when there is one. */
export interface MemoContent {
    text: string
    webUrl: string | null
}

/**
 * "Nov" over "12": the day of the call, drawn as a desk calendar (Deepak, 2026-11-14): the month in white
 * on the app's red, the day in black on gray. The same font and sizes as before. Spans, so it can sit
 * inside a row's button.
 */
export function MemoDateBlock({ date }: { date: string }) {
    const d = new Date(`${date}T00:00:00Z`)
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    return (
        <span
            className="flex w-10 shrink-0 flex-col items-stretch overflow-hidden rounded-control leading-none"
            title={d.getUTCFullYear() === new Date().getFullYear() ? undefined : label}
            aria-label={label}
            role="img"
        >
            {/* The red runs to the edge; only the gray part has a border (a ring round the red read as a white rim). */}
            <span className="bg-danger py-0.5 text-center text-[11px] font-medium text-white">{month}</span>
            <span className="rounded-b-control border border-t-0 border-line bg-surface-muted py-1 text-center text-ui font-semibold tabular-nums text-fg">{d.getUTCDate()}</span>
        </span>
    )
}

const appliedLine = (n: number) => `${n} action item${n === 1 ? '' : 's'} accepted`

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
    // Memos saved or edited here whose action items (§13) are still being identified: the list is read again
    // every few seconds while the tab is visible, until each has a review newer than `after` (the one it had
    // when saved; none for a new memo) or three minutes have passed.
    const [awaiting, setAwaiting] = useState<{ id: string; after: string | null }[]>([])
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
                setAwaiting((waits) => waits.filter((w) => {
                    const reviewedAt = list.find((m) => m.id === w.id)?.reviewedAt ?? null
                    return !reviewedAt || reviewedAt === w.after
                }))
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
            setAwaiting((waits) => [...waits, { id: memo.id, after: null }])
            return { ok: true, memo, fileName: out.data.fileName, ...(out.warning ? { warning: out.warning } : {}) }
        } catch (e) {
            return { ok: false, error: failureReason(e) }
        }
    }, [projectId])

    /** Edits a memo (§14.3): renamed and rewritten in storage; new notes read again when asked. */
    const edit = useCallback(async (memo: MemoListItem, input: MemoEditInput): Promise<MemoSaveOutcome> => {
        try {
            const res = await fetch(`/api/projects/${projectId}/memos/${memo.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            })
            if (!res.ok) throw await failureFrom(res)
            const out = await res.json() as { data: { memo: MemoListItem; fileName: string; identifying: boolean }; warning?: string }
            const saved = out.data.memo
            setMemos((list) => (list ?? []).map((m) => (m.id === saved.id ? saved : m)).sort(byNewestMemo))
            if (out.data.identifying) {
                setAwaiting((waits) => [...waits.filter((w) => w.id !== saved.id), { id: saved.id, after: saved.reviewedAt }])
            }
            return { ok: true, memo: saved, fileName: out.data.fileName, ...(out.warning ? { warning: out.warning } : {}) }
        } catch (e) {
            return { ok: false, error: failureReason(e) }
        }
    }, [projectId])

    /**
     * Reads a memo with Brio by hand (the sparkle): its minutes and RAID suggestions, which then wait on it
     * (2 credits, the person's). Throws an error carrying the words to show (or an AiAbortedError).
     */
    const readMemo = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<void> => {
        try {
            const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-notes-proposals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memoDocumentId: memo.id }),
            }, MEMO_READ_TIMEOUT_MS, signal)
            const body = await res.json().catch(() => null) as { data?: unknown; error?: string } | null
            if (!res.ok || !body?.data) throw new Error(body?.error || BRIO_PROPOSALS_FAILED)
            // What waits on the memo changed with it.
            setTick((t) => t + 1)
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

    /**
     * Accepts or dismisses one of the memo's RAID suggestions, through the RAID log's own route: accepted
     * with what the person changed on it (its type, title, due date or priority).
     */
    const actOnRaid = useCallback(async (_memo: MemoListItem, itemId: string, action: 'accept' | 'dismiss', changes: MemoSuggestionChanges = {}): Promise<void> => {
        const res = await fetch(`/api/projects/${projectId}/raid/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...(action === 'accept' ? changes : {}) }),
        })
        if (!res.ok) throw await failureFrom(res)
        setTick((t) => t + 1)
    }, [projectId])

    const identifyingIds = useMemo(() => awaiting.map((w) => w.id), [awaiting])

    return {
        memos, readOnly, storage, loadError, reload, save, edit, readMemo, apply, dueDialog,
        loadReview, dismissReview, actOnRaid, identifyingIds,
    }
}

/** A memo's read waits for two model calls side by side, inside the route's 90 seconds. */
const MEMO_READ_TIMEOUT_MS = 88_000

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
    // The memo being edited, and a fresh sheet for each opening.
    const [editing, setEditing] = useState<{ memo: MemoListItem; context: MemoEditOpening; key: number } | null>(null)
    const [editOpen, setEditOpen] = useState(false)

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

    const startEdit = (memo: MemoListItem, context: MemoEditOpening) => {
        setEditing((prev) => ({ memo, context, key: (prev?.key ?? 0) + 1 }))
        setEditOpen(true)
    }

    const saveEdit = async (memo: MemoListItem, input: MemoEditInput): Promise<AddMemoOutcome> => {
        const out = await m.edit(memo, input)
        if (!out.ok) return out
        addToast({
            type: out.warning ? 'warning' : 'success',
            title: 'Memo saved',
            message: out.warning ?? (out.fileName !== memo.fileName ? `Renamed to ${out.fileName} in Internal Memos.` : 'Your changes are in Internal Memos.'),
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
                readMemo={m.readMemo}
                apply={m.apply}
                loadReview={m.loadReview}
                dismissReview={m.dismissReview}
                actOnRaid={m.actOnRaid}
                identifyingIds={m.identifyingIds}
                onEdit={startEdit}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
            {editing && (
                <AddMemoSheet
                    key={editing.key}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    edit={{ ...editing.context, onSave: (input) => saveEdit(editing.memo, input) }}
                />
            )}
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
    /**
     * Reads one memo with Brio (the sparkle): its minutes and RAID suggestions, which then wait on it.
     * Throws an error carrying the words to show (or an AiAbortedError).
     */
    readMemo: (memo: MemoListItem, signal: AbortSignal) => Promise<void>
    /**
     * Applies one reminder or due date found in `memo`: `proposal` as the person edited it, `original`
     * as Brio found it (what the memo records as applied).
     */
    apply: (memo: MemoListItem, found: MemoFound, proposal: ApplicableProposal, original?: ApplicableProposal) => Promise<ApplyOutcome>
    /** What waits on a memo: its minutes and RAID suggestions (and older action items). Absent: nothing waits. */
    loadReview?: (memo: MemoListItem, signal: AbortSignal) => Promise<MemoReviewPayload>
    /** Dismiss all: the memo's suggestions no longer wait. Throws an error carrying the words to show. */
    dismissReview?: (memo: MemoListItem) => Promise<void>
    /**
     * Accepts or dismisses one of the memo's RAID suggestions, accepted with what the person changed on it.
     * Throws an error carrying the words to show.
     */
    actOnRaid?: (memo: MemoListItem, itemId: string, action: 'accept' | 'dismiss', changes?: MemoSuggestionChanges) => Promise<void>
    /** Memos whose action items are being identified right now (just added, or edited). */
    identifyingIds?: readonly string[]
    /**
     * Opens the Edit sheet (§14.3) for a memo, with what the pane knows: its notes as read, what waits on
     * it, and what was applied. `onSave` is the caller's. Absent: no Edit.
     */
    onEdit?: (memo: MemoListItem, context: MemoEditOpening) => void
    /**
     * Brio's panel opens on this tab: /tour's steps show Summary, then RAID (`brio=`). Changing it opens
     * the panel afresh on the new tab. Absent: RAID while suggestions wait, else Summary.
     */
    brioTab?: MemoBrioTab | null
}

/** When the memo pane opens the edit sheet: everything but where the edit is saved. */
export type MemoEditOpening = Omit<EditMemoContext, 'onSave'>

/**
 * The list, the memo and Brio's panel. From 1040 px wide (the view, not the window): three columns as tall
 * as the window has room for below the page's header (Deepak, 2026-11-15; they were a fixed 480 px), each
 * scrolling on its own, so a 30-minute transcript scrolls inside the memo while the list and the panel
 * stay beside it. Narrower, they stack, and the memo keeps a short height.
 *
 * While someone works in Brio's panel, the list folds to a rail of date blocks (`collapsed`), and the
 * panel takes the room: 440 to 560 px instead of 300 to 360. The columns slide between the two, rather
 * than jump (Deepak, 2026-11-15).
 */
// Written out whole: Tailwind only builds classes it can read in the source.
const MEMO_COLUMNS_HEIGHT = '@[1040px]:h-[calc(100dvh-17rem)] @[1040px]:min-h-[480px]'
const MEMO_STACKED_MAX_HEIGHT = 'max-h-[480px]'
/** The fold's pace, the sidebar's own (demo-shell.tsx): the titles fading as the list narrows. */
const FOLD_EASE = 'duration-ui-base ease-ui-out motion-reduce:transition-none'

function MemosColumns({ withActions, collapsed = false, children }: { withActions: boolean; collapsed?: boolean; children: ReactNode }) {
    return (
        <div className="@container">
            <div
                data-collapsed={collapsed ? 'true' : undefined}
                className={cn(
                    // The bottom edge closes the columns, so their dividers don't just stop.
                    'flex flex-wrap border-b border-line @[1040px]:grid',
                    // In the same container query as the grid: an unscoped pace loses to the transition's default.
                    '@[1040px]:transition-[grid-template-columns] @[1040px]:duration-ui-base @[1040px]:ease-ui-out @[1040px]:motion-reduce:transition-none',
                    MEMO_COLUMNS_HEIGHT,
                    !withActions
                        ? '@[1040px]:grid-cols-[260px_minmax(0,1fr)]'
                        : collapsed
                            ? '@[1040px]:grid-cols-[64px_minmax(0,1fr)_minmax(440px,560px)]'
                            : '@[1040px]:grid-cols-[260px_minmax(0,1fr)_minmax(300px,360px)]',
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
    readMemo,
    apply,
    loadReview,
    dismissReview,
    actOnRaid,
    identifyingIds,
    onEdit,
    brioTab,
}: MemosViewProps) {
    const [query, setQuery] = useState('')
    // While someone works in Brio's panel, the list folds to a rail of date blocks and the panel takes the room.
    // Once they fold or open it themselves, it stays as they left it.
    const [collapsed, setCollapsed] = useState(false)
    const [foldChosen, setFoldChosen] = useState(false)
    // Files read this visit, so going back to a memo doesn't read it again. Never stored anywhere else.
    // Kept by the memo and its last edit: an edited memo is read afresh.
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
                        data-demo-tour="memos-add"
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
                    <MemosColumns withActions={!readOnly} collapsed={collapsed && !readOnly}>
                        <MemoList
                            memos={shown}
                            query={query}
                            selectedId={selected?.id ?? null}
                            onSelect={onSelect}
                            storage={storage}
                            foldable={!readOnly}
                            collapsed={collapsed && !readOnly}
                            onFold={() => { setFoldChosen(true); setCollapsed((c) => !c) }}
                        />
                        {selected && (
                            <MemoPane
                                key={memoContentKey(selected)}
                                memo={selected}
                                storage={storage}
                                readOnly={readOnly}
                                cached={contents[memoContentKey(selected)]}
                                onLoaded={remember}
                                loadContent={loadContent}
                                filesHref={filesHref}
                                openUnavailable={openUnavailable}
                                readMemo={readMemo}
                                apply={apply}
                                loadReview={loadReview}
                                dismissReview={dismissReview}
                                actOnRaid={actOnRaid}
                                identifying={!!identifyingIds?.includes(selected.id)}
                                onEdit={onEdit ? (context) => onEdit(selected, { ...context, storage, canIdentify: true }) : undefined}
                                onEngage={() => { if (!foldChosen) setCollapsed(true) }}
                                brioTab={brioTab}
                            />
                        )}
                    </MemosColumns>
                )}
            </div>
        </>
    )
}

/**
 * The memo list, one column at every width of the fold (Deepak, 2026-11-15). Open, each row is a memo's
 * date block, title, author and what waits on it. Folded, while someone works in Brio's panel, it narrows
 * to a rail of date blocks: the titles fade and slide under the edge as the column narrows, rather than
 * one list swapping for another, and a small count shows what waits; the title shows on hover.
 *
 * The button in its header folds and opens it, with the window glyph the sidebar uses for the same
 * (filled while the list shows, its edge only once folded). Wide views only: narrower, the list stacks
 * above the memo and doesn't fold.
 */
function MemoList({ memos, query, selectedId, onSelect, storage, foldable, collapsed, onFold }: {
    memos: MemoListItem[]
    query: string
    selectedId: string | null
    onSelect: (memoId: string) => void
    storage: MemoStorageName | null
    /** There's a Brio panel to make room for: a completed engagement's list never folds. */
    foldable: boolean
    collapsed: boolean
    onFold: () => void
}) {
    const foldLabel = collapsed ? 'Expand memo list' : 'Collapse memo list'
    // What the rail hides fades as the column narrows; wide views only.
    const fades = cn('transition-opacity', FOLD_EASE, collapsed && '@[1040px]:opacity-0')
    return (
        <section
            aria-label="Memos"
            data-testid="memo-list"
            data-collapsed={collapsed ? 'true' : undefined}
            className="flex min-w-0 flex-[1_1_320px] flex-col border-line sm:max-w-[420px] sm:border-r @[1040px]:min-h-0 @[1040px]:max-w-none @[1040px]:overflow-hidden"
        >
            {foldable && (
                // As tall as the memo's header beside it (py-3 round a 28 px button), so the three columns
                // share one header line. The button keeps 18 px from the right: centered on the rail.
                <div className={cn('relative hidden flex-none items-center justify-end overflow-hidden border-b border-line pr-[18px] @[1040px]:flex', MEMO_COLUMN_HEAD)}>
                    <span aria-hidden className={cn('pointer-events-none absolute left-3 whitespace-nowrap text-small text-fg-muted', fades)}>
                        {memos.length} memo{memos.length === 1 ? '' : 's'}
                    </span>
                    <Hint label={foldLabel} side="bottom">
                        <button
                            type="button"
                            onClick={onFold}
                            aria-label={foldLabel}
                            aria-expanded={!collapsed}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                        >
                            <WindowGlyph variant="left" filled={!collapsed} />
                        </button>
                    </Hint>
                </div>
            )}
            <div className="@[1040px]:min-h-0 @[1040px]:flex-1 @[1040px]:overflow-y-auto @[1040px]:overflow-x-hidden">
                {memos.length === 0 ? (
                    <p className={cn('border-b border-line px-4 py-3 text-small text-fg-muted @[1040px]:w-[259px] @[1040px]:px-3', fades)}>
                        No memos match “{query.trim()}”.
                    </p>
                ) : (
                    <ul>
                        {memos.map((memo) => {
                            const isSelected = memo.id === selectedId
                            const hint = [memo.title, memoMetaLine(memo), memo.toReview > 0 ? `${memo.toReview} to review` : null].filter(Boolean).join(' · ')
                            return (
                                <li key={memo.id}>
                                    <FoldedHint label={hint} active={collapsed}>
                                        <button
                                            type="button"
                                            onClick={() => onSelect(memo.id)}
                                            aria-current={isSelected ? 'true' : undefined}
                                            data-testid={`memo-row-${memo.id}`}
                                            className={cn(
                                                // 12 px each side on wide views: the 40 px date block sits centered on the 64 px rail.
                                                'flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors @[1040px]:px-3',
                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/30',
                                                isSelected ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                                            )}
                                        >
                                            <span className="relative flex-none">
                                                <MemoDateBlock date={memo.date} />
                                                {foldable && memo.toReview > 0 && (
                                                    // Out of the flow, under the date block, so folding never moves a row.
                                                    <span
                                                        aria-hidden
                                                        className={cn(
                                                            'absolute left-1/2 top-full mt-1 hidden h-4 min-w-4 -translate-x-1/2 items-center justify-center rounded-full bg-fg px-1 text-[10px] font-semibold tabular-nums leading-none text-surface @[1040px]:inline-flex',
                                                            'transition-opacity', FOLD_EASE,
                                                            collapsed ? 'opacity-100' : 'opacity-0',
                                                        )}
                                                    >
                                                        {memo.toReview}
                                                    </span>
                                                )}
                                            </span>
                                            {/* A fixed width on wide views (the 260 px column less its border, padding and date block): the words slide under the edge instead of rewrapping. */}
                                            <span className={cn('min-w-0 flex-1 @[1040px]:w-[183px] @[1040px]:flex-none', fades)}>
                                                <span className="block truncate text-ui font-semibold text-fg">{memo.title}</span>
                                                <span className="block truncate text-small text-fg-muted">{memoMetaLine(memo)}{memo.edited ? ' · edited' : ''}</span>
                                                {memo.toReview > 0 ? (
                                                    <span className="mt-0.5 block text-caption font-medium text-fg">{memo.toReview} to review</span>
                                                ) : memo.appliedCount > 0 && (
                                                    <span className="mt-0.5 block text-caption font-normal text-fg-muted">{appliedLine(memo.appliedCount)}</span>
                                                )}
                                            </span>
                                        </button>
                                    </FoldedHint>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {storage && (
                    <p className={cn('px-4 py-3 text-small text-fg-muted @[1040px]:w-[259px] @[1040px]:px-3', fades)}>
                        Each memo is a Markdown file in “Internal Memos” in your {storage}.
                    </p>
                )}
            </div>
        </section>
    )
}

/**
 * A rail row's title on hover, only while the list is folded. Always the same tooltip, opened or not,
 * so folding never remounts the row (a remount would skip the fade).
 */
function FoldedHint({ label, active, children }: { label: string; active: boolean; children: ReactElement }) {
    const [open, setOpen] = useState(false)
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip open={active && open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/** A memo's read text is kept by the memo and its last edit, so an edit reads it afresh. */
const memoContentKey = (memo: MemoListItem) => `${memo.id}:${memo.edited?.at ?? ''}`

/** "Nov 14": the day of an edit, as the pane says it. */
const editDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

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
 * The open memo and Brio's panel, two sections side by side in the view's columns: the memo's header row
 * (Internal only, the file, Open) over its notes, which scroll on their own; then Brio's panel
 * (components/projects/memo-brio-panel.tsx), its Summary and RAID tabs with the sparkle at their right.
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
    readMemo,
    apply,
    loadReview,
    dismissReview,
    actOnRaid,
    identifying,
    onEdit,
    onEngage,
    brioTab,
}: {
    memo: MemoListItem
    storage: MemoStorageName | null
    readOnly: boolean
    cached?: MemoContent
    onLoaded: (key: string, content: MemoContent) => void
    loadContent: MemosViewProps['loadContent']
    filesHref?: MemosViewProps['filesHref']
    openUnavailable?: string
    readMemo: MemosViewProps['readMemo']
    apply: MemosViewProps['apply']
    loadReview?: MemosViewProps['loadReview']
    dismissReview?: MemosViewProps['dismissReview']
    actOnRaid?: MemosViewProps['actOnRaid']
    identifying: boolean
    onEdit?: (context: Omit<EditMemoContext, 'onSave' | 'storage' | 'canIdentify'>) => void
    /** Someone is working in Brio's panel: the memo list makes room. */
    onEngage?: () => void
    brioTab?: MemoBrioTab | null
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
                onLoaded(memoContentKey(memo), c)
            })
            .catch((e: unknown) => {
                if (!ctrl.signal.aborted) setContent({ status: 'error', reason: failureReason(e) })
            })
        return () => ctrl.abort()
        // The pane is keyed by the memo: only Try again asks again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt])

    // Read the memo with Brio (the sparkle): one read at a time; what it writes then waits on the memo.
    const [busy, setBusy] = useState(false)
    const [findError, setFindError] = useState<string | null>(null)
    const ctrlRef = useRef<AbortController | null>(null)
    useEffect(() => () => ctrlRef.current?.abort(), [])

    const find = async () => {
        ctrlRef.current?.abort()
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setBusy(true)
        setFindError(null)
        onEngage?.()
        try {
            await readMemo(memo, ctrl.signal)
            if (ctrlRef.current === ctrl) setReviewTick((t) => t + 1)
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
        setFindError(null)
        setBusy(false)
        setActionError(null)
        // What waits on the memo goes: its suggestions, and any older action items. The minutes stay.
        setWaitingPayload((p) => (p ? { ...p, review: p.review ? { ...p.review, dismissed: true } : null, raid: [] } : p))
        dismissReview?.(memo).catch((e: unknown) => {
            setActionError(e instanceof Error && e.message ? e.message : failureReason(e))
            setReviewTick((t) => t + 1)
        })
    }

    /** Accepts one suggestion with what the person changed; it leaves the list, and an Action joins the minutes. */
    const acceptSuggestion = async (item: MemoRaidSuggestion, changes: MemoSuggestionChanges) => {
        if (!actOnRaid) return
        setActionError(null)
        await actOnRaid(memo, item.id, 'accept', changes)
        setWaitingPayload((p) => {
            if (!p) return p
            const type = changes.type ?? item.type
            return {
                ...p,
                raid: p.raid.filter((r) => r.id !== item.id),
                acceptedActions: type === 'ACTION'
                    ? [...(p.acceptedActions ?? []), { id: item.id, title: changes.title ?? item.title, dueDate: changes.dueDate ?? item.dueDate, followUp: item.followUp }]
                    : p.acceptedActions,
            }
        })
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

    // What waits on the memo, its quotes filled in from the memo itself (only anchors are stored).
    const memoText = content.status === 'ready' ? content.content.text : null
    const review = waitingPayload?.review ?? null
    // Action items from a read before minutes and RAID Actions (2026-11-15), still waiting on an older memo.
    const legacy: MemoFound | null = review && review.proposals.length > 0 && memoText !== null
        ? {
            ...resolveMemoReview(review, memoText),
            alreadyApplied: waitingPayload!.alreadyApplied,
            appliedOn: waitingPayload!.appliedOn,
            engagement: waitingPayload!.engagement,
        }
        : null
    // What's selected among them, for the panel's one "Accept N selected".
    const [legacySelected, setLegacySelected] = useState<AcceptSelected | null>(null)
    // Its notes changed since Brio read them: edited here (and not read again), or in storage.
    const changedInStorage = !!review?.bodyHash && memoText !== null && memoBodyHash(memoText) !== review.bodyHash
    const changedSinceRead = (memo.changedSinceRead || changedInStorage) && !busy && !identifying

    const openEdit = () => {
        if (!onEdit || memoText === null) return
        const appliedIds = new Set(waitingPayload?.alreadyApplied ?? [])
        onEdit({
            memo,
            body: splitMemoMarkdown(memoText).body,
            waiting: {
                actionItems: review ? review.proposals.filter((p) => !appliedIds.has(p.id)).length : 0,
                raid: waitingPayload?.raid.length ?? 0,
                minutes: !!waitingPayload?.minutes,
            },
            applied: waitingPayload?.applied ?? [],
        })
    }

    return (
        <>
            <section
                aria-label="Memo"
                className="flex min-w-0 flex-[999_1_480px] flex-col border-t border-line sm:border-t-0 @[1040px]:min-h-0 @[1040px]:border-r"
            >
                <div className={cn('flex flex-none flex-wrap items-center gap-2 border-b border-line px-6 py-3 @[1040px]:flex-nowrap @[1040px]:py-0', MEMO_COLUMN_HEAD)}>
                    <InternalOnlyTag />
                    <span className="min-w-0 truncate text-small text-fg-muted" title={memo.fileName}>{memo.fileName}</span>
                    <span className="flex-1" />
                    {onEdit && !readOnly && (
                        <Button type="button" variant="outline" size="sm" onClick={openEdit} disabled={content.status !== 'ready'}>
                            Edit
                        </Button>
                    )}
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
                            {(parts?.byline || memo.edited) && (
                                <p className="text-small text-fg-muted">
                                    {[parts?.byline, memo.edited ? `Edited ${editDay(memo.edited.at)}${memo.edited.byName ? ` by ${memo.edited.byName}` : ''}` : null].filter(Boolean).join(' · ')}
                                </p>
                            )}
                            {body.trim()
                                ? <ChatMarkdown content={body} className={MEMO_BODY_CLASS} />
                                : <p className="text-small text-fg-muted">This memo has no notes under its title.</p>}
                        </article>
                    )}
                </div>
            </section>

            {!readOnly && (
                <MemoBrioPanel
                    key={brioTab ?? 'auto'}
                    initialTab={brioTab ?? undefined}
                    memo={memo}
                    memoText={memoText}
                    payload={waitingPayload}
                    readOnly={readOnly}
                    reading={busy ? 'sparkle' : identifying ? 'added' : null}
                    readError={findError}
                    actionError={actionError}
                    changedSinceRead={changedSinceRead}
                    onRead={() => void find()}
                    onAccept={acceptSuggestion}
                    onDismissAll={dismiss}
                    onEngage={onEngage}
                    legacySelected={legacy ? legacySelected : null}
                    legacy={legacy ? (
                        <div className="border-t border-line">
                            <p className="px-5 pt-4 text-caption font-medium text-fg-muted">Action items from an earlier read</p>
                            <NotesProposalsReview
                                key={`legacy-${review?.at ?? ''}`}
                                found={legacy}
                                apply={(p, original) => apply(memo, legacy, p, original)}
                                onDismiss={dismiss}
                                readOnly={readOnly}
                                footnote={MEMO_PROPOSALS_FOOTNOTE}
                                layout="column"
                                onSelectedChange={setLegacySelected}
                            />
                        </div>
                    ) : undefined}
                />
            )}
        </>
    )
}


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

