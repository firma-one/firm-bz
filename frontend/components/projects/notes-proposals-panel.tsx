'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DateProperty } from '@/components/ui/property-cells'
import { Tag } from '@/components/ui/tag'
import { Brio } from '@/components/ui/brio'
import { useDueDateSave } from '@/components/files/use-due-date-save'
import { createManualReminder } from '@/lib/actions/user-reminders'
import { failureReason } from '@/lib/files/action-failure'
import { cn } from '@/lib/utils'
import { AI_TIMEOUT_MS, AiAbortedError, AiTimeoutError, fetchWithTimeout } from '@/lib/ai/fetch-timeout'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { BRIO_PROPOSALS_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY, brioFailureReason } from '@/lib/ai/brio-failure'
import type { DeliverableProposal, NotesProposal, SkippedLine } from '@/lib/ai/notes-proposals'
import { deliverableAsReminder } from '@/lib/memos/memo-shared'

/**
 * "Identify action items in these notes" (was "Find actions"; .claude/plans/brio-features-round-2.md, §3.5): Brio reads the
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
    /** When each of those was applied, by id (ISO): "Applied on Nov 12 from this memo". */
    appliedOn?: Record<string, string>
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
    deliverable: 'Reminder added',
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

/** The next working day, the person's own: when a new deliverable's reminder comes up unless they pick another. */
function nextWorkday(now = new Date()): string {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return localDay(d)
}

/** "Couldn't add the reminder. Your session has ended…", unless the reason already says it couldn't. */
function withLead(lead: string, reason: string): string {
    return /^couldn['’]?t\b/i.test(reason) ? reason : `${lead} ${reason}`
}

/** The model writes "has no date"; a sentence of its own would read "Has no date". */
function clause(reason: string): string {
    return /^[A-Z][a-z]/.test(reason) ? reason[0].toLowerCase() + reason.slice(1) : reason
}


/** What a person changed in a proposal before applying it. Only the parts that are theirs to change. */
interface ProposalEdit {
    title?: string
    date?: string
    newDate?: string
    name?: string
    /** A new deliverable: the day of the reminder that accepting it adds. */
    remindOn?: string
}

/** The proposal as it will be applied: Brio's, with the person's edits over it. */
function withEdit(p: NotesProposal, e: ProposalEdit | undefined): NotesProposal {
    if (!e) return p
    switch (p.kind) {
        case 'reminder':
            return { ...p, title: e.title ?? p.title, date: e.date ?? p.date }
        case 'dueDate':
            return { ...p, newDate: e.newDate ?? p.newDate }
        case 'deliverable':
            return { ...p, name: e.name ?? p.name }
    }
}

/** Whether the edits leave the proposal different from Brio's. */
function isEdited(p: NotesProposal, shown: NotesProposal): boolean {
    if (p.kind === 'reminder' && shown.kind === 'reminder') return shown.title !== p.title || shown.date !== p.date
    if (p.kind === 'dueDate' && shown.kind === 'dueDate') return shown.newDate !== p.newDate
    if (p.kind === 'deliverable' && shown.kind === 'deliverable') return shown.name !== p.name
    return false
}

/** Whether it can be applied as edited: a reminder needs words, a new deliverable a name. */
function isComplete(p: NotesProposal): boolean {
    if (p.kind === 'reminder') return p.title.trim().length > 0 && !!p.date
    if (p.kind === 'deliverable') return p.name.trim().length > 0
    return !!p.newDate
}

/** A day picked in the shared date picker, as a proposal keeps it: "yyyy-MM-dd". */
function dayOf(value: string | null): string | null {
    return value ? value.slice(0, 10) : null
}

/** A labelled field in a proposal: the label above, small, then the control. */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
    return (
        <div className="mt-2 flex flex-col gap-1">
            {htmlFor
                ? <label htmlFor={htmlFor} className="text-caption font-normal text-fg-muted">{label}</label>
                : <span className="text-caption font-normal text-fg-muted">{label}</span>}
            {children}
        </div>
    )
}

