import { BLOCKED_REASON_LABEL, type BlockedReason } from '@/lib/files/blocked'
import { nudgeCandidates } from '@/lib/ai/nudge-draft'
import type { DeliverableProgress, EngagementPace } from '@/lib/insights/engagement-insights'
import { SIGNAL, parseSignalKey, shortDay, type RaidStatus, type RaidType } from './raid-shared'

/**
 * The free half of the RAID log (.claude/plans/brio-features-round-2.md, §9): what the engagement's
 * own data already says, turned into entries with no model call. Pure, so the mapping and the rules
 * for closing and reopening are pinned by tests; lib/raid/raid-sync.ts reads the data and writes rows.
 *
 * | Signal                                           | Entry                  | Closes when                          |
 * |--------------------------------------------------|------------------------|--------------------------------------|
 * | A deliverable past its due date, not approved     | Issue (STATUS)         | approved, due date moved, or removed |
 * | A document marked Blocked (reason and note)       | Issue (STATUS)         | unblocked                            |
 * | A deliverable in review for NUDGE_MIN_DAYS+ days  | Issue (STATUS)         | approved or out of review            |
 * | A client thread awaiting the firm for 3+ days     | Issue (STATUS)         | answered or resolved                 |
 * | Behind pace (the health score's own rule)         | Risk (HEALTH)          | back on pace                         |
 * | Planning gaps (the Action Center's count)         | Risk (HEALTH)          | every gap planned                    |
 * | An approved deliverable                           | Decision (BOARD), Recorded | the approval is reopened         |
 *
 * A person's edits (owner, notes) are never touched by a sync. An entry a person closed stays closed
 * while its signal lasts; one the sync closed opens again if the signal comes back.
 */

/** How long a client thread waits on the firm before it is an Issue. */
export const WAITING_THREAD_DAYS = 3
/** The health score's rule: behind pace when time used runs this many points ahead of delivery. */
export const PACE_GAP_POINTS = 15
const MAX_NOTE_IN_TITLE = 80
const DAY_MS = 86_400_000

export type AutoSourceKind = 'STATUS' | 'HEALTH' | 'BOARD'

export interface RaidSignal {
    key: string
    sourceKind: AutoSourceKind
    type: RaidType
    status: 'OPEN' | 'RECORDED'
    title: string
    raisedAt: Date
    /**
     * Keeps an open entry open but never opens one: a thread still awaiting the firm whose wait
     * restarted with a newer client message is the same Issue, not a new one, and not yet 3 days old.
     */
    keepOnly?: boolean
}

export interface BlockedDocumentSignal {
    documentId: string
    /** The document's DOC-ID, or its deliverable's. */
    ref: string | null
    fileName: string
    reason: BlockedReason
    note?: string
    /** ISO, when it was marked. */
    at: string
}

export interface RaidSignalInputs {
    now: Date
    deliverables: readonly Pick<DeliverableProgress, 'id' | 'docId' | 'name' | 'stage' | 'dueDate' | 'isOverdue' | 'finalizedAt' | 'stageSince'>[]
    /** computeEngagementInsights().unansweredThreads: client threads whose latest shared comment is the client side's. */
    unansweredThreads: readonly { documentId: string; documentName: string; lastMessageAt: string }[]
    /** Each thread's reference (its deliverable's DOC-ID), from commentThreads.documents. */
    threadRefs: ReadonlyMap<string, string | null>
    pace: EngagementPace
    /** planningGapCount(): the Action Center's "Planning gaps". */
    planningGaps: number
    blocked: readonly BlockedDocumentSignal[]
    /** Who approved each approved deliverable, by first name, where it is known. */
    approvers: ReadonlyMap<string, string | null>
}

const days = (ms: number) => Math.max(0, Math.floor(ms / DAY_MS))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const named = (ref: string | null, name: string) => (ref ? `${ref} · ${name}` : name)

