'use client'

// No longer mounted on the Overview: memos moved to Discussions › Memos (engagement-memos.tsx); kept until Deepak signs off.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { useToast } from '@/components/ui/toast'
import {
    FindActionsButton,
    NotesProposalsReview,
    type ApplyOutcome,
} from '@/components/projects/notes-proposals-panel'
import { AddMemoSheet, type AddMemoInput, type AddMemoOutcome } from '@/components/projects/add-memo-sheet'
import {
    MEMO_PROPOSALS_FOOTNOTE,
    MemoDateBlock,
    useEngagementMemos,
    type ApplicableProposal,
    type MemoFound,
} from '@/components/projects/engagement-memos'
import { AiAbortedError } from '@/lib/ai/fetch-timeout'
import { failureReason } from '@/lib/files/action-failure'
import { memoMetaLine, type MemoListItem } from '@/lib/memos/memo-shared'

export { MEMO_PROPOSALS_FOOTNOTE, type ApplicableProposal, type MemoFound }

/**
 * "Internal memos" on the engagement Overview (.claude/plans/brio-features-round-2.md, §8): call and
 * meeting notes kept as one Markdown file each in the engagement's "Internal Memos" folder, internal
 * only. Each row offers Find actions, which has Brio read that memo and propose reminders, due-date
 * moves and new deliverables (the same proposals as the Settings memo), and Open, which opens the file
 * in Files.
 *
 * `InternalMemosView` is the card alone, with what it does passed in, so /tour renders the same card
 * over memos kept in memory (components/demo/demo-internal-memos.tsx). `InternalMemosCard` is the app's.
 */

const DateBlock = MemoDateBlock

export interface InternalMemosViewProps {
    /** Null while loading. */
    memos: MemoListItem[] | null
    loadError?: string | null
    onRetry?: () => void
    /** A completed engagement: listed and opened, nothing added or applied. */
    readOnly: boolean
    /** Where the folder is, as the description says it: "your Drive", "your OneDrive". */
    storagePhrase: string
    /** Why "Add internal memo" is off, when it is (no storage connected). */
    addDisabledReason?: string | null
    onAdd: () => void
    /** Where Open goes: the file in Files. */
    openHref?: (memo: MemoListItem) => string | undefined
    /** Open, when it isn't a link. */
    onOpen?: (memo: MemoListItem) => void
    /** Brio's proposals from one memo. Throws an error carrying the words to show (or an AiAbortedError). */
    findActions: (memo: MemoListItem, signal: AbortSignal) => Promise<MemoFound>
    /** Applies one reminder or due date found in `memo`. */
    apply: (memo: MemoListItem, found: MemoFound, proposal: ApplicableProposal) => Promise<ApplyOutcome>
}