/** The parts of a proposal a person can change before applying it; read-only once it can't apply. */
function ProposalFields({
    proposal,
    shown,
    locked,
    onEdit,
    remindOn,
}: {
    proposal: NotesProposal
    shown: NotesProposal
    locked: boolean
    onEdit: (edit: ProposalEdit) => void
    /** A new deliverable: the day of the reminder that accepting it adds. */
    remindOn?: string
}) {
    const id = useId()
    switch (shown.kind) {
        case 'reminder':
            return (
                <>
                    <Field label="What" htmlFor={`${id}-what`}>
                        <Input
                            id={`${id}-what`}
                            value={shown.title}
                            onChange={(e) => onEdit({ title: e.target.value })}
                            disabled={locked}
                            className="h-8 text-small"
                        />
                    </Field>
                    <Field label="When">
                        <DateProperty
                            value={shown.date}
                            onChange={(v) => { const day = dayOf(v); if (day) onEdit({ date: day }) }}
                            disabled={locked}
                            placeholder="Pick a day"
                            chip
                            compact
                        />
                    </Field>
                </>
            )
        case 'dueDate':
            return (
                <>
                    <p className="mt-2 text-small text-fg">
                        <strong className="font-semibold">{shown.docId ? `${shown.docId} · ${shown.deliverableName}` : shown.deliverableName}</strong>
                    </p>
                    <Field label={`New due date · now ${proposal.kind === 'dueDate' && proposal.currentDate ? formatProposalDay(proposal.currentDate) : 'none'}`}>
                        <DateProperty
                            value={shown.newDate}
                            onChange={(v) => { const day = dayOf(v); if (day) onEdit({ newDate: day }) }}
                            disabled={locked}
                            placeholder="Pick a day"
                            chip
                            compact
                        />
                    </Field>
                </>
            )
        case 'deliverable':
            return (
                <>
                    <Field label="Name" htmlFor={`${id}-name`}>
                        <Input
                            id={`${id}-name`}
                            value={shown.name}
                            onChange={(e) => onEdit({ name: e.target.value })}
                            disabled={locked}
                            className="h-8 text-small"
                        />
                    </Field>
                    {shown.dueDate && <p className="mt-1 text-small text-fg-muted">Due {formatProposalDay(shown.dueDate)}, from the notes</p>}
                    <Field label="Remind me">
                        <DateProperty
                            value={remindOn ?? null}
                            onChange={(v) => { const day = dayOf(v); if (day) onEdit({ remindOn: day }) }}
                            disabled={locked}
                            placeholder="Pick a day"
                            chip
                            compact
                        />
                    </Field>
                </>
            )
    }
}

// ── The list ──────────────────────────────────────────────────────────────────────────────────

export interface NotesProposalsReviewProps {
    found: NotesProposalsFound
    /**
     * Applies one reminder or due date: `proposal` as the person edited it, `original` as Brio found
     * it (what an internal memo records, so identifying them again still knows it's done). A new
     * deliverable arrives here as the reminder accepting it adds (deliverableAsReminder).
     */
    apply: (proposal: Exclude<NotesProposal, DeliverableProposal>, original: Exclude<NotesProposal, DeliverableProposal>) => Promise<ApplyOutcome>
    onDismiss: () => void
    /** A completed engagement, or a role that can't apply: the rows show, nothing applies. */
    readOnly?: boolean
    /** A line under the list, beside Dismiss: where the proposals came from, what applying records. */
    footnote?: React.ReactNode
    /**
     * `card` (the default): a bordered card under the notes. `column`: it fills a column of its own
     * (Discussions › Memos, wide), with Dismiss and Apply kept in view at its foot.
     */
    layout?: 'card' | 'column'
    /** Shown under the action items, above Dismiss and Accept: an internal memo's RAID suggestions (§13). */
    extra?: React.ReactNode
    /**
     * More for the foot's "Accept N selected" to take: the RAID suggestions selected in `extra`, so one
     * press accepts everything chosen on the memo.
     */
    alsoSelected?: { count: number; accept: () => Promise<void> }
    /**
     * Leaves Dismiss and Accept to the caller's own foot, as a memo's Brio panel does under its RAID
     * suggestions, so the panel shows one "Accept N selected" (Deepak, 2026-11-15): what's selected here
     * is told as it changes, with how to accept it, and null once the list is gone.
     */
    onSelectedChange?: (selected: AcceptSelected | null) => void
    /** In place of "Edit any of them…" under the heading, as after a memo was edited and read again. */
    caption?: string
}

/** What's selected in a list, and accepting it, for a foot that sits outside the list. */
export interface AcceptSelected {
    count: number
    accept: () => Promise<void>
}

/** What a proposal applied from this memo before shows instead of Apply. */
const APPLIED_BEFORE = 'Accepted earlier from this memo'

/** "Accepted on Nov 12 from this memo, so it isn't added twice.", or the plain note when the day isn't known. */
function appliedBeforeNote(at: string | undefined): string {
    if (!at) return APPLIED_BEFORE
    const day = new Date(at)
    if (Number.isNaN(day.getTime())) return APPLIED_BEFORE
    return `Accepted on ${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} from this memo, so it isn't added twice.`
}