function cut(s: string, max: number): string {
    const t = s.replace(/\s+/g, ' ').trim()
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function dateOr(iso: string | null | undefined, fallback: Date): Date {
    const d = iso ? new Date(iso) : null
    return d && !Number.isNaN(d.getTime()) ? d : fallback
}

/** The day after a due date: when a deliverable became overdue. */
function dayAfter(iso: string | null, fallback: Date): Date {
    const d = dateOr(iso, fallback)
    return iso ? new Date(d.getTime() + DAY_MS) : d
}

/** Every signal the engagement shows now. */
export function raidSignals(input: RaidSignalInputs): RaidSignal[] {
    const { now } = input
    const signals: RaidSignal[] = []

    // Overdue deliverables.
    const overdueIds = new Set<string>()
    for (const d of input.deliverables) {
        if (!d.isOverdue || d.stage === 'approved' || !d.dueDate) continue
        overdueIds.add(d.id)
        const late = days(now.getTime() - new Date(d.dueDate).getTime())
        signals.push({
            key: SIGNAL.overdue(d.id),
            sourceKind: 'STATUS',
            type: 'ISSUE',
            status: 'OPEN',
            title: `${named(d.docId, d.name)} overdue${late > 0 ? ` by ${plural(late, 'day')}` : ''}`,
            raisedAt: dayAfter(d.dueDate, now),
        })
    }

    // Waiting on the Reviewer for long. An overdue deliverable is already an Issue; one is enough.
    for (const c of nudgeCandidates(input.deliverables as DeliverableProgress[], now)) {
        if (overdueIds.has(c.deliverableId)) continue
        const d = input.deliverables.find((x) => x.id === c.deliverableId)
        signals.push({
            key: SIGNAL.review(c.deliverableId),
            sourceKind: 'STATUS',
            type: 'ISSUE',
            status: 'OPEN',
            title: `${named(c.docId, c.name)} in review for ${plural(c.daysWaiting, 'day')}`,
            raisedAt: dateOr(d?.stageSince, now),
        })
    }

    // Blocked documents, with what they wait on.
    for (const b of input.blocked) {
        const note = b.note?.trim() ? ` · ${cut(b.note, MAX_NOTE_IN_TITLE)}` : ''
        signals.push({
            key: SIGNAL.blocked(b.documentId),
            sourceKind: 'STATUS',
            type: 'ISSUE',
            status: 'OPEN',
            title: `${named(b.ref, b.fileName)} blocked · ${BLOCKED_REASON_LABEL[b.reason]}${note}`,
            raisedAt: dateOr(b.at, now),
        })
    }

    // Client threads awaiting the firm.
    for (const t of input.unansweredThreads) {
        const waited = days(now.getTime() - new Date(t.lastMessageAt).getTime())
        const ref = input.threadRefs.get(t.documentId) ?? null
        signals.push({
            key: SIGNAL.waiting(t.documentId),
            sourceKind: 'STATUS',
            type: 'ISSUE',
            status: 'OPEN',
            title: `Reply on ${named(ref, t.documentName)} has waited ${plural(waited, 'day')}`,
            raisedAt: dateOr(t.lastMessageAt, now),
            ...(waited < WAITING_THREAD_DAYS ? { keepOnly: true } : {}),
        })
    }

    // Behind pace, by the health score's own rule (lib/insights/engagement-insights.ts).
    const p = input.pace
    if (p.hasDeadline && input.deliverables.length > 0 && p.timePct - p.deliveredPct > PACE_GAP_POINTS) {
        signals.push({
            key: SIGNAL.pace,
            sourceKind: 'HEALTH',
            type: 'RISK',
            status: 'OPEN',
            title: `Behind pace · ${p.deliveredPct}% delivered against ${p.timePct}% of time used`,
            raisedAt: now,
        })
    }

    // Planning gaps, the Action Center's number.
    if (input.planningGaps > 0) {
        signals.push({
            key: SIGNAL.planning,
            sourceKind: 'HEALTH',
            type: 'RISK',
            status: 'OPEN',
            title: `${plural(input.planningGaps, 'planning gap')} · missing due dates or assignees`,
            raisedAt: now,
        })
    }

    // Approvals: decisions the Board already holds.
    for (const d of input.deliverables) {
        if (d.stage !== 'approved') continue
        const by = input.approvers.get(d.id)
        signals.push({
            key: SIGNAL.approved(d.id),
            sourceKind: 'BOARD',
            type: 'DECISION',
            status: 'RECORDED',
            title: `${named(d.docId, d.name)} approved${by ? ` by ${by}` : ''}`,
            raisedAt: dateOr(d.finalizedAt ?? d.stageSince, now),
        })
    }

    return signals
}

// ── Closing ───────────────────────────────────────────────────────────────────────────────────

export interface RaidCloseContext {
    now: Date
    deliverables: readonly Pick<DeliverableProgress, 'id' | 'stage' | 'finalizedAt' | 'stageSince'>[]
    /** Threads someone resolved. */
    resolvedThreads: ReadonlySet<string>
}

/** Why an entry the sync kept is closed now that its signal is gone: "Resolved · approved Nov 14". */
export function closeReasonFor(signalKey: string, ctx: RaidCloseContext): string {
    const parsed = parseSignalKey(signalKey)
    const today = shortDay(ctx.now)
    const deliverable = parsed?.documentId ? ctx.deliverables.find((d) => d.id === parsed.documentId) : undefined
    const approved = deliverable?.stage === 'approved'
        ? `Resolved · approved ${shortDay(deliverable.finalizedAt ?? deliverable.stageSince ?? ctx.now) || today}`
        : null
    switch (parsed?.kind) {
        case 'overdue':
            return approved ?? (deliverable ? 'Resolved · due date moved' : 'Resolved · no longer on the Board')
        case 'review':
            return approved ?? (deliverable ? 'Resolved · out of review' : 'Resolved · no longer on the Board')
        case 'blocked':
            return `Resolved · unblocked ${today}`
        case 'waiting':
            return parsed.documentId && ctx.resolvedThreads.has(parsed.documentId) ? 'Resolved · thread resolved' : 'Resolved · answered'
        case 'pace':
            return 'Resolved · back on pace'
        case 'planning':
            return 'Resolved · planned'
        case 'approved':
            return `Approval reopened · ${today}`
        default:
            return `Resolved · ${today}`
    }
}

// ── The plan ──────────────────────────────────────────────────────────────────────────────────

/** An entry the sync keeps, as read back: only what the sync may change or must respect. */
export interface ExistingAutoItem {
    id: string
    signalKey: string
    status: RaidStatus
    title: string
    /** Set when a person closed it: the sync leaves it closed. */
    closedBy: string | null
}

export interface RaidSyncPlan {
    create: RaidSignal[]
    /** New words for an entry that's still live. Titles only: never the owner or the notes. */
    retitle: Array<{ id: string; title: string }>
    close: Array<{ id: string; reason: string }>
    /** Closed by an earlier sync, and the signal is back. */
    reopen: Array<{ id: string; signal: RaidSignal }>
}

/**
 * What a sync changes. Upserts by signal key: a signal with no entry opens one, a live entry follows
 * its signal's words, a live entry whose signal is gone closes with the reason, and one the sync closed
 * opens again when its signal returns. A person's close is final while the signal lasts, and nothing
 * here ever writes an owner or notes.
 */
export function planRaidSync(existing: readonly ExistingAutoItem[], signals: readonly RaidSignal[], ctx: RaidCloseContext): RaidSyncPlan {
    const plan: RaidSyncPlan = { create: [], retitle: [], close: [], reopen: [] }
    const byKey = new Map(existing.map((e) => [e.signalKey, e]))
    const present = new Set<string>()

    for (const s of signals) {
        if (present.has(s.key)) continue
        present.add(s.key)
        const e = byKey.get(s.key)
        if (!e) {
            if (!s.keepOnly) plan.create.push(s)
            continue
        }
        if (e.status === 'OPEN' || e.status === 'RECORDED') {
            if (e.title !== s.title) plan.retitle.push({ id: e.id, title: s.title })
        } else if (e.status === 'CLOSED' && !e.closedBy && !s.keepOnly) {
            plan.reopen.push({ id: e.id, signal: s })
        }
    }

    for (const e of existing) {
        if (present.has(e.signalKey)) continue
        if (e.status === 'OPEN' || e.status === 'RECORDED') plan.close.push({ id: e.id, reason: closeReasonFor(e.signalKey, ctx) })
    }
    return plan
}