export function InternalMemosView({
    memos,
    loadError,
    onRetry,
    readOnly,
    storagePhrase,
    addDisabledReason,
    onAdd,
    openHref,
    onOpen,
    findActions,
    apply,
}: InternalMemosViewProps) {
    const headingId = useId()
    // One memo's proposals at a time, inline under its row.
    const [active, setActive] = useState<{ memoId: string; round: number } | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [found, setFound] = useState<MemoFound | null>(null)
    const [error, setError] = useState<string | null>(null)
    const ctrlRef = useRef<AbortController | null>(null)
    useEffect(() => () => ctrlRef.current?.abort(), [])

    const find = async (memo: MemoListItem) => {
        ctrlRef.current?.abort()
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setActive((a) => ({ memoId: memo.id, round: (a?.round ?? 0) + 1 }))
        setBusyId(memo.id)
        setFound(null)
        setError(null)
        try {
            const result = await findActions(memo, ctrl.signal)
            if (ctrlRef.current === ctrl) setFound(result)
        } catch (e) {
            if (e instanceof AiAbortedError || ctrl.signal.aborted) return
            setError(e instanceof Error && e.message ? e.message : failureReason(e))
        } finally {
            if (ctrlRef.current === ctrl) setBusyId(null)
        }
    }

    const dismiss = () => {
        ctrlRef.current?.abort()
        setActive(null)
        setFound(null)
        setError(null)
        setBusyId(null)
    }

    return (
        <section aria-labelledby={headingId} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface" data-no-export="">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 id={headingId} className="text-ui font-semibold text-fg">Internal memos</h2>
                        <Tag color="gray">Internal only</Tag>
                    </div>
                    <p className="mt-0.5 text-small text-fg-muted">
                        Call and meeting notes, one file each in “Internal Memos” in {storagePhrase}. Only Leads and Full Access contributors see them.
                    </p>
                </div>
                {readOnly ? (
                    <span className="text-small text-fg-subtle">Read only · completed</span>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onAdd}
                        disabled={!!addDisabledReason || memos === null}
                        title={addDisabledReason ?? undefined}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add internal memo
                    </Button>
                )}
            </div>

            {loadError && memos === null ? (
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <p className="flex items-start gap-1 text-small text-danger" role="alert">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {loadError}
                    </p>
                    {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Try again</Button>}
                </div>
            ) : memos === null ? (
                <p className="px-4 py-3 text-small text-fg-subtle" aria-busy="true">Loading memos…</p>
            ) : memos.length === 0 ? (
                <p className="px-4 py-3 text-small text-fg-muted">
                    {readOnly ? 'No memos were added to this engagement.' : 'No memos yet. Add one after your next call.'}
                </p>
            ) : (
                <ul>
                    {memos.map((memo) => {
                        const isActive = active?.memoId === memo.id
                        const href = openHref?.(memo)
                        return (
                            <li key={memo.id} className="border-t border-line first:border-t-0" data-testid={`memo-${memo.id}`}>
                                <div className="flex items-start gap-3 px-4 py-2.5">
                                    <DateBlock date={memo.date} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-ui font-semibold text-fg">{memo.title}</div>
                                        <div className="text-small text-fg-muted">{memoMetaLine(memo)}</div>
                                        {memo.appliedCount > 0 && (
                                            <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-fg-muted">
                                                <Check className="h-3 w-3" aria-hidden />
                                                {memo.appliedCount} action{memo.appliedCount === 1 ? '' : 's'} applied
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {!readOnly && (
                                            <FindActionsButton
                                                label="Find actions"
                                                busyLabel="Reading…"
                                                aria-label={`Find actions in ${memo.title}`}
                                                busy={busyId === memo.id}
                                                onClick={() => void find(memo)}
                                            />
                                        )}
                                        {href ? (
                                            <Button asChild variant="ghost" size="sm">
                                                <a href={href} aria-label={`Open ${memo.title}`}>Open</a>
                                            </Button>
                                        ) : (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => onOpen?.(memo)} disabled={!onOpen} aria-label={`Open ${memo.title}`}>
                                                Open
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {isActive && (error || (found && busyId !== memo.id)) && (
                                    <div className="px-4 pb-3 sm:pl-[68px]">
                                        {error ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                                    {error}
                                                </p>
                                                <Button type="button" variant="ghost" size="sm" onClick={dismiss}>Dismiss</Button>
                                            </div>
                                        ) : found ? (
                                            <NotesProposalsReview
                                                key={active.round}
                                                found={found}
                                                apply={(p) => apply(memo, found, p)}
                                                onDismiss={dismiss}
                                                readOnly={readOnly}
                                                footnote={MEMO_PROPOSALS_FOOTNOTE}
                                            />
                                        ) : null}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}

// ── The app's card ────────────────────────────────────────────────────────────────────────────

/**
 * The Overview card. Leads and Full Access contributors only: it renders nothing for anyone else and
 * asks for nothing (the route refuses them too).
 */
export function InternalMemosCard({ projectId, isInternalViewer, engagementBase }: {
    projectId: string
    /** From the Overview's payload: false for Limited Access contributors and Reviewers. */
    isInternalViewer: boolean
    /** The engagement's path, for Open (its Files tab). */
    engagementBase: string
}) {
    if (!isInternalViewer) return null
    return <EngagementMemos projectId={projectId} engagementBase={engagementBase} />
}

function EngagementMemos({ projectId, engagementBase }: { projectId: string; engagementBase: string }) {
    const { addToast } = useToast()
    const m = useEngagementMemos(projectId)
    const [adding, setAdding] = useState(false)

    const openHref = useCallback(
        (memo: MemoListItem) => (engagementBase ? `${engagementBase}/files#doc-file:${memo.id}` : undefined),
        [engagementBase],
    )

    const save = async (input: AddMemoInput): Promise<AddMemoOutcome> => {
        const out = await m.save(input)
        if (!out.ok) return out
        const href = openHref(out.memo)
        addToast({
            type: out.warning ? 'warning' : 'success',
            title: 'Memo saved',
            message: out.warning ?? `Saved as ${out.fileName} in Internal Memos.`,
            ...(href ? { action: { label: 'Open', onClick: () => window.location.assign(href) } } : {}),
        })
        return { ok: true }
    }

    const storagePhrase = m.storage === 'OneDrive' ? 'your OneDrive' : 'your Drive'

    return (
        <>
            <InternalMemosView
                memos={m.memos}
                loadError={m.loadError}
                onRetry={m.reload}
                readOnly={m.readOnly}
                storagePhrase={storagePhrase}
                addDisabledReason={m.memos !== null && !m.storage ? 'Connect Google Drive or OneDrive for this client to add memos.' : null}
                onAdd={() => setAdding(true)}
                openHref={openHref}
                findActions={m.findActions}
                apply={m.apply}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
            {m.dueDialog}
        </>
    )
}