export function NotesProposalsReview({ found, apply, onDismiss, readOnly = false, footnote, layout = 'card', extra, alsoSelected, onSelectedChange, caption }: NotesProposalsReviewProps) {
    const { proposals, skipped, dropped } = found
    const appliedBefore = new Set(found.alreadyApplied ?? [])
    // Reminders and due dates start selected, unless applied before; a new deliverable never is.
    // Every action item starts selected, unless accepted before: a new deliverable too, since accepting
    // one only adds a reminder to set it up.
    const [selected, setSelected] = useState<Set<string>>(() => new Set(proposals.filter((p) => !appliedBefore.has(p.id)).map((p) => p.id)))
    const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(
        proposals.filter((p) => appliedBefore.has(p.id)).map((p) => [p.id, { status: 'applied', note: appliedBeforeNote(found.appliedOn?.[p.id]) } as RowState]),
    ))
    const [edits, setEdits] = useState<Record<string, ProposalEdit>>({})
    const [applyingAll, setApplyingAll] = useState(false)

    const stateOf = (id: string): RowState => rows[id] ?? { status: 'idle' }
    const setRow = (id: string, state: RowState) => setRows((prev) => ({ ...prev, [id]: state }))
    const shownOf = (p: NotesProposal) => withEdit(p, edits[p.id])
    const edit = (id: string, change: ProposalEdit) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }))
    const reset = (id: string) => setEdits((prev) => { const next = { ...prev }; delete next[id]; return next })

    const applyOne = useCallback(async (p: Exclude<NotesProposal, DeliverableProposal>, original: Exclude<NotesProposal, DeliverableProposal>) => {
        setRows((prev) => ({ ...prev, [p.id]: { status: 'applying' } }))
        const outcome: ApplyOutcome = await apply(p, original).catch((e: unknown) => ({ ok: false as const, error: failureReason(e) }))
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

    // A new deliverable's reminder comes up on the next working day unless the person picks another.
    const [defaultRemindOn] = useState(() => nextWorkday())
    const remindOnOf = (p: NotesProposal) => edits[p.id]?.remindOn ?? defaultRemindOn
    /** What accepting it applies, as edited and as Brio found it: a new deliverable becomes its reminder. */
    const toApply = (p: NotesProposal): [Exclude<NotesProposal, DeliverableProposal>, Exclude<NotesProposal, DeliverableProposal>] => (
        p.kind === 'deliverable'
            ? [deliverableAsReminder(shownOf(p) as DeliverableProposal, remindOnOf(p)), deliverableAsReminder(p, remindOnOf(p))]
            : [shownOf(p) as Exclude<NotesProposal, DeliverableProposal>, p]
    )
    const pending = proposals.filter((p) =>
        selected.has(p.id) && isComplete(shownOf(p)) && stateOf(p.id).status !== 'applied' && stateOf(p.id).status !== 'applying')

    // Everything selected on the memo: these action items and, when given, its RAID suggestions.
    const selectedTotal = pending.length + (alsoSelected?.count ?? 0)
    const acceptSelected = async () => {
        setApplyingAll(true)
        try {
            // One at a time: a due date may stop to ask (the due-date rule), and reminders share one list.
            for (const p of pending) await applyOne(...toApply(p))
            if (alsoSelected && alsoSelected.count > 0) await alsoSelected.accept()
        } finally {
            setApplyingAll(false)
        }
    }

    // A foot outside the list: it's told the count as the selection changes, and accepts with what's
    // selected and edited when it's pressed (the ref holds the latest, so a stale edit is never sent).
    const acceptRef = useRef(acceptSelected)
    useEffect(() => { acceptRef.current = acceptSelected })
    const acceptFromFoot = useCallback(() => acceptRef.current(), [])
    useEffect(() => {
        onSelectedChange?.({ count: pending.length, accept: acceptFromFoot })
    }, [onSelectedChange, pending.length, acceptFromFoot])
    useEffect(() => () => onSelectedChange?.(null), [onSelectedChange])

    const count = proposals.length
    const headingId = useId()
    const column = layout === 'column'
    const notProposed = skipped.length + (dropped > 0 ? dropped : 0)

    return (
        <section
            aria-labelledby={headingId}
            className={cn('w-full bg-surface', column ? 'flex min-h-full flex-col' : 'rounded-card border border-line')}
        >
            <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 py-3', column ? 'px-4' : 'px-3.5')}>
                <h4 id={headingId} className="text-ui font-semibold text-fg">
                    <Brio className="text-action" />{' '}
                    {count === 0 ? 'identified no action items in these notes' : `identified ${count} action item${count === 1 ? '' : 's'}`}
                </h4>
                <span className="flex-1" />
                {count > 0 && <span className="text-caption font-normal text-fg-muted">{caption ?? 'Edit any of them. Nothing changes until you accept it.'}</span>}
            </div>

            {proposals.map((p) => {
                const state = stateOf(p.id)
                const shown = shownOf(p)
                const isDeliverable = p.kind === 'deliverable'
                const applied = state.status === 'applied'
                const locked = readOnly || applied || state.status === 'applying' || applyingAll
                const changed = isEdited(p, shown)
                const complete = isComplete(shown)
                return (
                    <div key={p.id} className={cn('flex items-start gap-2.5 border-t border-line py-3', column ? 'px-4' : 'px-3.5')} data-testid={`notes-proposal-${p.id}`}>
                        <Checkbox
                            className="mt-0.5"
                            checked={selected.has(p.id)}
                            disabled={applied || readOnly || state.status === 'applying'}
                            onCheckedChange={(v) => setSelected((prev) => {
                                const next = new Set(prev)
                                if (v === true) next.add(p.id)
                                else next.delete(p.id)
                                return next
                            })}
                            aria-label={`Select: ${KIND_LABEL[p.kind].toLowerCase()} · ${shown.kind === 'reminder' ? shown.title : shown.kind === 'dueDate' ? shown.deliverableName : shown.name}`}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg">
                                <Tag color="gray">{KIND_LABEL[p.kind]}</Tag>
                                <span className="flex-1" />
                                {changed && !applied && (
                                    <span className="text-caption font-normal text-fg-muted">
                                        Edited ·{' '}
                                        <button type="button" onClick={() => reset(p.id)} disabled={locked} className="text-action hover:underline disabled:opacity-50">
                                            Reset
                                        </button>
                                    </span>
                                )}
                            </div>
                            <ProposalFields proposal={p} shown={shown} locked={locked} onEdit={(change) => edit(p.id, change)} remindOn={isDeliverable ? remindOnOf(p) : undefined} />
                            <p className="mt-2 border-l-2 border-line-strong pl-2 text-small italic text-fg-muted">
                                “{p.quote}”
                            </p>
                            {isDeliverable && (
                                <p className="mt-1 text-small text-fg-muted">
                                    New scope is your call. Accept adds a reminder for you to set it up in Files.
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
                            <div className="mt-2 flex justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={readOnly || applied || state.status === 'applying' || applyingAll || !complete}
                                    onClick={() => applyOne(...toApply(p))}
                                >
                                    {state.status === 'applying' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Accepting</>
                                        : applied ? <><Check className="h-3.5 w-3.5" aria-hidden />Accepted</>
                                        : state.status === 'failed' ? 'Try again'
                                        : 'Accept'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })}

            {extra}

            {(notProposed > 0 || footnote) && (
                <div className={cn('space-y-1 border-t border-line py-3 text-small text-fg-muted', column ? 'px-4' : 'px-3.5')}>
                    {notProposed > 0 && (
                        <details>
                            <summary className="cursor-pointer select-none">
                                {notProposed} line{notProposed === 1 ? '' : 's'} {notProposed === 1 ? 'wasn’t' : 'weren’t'} proposed
                            </summary>
                            <div className="mt-1 space-y-0.5">
                                {skipped.map((s, i) => (
                                    <p key={i}>“{s.quote}” {clause(s.reason)}, so it isn&apos;t proposed.</p>
                                ))}
                                {dropped > 0 && (
                                    <p>{dropped} more didn&apos;t match the notes or the deliverables, so {dropped === 1 ? 'it isn’t' : 'they aren’t'} shown.</p>
                                )}
                            </div>
                        </details>
                    )}
                    {footnote && <p>{footnote}</p>}
                </div>
            )}

            {!onSelectedChange && (
                <div className={cn(
                    'flex flex-wrap items-center justify-end gap-2 border-t border-line py-3',
                    column ? 'sticky bottom-0 mt-auto bg-surface px-4' : 'px-3.5',
                )}>
                    <Button type="button" variant="ghost" size="sm" onClick={onDismiss} disabled={applyingAll}>
                        {count === 0 ? 'Dismiss' : 'Dismiss all'}
                    </Button>
                    {(proposals.length > 0 || (alsoSelected?.count ?? 0) > 0) && (
                        <Button type="button" variant="greenCta" size="sm" disabled={readOnly || selectedTotal === 0 || applyingAll} onClick={acceptSelected}>
                            {applyingAll ? 'Accepting…' : `Accept ${selectedTotal} selected`}
                        </Button>
                    )}
                </div>
            )}
        </section>
    )
}

// ── The trigger ───────────────────────────────────────────────────────────────────────────────

/** "Identify action items in these notes", under the memo; "Identify action items" on an internal memo's row. Shared with /tour. */
export function FindActionsButton({
    onClick,
    busy,
    disabled,
    title,
    label = 'Identify action items in these notes',
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
            if (!engagement) return { ok: false, error: 'The action items are gone. Identify them again.' }
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
}

export function NotesProposalsPanel({ projectId, notes, disabled = false }: NotesProposalsPanelProps) {
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
                    onDismiss={dismiss}
                    readOnly={disabled}
                />
            )}
            {dueDialog}
        </div>
    )
}
