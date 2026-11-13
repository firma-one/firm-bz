'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tag } from '@/components/ui/tag'
import { Brio } from '@/components/ui/brio'
import { useDueDateSave } from '@/components/files/use-due-date-save'
import { createManualReminder } from '@/lib/actions/user-reminders'
import { failureReason } from '@/lib/files/action-failure'
import { AI_TIMEOUT_MS, AiAbortedError, AiTimeoutError, fetchWithTimeout } from '@/lib/ai/fetch-timeout'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { BRIO_PROPOSALS_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY, brioFailureReason } from '@/lib/ai/brio-failure'
import type { DeliverableProposal, NotesProposal, SkippedLine } from '@/lib/ai/notes-proposals'

/**
 * "Find actions in these notes" (.claude/plans/brio-features-round-2.md, §3.5): Brio reads the
 * internal memo and proposes reminders, due-date moves and new deliverables, each under the line of
 * the notes that asked for it.
 *
 * Nothing applies itself. A reminder or a due date is applied one by one or with "Apply N selected",
 * through the same actions a person uses by hand (createManualReminder; the due-date route via
 * useDueDateSave, which asks when a date would break the due-date rule). A new deliverable is new
 * scope and the Lead's call: it is never selected, and its button only opens its creation. Proposals
 * are not stored; dismissing them, or leaving the page, is the end of them.
 *
 * `NotesProposalsReview` is the list alone, with `apply` passed in, so /tour renders the same rows
 * over canned proposals (components/demo/demo-engagement-settings.tsx).
 */

// ── Shared pieces ─────────────────────────────────────────────────────────────────────────────

export interface NotesProposalsFound {
    proposals: NotesProposal[]
    skipped: SkippedLine[]
    /** Proposals Brio returned that didn't hold up against the notes or the Board. */
    dropped: number
    /** From an internal memo: proposals already applied from it, shown as done and not selected. */
    alreadyApplied?: string[]
}

/** What an apply came to. `cancelled`: the person closed a question it asked, so nothing changed. */
export type ApplyOutcome =
    | { ok: true; warning?: string }
    | { ok: false; error: string }
    | { ok: false; cancelled: true }

type RowState =
    | { status: 'idle' }
    | { status: 'applying' }
    | { status: 'applied'; note: string }
    | { status: 'failed'; error: string }

const KIND_LABEL: Record<NotesProposal['kind'], string> = {
    reminder: 'Reminder for you',
    dueDate: 'Due date',
    deliverable: 'New deliverable',
}

const APPLIED_NOTE: Record<NotesProposal['kind'], string> = {
    reminder: 'Reminder added',
    dueDate: 'Due date moved',
    deliverable: 'Opened',
}

/** A proposal's day, as the app writes dates: "Mon, Nov 16", with the year only when it isn't this one. */
export function formatProposalDay(day: string, { weekday = false, now = new Date() }: { weekday?: boolean; now?: Date } = {}): string {
    const d = new Date(`${day}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return day
    return d.toLocaleDateString('en-US', {
        ...(weekday ? { weekday: 'short' as const } : {}),
        month: 'short',
        day: 'numeric',
        ...(d.getUTCFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
        timeZone: 'UTC',
    })
}

/** The person's own calendar day, so "end of next week" is counted from their week. */
function localDay(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** "Couldn't add the reminder. Your session has ended…", unless the reason already says it couldn't. */
function withLead(lead: string, reason: string): string {
    return /^couldn['’]?t\b/i.test(reason) ? reason : `${lead} ${reason}`
}

/** The model writes "has no date"; a sentence of its own would read "Has no date". */
function clause(reason: string): string {
    return /^[A-Z][a-z]/.test(reason) ? reason[0].toLowerCase() + reason.slice(1) : reason
}

const selectable = (p: NotesProposal) => p.kind !== 'deliverable'

/** The change itself, in bold, then its date. */
function ProposalChange({ proposal }: { proposal: NotesProposal }) {
    switch (proposal.kind) {
        case 'reminder':
            return <><strong className="font-semibold text-fg">{proposal.title}</strong> · {formatProposalDay(proposal.date, { weekday: true })}</>
        case 'dueDate':
            return (
                <>
                    <strong className="font-semibold text-fg">{proposal.docId ? `${proposal.docId} · ${proposal.deliverableName}` : proposal.deliverableName}</strong>
                    {' · '}
                    {proposal.currentDate ? formatProposalDay(proposal.currentDate) : 'No due date'} → {formatProposalDay(proposal.newDate)}
                </>
            )
        case 'deliverable':
            return (
                <>
                    <strong className="font-semibold text-fg">{proposal.name}</strong>
                    {proposal.dueDate ? ` · due ${formatProposalDay(proposal.dueDate)}` : ''}
                </>
            )
    }
}

// ── The list ──────────────────────────────────────────────────────────────────────────────────

export interface NotesProposalsReviewProps {
    found: NotesProposalsFound
    /** Applies one reminder or due date. Never called for a new deliverable. */
    apply: (proposal: Exclude<NotesProposal, DeliverableProposal>) => Promise<ApplyOutcome>
    /**
     * Opens creation of a new deliverable, filled in. Absent while the app has no such flow: the row
     * then offers to copy the name and says where deliverables are made.
     */
    openDeliverable?: (proposal: DeliverableProposal) => void
    onDismiss: () => void
    /** A completed engagement, or a role that can't apply: the rows show, nothing applies. */
    readOnly?: boolean
    /** A line under the list, beside Dismiss: where the proposals came from, what applying records. */
    footnote?: React.ReactNode
}

/** What a proposal applied from this memo before shows instead of Apply. */
const APPLIED_BEFORE = 'Applied earlier from this memo'

export function NotesProposalsReview({ found, apply, openDeliverable, onDismiss, readOnly = false, footnote }: NotesProposalsReviewProps) {
    const { proposals, skipped, dropped } = found
    const appliedBefore = new Set(found.alreadyApplied ?? [])
    // Reminders and due dates start selected, unless applied before; a new deliverable never is.
    const [selected, setSelected] = useState<Set<string>>(() => new Set(proposals.filter((p) => selectable(p) && !appliedBefore.has(p.id)).map((p) => p.id)))
    const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(
        proposals.filter((p) => appliedBefore.has(p.id)).map((p) => [p.id, { status: 'applied', note: APPLIED_BEFORE } as RowState]),
    ))
    const [applyingAll, setApplyingAll] = useState(false)

    const stateOf = (id: string): RowState => rows[id] ?? { status: 'idle' }
    const setRow = (id: string, state: RowState) => setRows((prev) => ({ ...prev, [id]: state }))

    const applyOne = useCallback(async (p: Exclude<NotesProposal, DeliverableProposal>) => {
        setRows((prev) => ({ ...prev, [p.id]: { status: 'applying' } }))
        const outcome: ApplyOutcome = await apply(p).catch((e: unknown) => ({ ok: false as const, error: failureReason(e) }))
        let next: RowState
        if (outcome.ok) {
            next = { status: 'applied', note: outcome.warning ?? APPLIED_NOTE[p.kind] }
            setSelected((prev) => { const s = new Set(prev); s.delete(p.id); return s })
        } else if ('cancelled' in outcome) {
            next = { status: 'idle' }
        } else {
            const lead = p.kind === 'reminder' ? "Couldn't add the reminder." : "Couldn't move the due date."
            next = { status: 'failed', error: withLead(lead, outcome.error) }
        }
        setRows((prev) => ({ ...prev, [p.id]: next }))
    }, [apply])

    const pending = proposals.filter((p): p is Exclude<NotesProposal, DeliverableProposal> =>
        selectable(p) && selected.has(p.id) && stateOf(p.id).status !== 'applied' && stateOf(p.id).status !== 'applying')

    const applySelected = async () => {
        setApplyingAll(true)
        // One at a time: a due date may stop to ask (the due-date rule), and reminders share one list.
        for (const p of pending) await applyOne(p)
        setApplyingAll(false)
    }

    const copyName = async (p: DeliverableProposal) => {
        try {
            await navigator.clipboard.writeText(p.name)
            setRow(p.id, { status: 'applied', note: 'Name copied' })
        } catch {
            setRow(p.id, { status: 'failed', error: "Couldn't copy the name. The browser didn't allow it." })
        }
    }

    const count = proposals.length
    const headingId = useId()

    return (
        <section aria-labelledby={headingId} className="w-full rounded-card border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-3">
                <h4 id={headingId} className="text-ui font-semibold text-fg">
                    <Brio className="text-action" />{' '}
                    {count === 0 ? 'found no actions in these notes' : `found ${count} action${count === 1 ? '' : 's'}`}
                </h4>
                <span className="flex-1" />
                {count > 0 && <span className="text-caption font-normal text-fg-muted">Nothing changes until you apply it</span>}
            </div>

            {proposals.map((p) => {
                const state = stateOf(p.id)
                const isDeliverable = p.kind === 'deliverable'
                const applied = state.status === 'applied'
                const checkboxId = `notes-proposal-${p.id}`
                return (
                    <div key={p.id} className="flex items-start gap-2.5 border-t border-line px-3.5 py-3" data-testid={`notes-proposal-${p.id}`}>
                        <Checkbox
                            id={checkboxId}
                            className="mt-0.5"
                            checked={!isDeliverable && selected.has(p.id)}
                            disabled={isDeliverable || applied || readOnly || state.status === 'applying'}
                            onCheckedChange={(v) => setSelected((prev) => {
                                const next = new Set(prev)
                                if (v === true) next.add(p.id)
                                else next.delete(p.id)
                                return next
                            })}
                            aria-label={`Select: ${KIND_LABEL[p.kind].toLowerCase()} · ${p.kind === 'reminder' ? p.title : p.kind === 'dueDate' ? p.deliverableName : p.name}`}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg">
                                <Tag color="gray">{KIND_LABEL[p.kind]}</Tag>
                                <label htmlFor={checkboxId} className="min-w-0">
                                    <ProposalChange proposal={p} />
                                </label>
                            </div>
                            <p className="mt-1 border-l-2 border-line-strong pl-2 text-small text-fg-muted">
                                “{p.quote}”
                            </p>
                            {isDeliverable && (
                                <p className="mt-1 text-small text-fg-muted">
                                    {openDeliverable
                                        ? 'New scope is your call. Opens Add deliverable, filled in.'
                                        : 'New scope is your call. To add it, promote a folder to a deliverable in Files.'}
                                </p>
                            )}
                            {state.status === 'applied' && (
                                <p className="mt-1 flex items-center gap-1 text-small text-fg-muted" role="status">
                                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {state.note}
                                </p>
                            )}
                            {state.status === 'failed' && (
                                <p className="mt-1 flex items-start gap-1 text-small text-danger" role="alert">
                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {state.error}
                                </p>
                            )}
                        </div>
                        {isDeliverable ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={readOnly}
                                onClick={() => (openDeliverable ? openDeliverable(p) : copyName(p))}
                            >
                                {openDeliverable ? 'Open' : 'Copy name'}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={readOnly || applied || state.status === 'applying' || applyingAll}
                                onClick={() => applyOne(p)}
                            >
                                {state.status === 'applying' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Applying</>
                                    : applied ? <><Check className="h-3.5 w-3.5" aria-hidden />Applied</>
                                    : state.status === 'failed' ? 'Try again'
                                    : 'Apply'}
                            </Button>
                        )}
                    </div>
                )
            })}

            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-3">
                <div className="min-w-0 flex-1 space-y-0.5 text-small text-fg-muted">
                    {skipped.map((s, i) => (
                        <p key={i}>“{s.quote}” {clause(s.reason)}, so it isn&apos;t proposed.</p>
                    ))}
                    {dropped > 0 && (
                        <p>{dropped} more didn&apos;t match the notes or the Board, so {dropped === 1 ? 'it isn’t' : 'they aren’t'} shown.</p>
                    )}
                    {footnote && <p>{footnote}</p>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={onDismiss} disabled={applyingAll}>
                    {count === 0 ? 'Dismiss' : 'Dismiss all'}
                </Button>
                {proposals.some(selectable) && (
                    <Button type="button" variant="greenCta" size="sm" disabled={readOnly || pending.length === 0 || applyingAll} onClick={applySelected}>
                        {applyingAll ? 'Applying…' : `Apply ${pending.length} selected`}
                    </Button>
                )}
            </div>
        </section>
    )
}

// ── The trigger ───────────────────────────────────────────────────────────────────────────────

/** "Find actions in these notes", under the memo; "Find actions" on an internal memo's row. Shared with /tour. */
export function FindActionsButton({
    onClick,
    busy,
    disabled,
    title,
    label = 'Find actions in these notes',
    busyLabel = 'Reading the notes…',
    'aria-label': ariaLabel,
}: {
    onClick: () => void
    busy: boolean
    disabled?: boolean
    title?: string
    label?: string
    busyLabel?: string
    'aria-label'?: string
}) {
    return (
        <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={busy || disabled} title={title} aria-label={busy ? undefined : ariaLabel}>
            {busy
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />}
            {busy ? busyLabel : label}
        </Button>
    )
}

// ── The app's panel ───────────────────────────────────────────────────────────────────────────

/** What a reminder points back to, from the route. */
export interface NotesEngagementRef { id: string; name: string; firmId: string; ctaUrl: string | null }

export interface FoundForEngagement extends NotesProposalsFound {
    engagement: NotesEngagementRef
}

/**
 * A memo is read from storage before Brio reads it, and may be a long transcript: more time than the
 * typed notes get, still past the route's own 40-second limit on the model.
 */
const MEMO_TIMEOUT_MS = AI_TIMEOUT_MS.brief + 15_000

/**
 * Asks the route for proposals: from the notes as they stand in a field (saved or not), or from one of
 * the engagement's internal memos, which the route reads itself. Throws an AiAbortedError when `signal`
 * stops it, and otherwise an error carrying Brio's words (proposalsFailureMessage).
 */
export async function requestNotesProposals(
    projectId: string,
    from: { notes: string } | { memoDocumentId: string },
    signal?: AbortSignal,
): Promise<FoundForEngagement> {
    const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-notes-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...from, today: localDay() }),
    }, 'memoDocumentId' in from ? MEMO_TIMEOUT_MS : AI_TIMEOUT_MS.brief, signal)
    const body = await res.json().catch(() => null) as { data?: FoundForEngagement; error?: string } | null
    if (!res.ok || !body?.data) throw new Error(body?.error || BRIO_PROPOSALS_FAILED)
    return body.data
}

/**
 * Brio's words for a failed request: the route's own (a credit limit, a refusal, a memo storage
 * couldn't read), "took too long", or "couldn't reach" when the request never left.
 */
export function proposalsFailureMessage(e: unknown): string {
    return e instanceof AiTimeoutError ? BRIO_TOO_SLOW
        : e instanceof TypeError ? BRIO_UNREACHABLE_RETRY
        : brioFailureReason(e, BRIO_PROPOSALS_FAILED)
}

/** Asks the route for proposals from the notes as they stand in the field (saved or not). */
export function useNotesProposals(projectId: string) {
    const [found, setFound] = useState<FoundForEngagement | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const ctrlRef = useRef<AbortController | null>(null)

    // A request in flight stops when the panel goes away.
    useEffect(() => () => ctrlRef.current?.abort(), [])

    const find = useCallback(async (notes: string) => {
        ctrlRef.current?.abort()
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setBusy(true)
        setError(null)
        try {
            setFound(await requestNotesProposals(projectId, { notes }, ctrl.signal))
        } catch (e) {
            if (e instanceof AiAbortedError) return
            setFound(null)
            setError(proposalsFailureMessage(e))
        } finally {
            if (ctrlRef.current === ctrl) setBusy(false)
        }
    }, [projectId])

    const dismiss = useCallback(() => { setFound(null); setError(null) }, [])

    return { found, busy, error, find, dismiss }
}

/**
 * Applies a reminder or a due date the way a person does by hand: createManualReminder, or the
 * due-date route through useDueDateSave (which asks when a date would break the due-date rule; render
 * `dialog`). `note` is the reminder's note, saying where it came from. Shared by the Settings panel
 * and the internal memos card.
 */
export function useApplyNotesProposal(projectId: string) {
    const { save: saveDue, dialog } = useDueDateSave()

    const apply = useCallback(async (
        p: Exclude<NotesProposal, DeliverableProposal>,
        engagement: NotesEngagementRef | null,
        note: string,
    ): Promise<ApplyOutcome> => {
        if (p.kind === 'reminder') {
            if (!engagement) return { ok: false, error: 'The proposals are gone. Find the actions again.' }
            const result = await createManualReminder({
                entityKey: 'platform.engagements',
                entityValue: engagement.id,
                action: p.title,
                dateValue: p.date,
                entityName: engagement.name,
                firmId: engagement.firmId,
                ctaUrl: engagement.ctaUrl,
                note,
            })
            return result.ok ? { ok: true } : { ok: false, error: result.error }
        }
        const result = await saveDue(projectId, p.deliverableId, p.newDate)
        if (result.ok) return result.warning ? { ok: true, warning: result.warning } : { ok: true }
        if (result.cancelled) return { ok: false, cancelled: true }
        return { ok: false, error: result.error }
    }, [projectId, saveDue])

    return { apply, dialog }
}

export interface NotesProposalsPanelProps {
    projectId: string
    /** The memo as it stands in the field. */
    notes: string
    /** A completed engagement: read only, so nothing can be found to apply. */
    disabled?: boolean
    /** See NotesProposalsReview. */
    openDeliverable?: (proposal: DeliverableProposal) => void
}

export function NotesProposalsPanel({ projectId, notes, disabled = false, openDeliverable }: NotesProposalsPanelProps) {
    const { found, busy, error, find, dismiss } = useNotesProposals(projectId)
    const { apply: applyProposal, dialog: dueDialog } = useApplyNotesProposal(projectId)
    // A new result is a new list: its selection and row states start over.
    const [round, setRound] = useState(0)
    const empty = !notes.trim()

    const apply = useCallback(
        (p: Exclude<NotesProposal, DeliverableProposal>) => applyProposal(p, found?.engagement ?? null, `From your notes: “${p.quote}”`),
        [applyProposal, found],
    )

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 px-2">
                <FindActionsButton
                    busy={busy}
                    disabled={disabled || empty}
                    title={empty ? 'Write or paste some notes first' : undefined}
                    onClick={() => { setRound((r) => r + 1); void find(notes) }}
                />
            </div>
            {error && (
                <p className="flex items-start gap-1 px-2 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {error}
                </p>
            )}
            {found && !busy && (
                <NotesProposalsReview
                    key={round}
                    found={found}
                    apply={apply}
                    openDeliverable={openDeliverable}
                    onDismiss={dismiss}
                    readOnly={disabled}
                />
            )}
            {dueDialog}
        </div>
    )
}
