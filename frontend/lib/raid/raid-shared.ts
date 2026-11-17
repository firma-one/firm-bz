/**
 * The RAID log (.claude/plans/brio-features-round-2.md, §9): Risks, Actions, Issues and Decisions for one
 * engagement, internal only (Actions replaced Assumptions on 2026-11-15, .claude/plans/raid-actions-memo-minutes.md).
 * What the tab, the Overview card and /tour share: the shapes the route answers, the words for each type,
 * status and source, and the pure helpers that filter and count.
 *
 * Safe to import from client components: no database, no SDK.
 */

import type { StatusStage } from '@/lib/ui/status'

/** What RAID stands for, in one line: the Overview card's hint and the website's RAID info tip. */
export const RAID_MEANING =
    'Risks, Actions, Issues and Decisions: what could go wrong, what someone has to do, what has gone wrong, and what people agreed.'

/**
 * ASSUMPTION is only read: entries saved before 2026-11-15 keep it, and show with the Decisions under an
 * "Assumption" label (displayTypeOf). Nothing new is created with it, by a person or by Brio.
 */
export type RaidType = 'RISK' | 'ACTION' | 'ISSUE' | 'DECISION' | 'ASSUMPTION'
/** The four a person or Brio chooses from: R, A, I, D. */
export type RaidKind = Exclude<RaidType, 'ASSUMPTION'>
export type RaidStatus = 'SUGGESTED' | 'OPEN' | 'CLOSED' | 'RECORDED' | 'DISMISSED'
/**
 * An Action Brio added for the firm itself, not promised in the meeting: setting up a new deliverable
 * people agreed on, or preparing for a review point they agreed. A memo's minutes leave these out.
 */
export type RaidFollowUp = 'DELIVERABLE' | 'PREPARE'

export function parseFollowUp(raw: unknown): RaidFollowUp | null {
    return raw === 'DELIVERABLE' || raw === 'PREPARE' ? raw : null
}
export type RaidSourceKind = 'STATUS' | 'HEALTH' | 'BOARD' | 'THREAD' | 'MEMO' | 'MANUAL'

export const RAID_TYPES: readonly RaidKind[] = ['RISK', 'ACTION', 'ISSUE', 'DECISION']

/** How an entry's type shows: an Assumption saved before Actions shows as a Decision, labelled. */
export function displayTypeOf(type: RaidType): RaidKind {
    return type === 'ASSUMPTION' ? 'DECISION' : type
}

/** An entry saved as an Assumption, before Actions: shown with the Decisions under an "Assumption" label. */
export function isLegacyAssumption(item: { type: RaidType }): boolean {
    return item.type === 'ASSUMPTION'
}

export const RAID_TYPE_LETTER: Record<RaidType, string> = { RISK: 'R', ACTION: 'A', ISSUE: 'I', DECISION: 'D', ASSUMPTION: 'D' }

/**
 * Each type's color, from the Board's own stages (lib/ui/status.ts), so the log uses the colors the app
 * already uses for state and adds none (Deepak, 2026-11-14): a risk might happen (waiting, amber), an
 * action is under way (underway, blue), an issue is happening (problem, red), a decision is settled
 * (done, green). An old Assumption takes the Decisions' color it's listed with.
 */
export const RAID_TYPE_STAGE: Record<RaidType, StatusStage> = { RISK: 'waiting', ACTION: 'underway', ISSUE: 'problem', DECISION: 'done', ASSUMPTION: 'done' }
export const RAID_TYPE_LABEL: Record<RaidType, string> = { RISK: 'Risk', ACTION: 'Action', ISSUE: 'Issue', DECISION: 'Decision', ASSUMPTION: 'Assumption' }
export const RAID_TYPE_PLURAL: Record<RaidType, string> = { RISK: 'Risks', ACTION: 'Actions', ISSUE: 'Issues', DECISION: 'Decisions', ASSUMPTION: 'Assumptions' }

export const RAID_STATUS_LABEL: Record<RaidStatus, string> = {
    SUGGESTED: 'Suggested',
    OPEN: 'Open',
    CLOSED: 'Closed',
    RECORDED: 'Recorded',
    DISMISSED: 'Dismissed',
}

/** An entry's status in words: a closed Action is "Done"; the rest as RAID_STATUS_LABEL says. */
export function raidStatusLabel(item: { type: RaidType; status: RaidStatus }): string {
    return item.type === 'ACTION' && item.status === 'CLOSED' ? 'Done' : RAID_STATUS_LABEL[item.status]
}

// ── Due dates (Actions) ───────────────────────────────────────────────────────────────────────

/** A YYYY-MM-DD day from a request or the model, or null. */
export function parseDueDate(raw: unknown): string | null {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const d = new Date(`${raw}T00:00:00Z`)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : raw
}

/** Today as YYYY-MM-DD, in UTC: what a due date is compared with. */
export function todayDay(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
}

/** An open Action past its due date. */
export function isActionOverdue(item: { type: RaidType; status: RaidStatus; dueDate?: string | null }, today: string = todayDay()): boolean {
    return item.type === 'ACTION' && item.status === 'OPEN' && !!item.dueDate && item.dueDate < today
}

/**
 * The first working day of next week (a Monday): when an Action with no date said is due. The same rule
 * Brio's memo read uses (lib/raid/raid-check.ts), and what the memo panel sets when a suggestion is
 * turned into an Action.
 */
export function nextWeekStart(today: string = todayDay()): string {
    const d = new Date(`${today}T00:00:00Z`)
    const dow = d.getUTCDay() // 0 = Sunday
    d.setUTCDate(d.getUTCDate() + (dow === 0 ? 1 : 8 - dow))
    return d.toISOString().slice(0, 10)
}

/** "Fri, Mar 6": a due date as the log and the memo panel show it. */
export function dueDay(day: string | null | undefined): string {
    if (!day) return ''
    const d = new Date(`${day}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Kept current from the engagement's own signals, free: no person or model wrote them. */
export function isAutoSource(kind: RaidSourceKind): boolean {
    return kind === 'STATUS' || kind === 'HEALTH' || kind === 'BOARD'
}

/** A decision is recorded rather than opened; everything else opens. */
export function liveStatusFor(type: RaidType): 'OPEN' | 'RECORDED' {
    return type === 'DECISION' ? 'RECORDED' : 'OPEN'
}

// ── Priority ──────────────────────────────────────────────────────────────────────────────────

/**
 * How much a Risk or an Issue matters (Deepak, 2026-11-14), shown as gray signal bars. Actions and
 * Decisions have none (an Action's due date does that job). Sorted on wherever the log is listed: the
 * RAID tab and both Overviews.
 */
export type RaidPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export const RAID_PRIORITIES: readonly RaidPriority[] = ['HIGH', 'MEDIUM', 'LOW']
export const RAID_PRIORITY_LABEL: Record<RaidPriority, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }
/** Filled bars of three. */
export const RAID_PRIORITY_BARS: Record<RaidPriority, 1 | 2 | 3> = { HIGH: 3, MEDIUM: 2, LOW: 1 }

/** Only Risks and Issues carry a priority. */
export function hasPriority(type: RaidType): boolean {
    return type === 'RISK' || type === 'ISSUE'
}

/** An entry's priority as shown: its own, Medium for a Risk or an Issue saved before priorities, none otherwise. */
export function priorityOf(item: { type: RaidType; priority?: RaidPriority | null }): RaidPriority | null {
    if (!hasPriority(item.type)) return null
    return item.priority ?? 'MEDIUM'
}

/** A value from a request or the model: one of the three, or null. */
export function parsePriority(raw: unknown): RaidPriority | null {
    return typeof raw === 'string' && (RAID_PRIORITIES as readonly string[]).includes(raw) ? raw as RaidPriority : null
}

/**
 * The Health score's own grade for a deduction (components/projects/insight-rings.tsx): 15 points or more
 * is High, 8 or more Medium, less Low. Status and health entries take the grade of the deduction they
 * stand for, so the log and the score never disagree.
 */
export function priorityForPoints(points: number): RaidPriority {
    return points >= 15 ? 'HIGH' : points >= 8 ? 'MEDIUM' : 'LOW'
}

const PRIORITY_RANK: Record<RaidPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
/** Issues before risks before actions before decisions: what a reader acts on first. */
const TYPE_RANK: Record<RaidType, number> = { ISSUE: 0, RISK: 1, ACTION: 2, DECISION: 3, ASSUMPTION: 3 }

/**
 * The one order the log is read in, everywhere: High, Medium, Low (none last); within each, issues before
 * risks before actions before decisions; then newest first.
 */
export function compareRaid(
    a: { type: RaidType; priority?: RaidPriority | null; raisedAt: string },
    b: { type: RaidType; priority?: RaidPriority | null; raisedAt: string },
): number {
    const pa = priorityOf(a)
    const pb = priorityOf(b)
    return (pa ? PRIORITY_RANK[pa] : 3) - (pb ? PRIORITY_RANK[pb] : 3)
        || TYPE_RANK[a.type] - TYPE_RANK[b.type]
        || b.raisedAt.localeCompare(a.raisedAt)
}

// ── Limits ────────────────────────────────────────────────────────────────────────────────────

export const RAID_TITLE_MAX = 200
export const RAID_NOTES_MAX = 1000

// ── Signals ───────────────────────────────────────────────────────────────────────────────────

/**
 * The signal keys of STATUS, HEALTH and BOARD entries (lib/raid/raid-signals.ts). One per thing the
 * engagement's own data says, so an entry is found again on every sync.
 */
export const SIGNAL = {
    overdue: (deliverableId: string) => `overdue:${deliverableId}`,
    blocked: (documentId: string) => `blocked:${documentId}`,
    review: (deliverableId: string) => `review:${deliverableId}`,
    waiting: (documentId: string) => `waiting:${documentId}`,
    approved: (deliverableId: string) => `approved:${deliverableId}`,
    pace: 'pace',
    planning: 'planning',
} as const

export type SignalKind = 'overdue' | 'blocked' | 'review' | 'waiting' | 'approved' | 'pace' | 'planning'

/** A signal key, read back: what kind it is and the document it names, if any. */
export function parseSignalKey(key: string | null | undefined): { kind: SignalKind; documentId: string | null } | null {
    if (!key) return null
    if (key === 'pace' || key === 'planning') return { kind: key, documentId: null }
    const m = /^(overdue|blocked|review|waiting|approved):(.+)$/.exec(key)
    return m ? { kind: m[1] as SignalKind, documentId: m[2] } : null
}

/** The line under an entry the sync keeps: where it comes from and when it goes away. */
export function autoLineFor(signalKey: string | null | undefined): string | null {
    switch (parseSignalKey(signalKey)?.kind) {
        case 'overdue': return 'From status · closes itself when approved'
        case 'review': return 'From status · closes itself when approved'
        case 'blocked': return 'From status · closes itself when unblocked'
        case 'waiting': return 'From discussions · closes itself when answered'
        case 'pace': return 'From health · updates daily'
        case 'planning': return 'From health · closes itself when planned'
        case 'approved': return 'From Deliverables'
        default: return null
    }
}

// ── What the route answers ────────────────────────────────────────────────────────────────────

/** One source of an entry, as its chip shows it. */
export interface RaidSourceView {
    kind: RaidSourceKind
    /** "Thread · QSR-9 · Dana · Nov 11", "Memo · Call with Dana · Nov 12", "Board", "Health". */
    label: string
    /** The discussion's document (a thread), or the deliverable or document a status entry is about. */
    documentId: string | null
    /** The memo's document id, for a memo source: the chip links to the memo, since its words aren't kept. */
    memoId: string | null
    /** The comment's words: thread sources only, never a memo's. */
    quote: string | null
    /** An internal note or a memo. */
    internal: boolean
    /** A health source: the Overview chart it comes from, which the chip links to. */
    overviewSection?: RaidOverviewSection
}

/** The Overview charts a health entry comes from: Pace, and Planning hygiene. */
export type RaidOverviewSection = 'pace' | 'planning'

/** The Overview chart a signal reads, for a health entry; none for anything else. */
export function overviewSectionOf(signalKey: string | null | undefined): RaidOverviewSection | undefined {
    const kind = parseSignalKey(signalKey)?.kind
    return kind === 'pace' || kind === 'planning' ? kind : undefined
}

export interface RaidItemView {
    id: string
    type: RaidType
    title: string
    notes: string | null
    ownerUserId: string | null
    ownerName: string | null
    status: RaidStatus
    sourceKind: RaidSourceKind
    /** The entry's own source first, then any merged in. */
    sources: RaidSourceView[]
    internalSource: boolean
    /** For entries the sync keeps: "From status · closes itself when approved". */
    autoLine: string | null
    /** An Issue about a deliverable past its due date, or an open Action past its own: shown in the danger tone. */
    overdue: boolean
    /** Risks and Issues: High, Medium or Low (priorityOf). Null for Actions and Decisions. */
    priority: RaidPriority | null
    /** Actions only: YYYY-MM-DD, or null. */
    dueDate: string | null
    /** Actions only: one Brio added for the firm itself (RaidFollowUp), left out of a memo's minutes. */
    followUp: RaidFollowUp | null
    /** A person chose the priority: the sync leaves it as they set it. */
    prioritySetByPerson: boolean
    /** A suggestion that adds to an entry already in the log. */
    attachedTo: { id: string; type: RaidType; title: string } | null
    /** ISO. */
    raisedAt: string
    closedAt: string | null
    closedReason: string | null
    /**
     * A closed entry a person may reopen: anything a person closed, and any entry the sync didn't keep.
     * One the sync closed opens again by itself when its signal returns.
     */
    canReopen: boolean
}

/** A Lead or a Contributor · Full Access: who an entry can be given to. */
export interface RaidMember {
    userId: string
    name: string
}

/** The conversation Brio reads against its last check: read, changed since, or none to read. */
export type RaidConversationState = 'current' | 'changed' | 'none'

export interface RaidLogPayload {
    /** The log: open, recorded and closed entries. */
    items: RaidItemView[]
    /** Brio's suggestions, waiting for a person. */
    suggestions: RaidItemView[]
    members: RaidMember[]
    /** ISO, when Brio last read the conversation for this engagement; null before the first check. */
    lastCheckedAt: string | null
    /**
     * Whether Brio has read the conversation as it is now (lib/raid/raid-fingerprint.ts): the threads and
     * memos match the fingerprint of the last check, have changed since, or there are none.
     */
    conversation: RaidConversationState
    /** A completed engagement: listed, nothing changed. */
    readOnly: boolean
    /** Brio is configured, so Check now can run. */
    canCheck: boolean
}

// ── Reading it ────────────────────────────────────────────────────────────────────────────────

/** In the log and not closed: open, or a recorded decision. What the "Open" filter shows. */
export function isLive(item: Pick<RaidItemView, 'status'>): boolean {
    return item.status === 'OPEN' || item.status === 'RECORDED'
}

/** The number beside RAID on the Discussions switch: everything live in the log. */
export function raidOpenCount(items: readonly Pick<RaidItemView, 'status'>[]): number {
    return items.filter(isLive).length
}

export type RaidTone = 'late' | 'open' | 'closed' | 'recorded' | 'suggested'

/** The status pill's tone: waiting for open, danger for an overdue issue or action, done for closed, neutral blue for a decision. */
export function raidTone(item: Pick<RaidItemView, 'status' | 'type' | 'overdue'>): RaidTone {
    if (item.status === 'CLOSED' || item.status === 'DISMISSED') return 'closed'
    if (item.status === 'RECORDED') return 'recorded'
    if (item.status === 'SUGGESTED') return 'suggested'
    return (item.type === 'ISSUE' || item.type === 'ACTION') && item.overdue ? 'late' : 'open'
}

export type RaidTypeFilter = RaidKind | 'ALL'
export type RaidStateFilter = 'open' | 'closed'

function inState(item: Pick<RaidItemView, 'status'>, state: RaidStateFilter): boolean {
    return state === 'open' ? isLive(item) : item.status === 'CLOSED'
}

/** The table's rows for a type and Open or Closed, newest first. An old Assumption is listed with the Decisions. */
export function filterRaidItems<T extends Pick<RaidItemView, 'status' | 'type' | 'raisedAt'> & { priority?: RaidPriority | null }>(
    items: readonly T[],
    type: RaidTypeFilter,
    state: RaidStateFilter,
): T[] {
    return items
        .filter((i) => inState(i, state) && (type === 'ALL' || displayTypeOf(i.type) === type))
        .sort(compareRaid)
}

/** The counts beside each type filter, for Open or Closed. */
export function raidCountsByType(items: readonly Pick<RaidItemView, 'status' | 'type'>[], state: RaidStateFilter): Record<RaidTypeFilter, number> {
    const counts: Record<RaidTypeFilter, number> = { ALL: 0, RISK: 0, ACTION: 0, ISSUE: 0, DECISION: 0 }
    for (const i of items) {
        if (!inState(i, state)) continue
        counts.ALL += 1
        counts[displayTypeOf(i.type)] += 1
    }
    return counts
}

export interface RaidOverview {
    counts: { openRisks: number; openActions: number; openIssues: number; decisions: number }
    /** The top open entries, from every source. */
    open: RaidItemView[]
    /** How many open entries there are in all, shown or not: "and 2 more". */
    openTotal: number
    /** The newest decision people recorded (not the Board's approvals, which the Board shows). */
    latestDecision: RaidItemView | null
    suggestionCount: number
}

/**
 * The Overview's RAID section: counts by type, the top open entries and the latest decision. Every source
 * is listed, status and health too (overdue work, planning gaps, pace, waiting threads), as on the Firm
 * Overview: leaving them out showed counts over an empty list (Deepak, 2026-11-14).
 */
export function raidOverviewOf(log: Pick<RaidLogPayload, 'items' | 'suggestions'>, maxRows = 5): RaidOverview {
    const live = log.items.filter(isLive)
    const latestDecision = live
        .filter((i) => i.type === 'DECISION' && !isAutoSource(i.sourceKind))
        .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))[0] ?? null
    // An old Assumption is listed with the Decisions, so it's never among the open rows.
    const raised = live
        .filter((i) => i.status === 'OPEN' && displayTypeOf(i.type) !== 'DECISION')
        .sort(compareRaid)
    const open = raised.slice(0, Math.max(0, maxRows - (latestDecision ? 1 : 0)))
    return {
        counts: {
            openRisks: live.filter((i) => i.type === 'RISK' && i.status === 'OPEN').length,
            openActions: live.filter((i) => i.type === 'ACTION' && i.status === 'OPEN').length,
            openIssues: live.filter((i) => i.type === 'ISSUE' && i.status === 'OPEN').length,
            // An old Assumption is counted with the Decisions it's listed with.
            decisions: live.filter((i) => displayTypeOf(i.type) === 'DECISION').length,
        },
        open,
        openTotal: raised.length,
        latestDecision,
        // A memo's suggestions wait on the memo (waitsOnMemo); its row in Memos counts them.
        suggestionCount: log.suggestions.filter((s) => !waitsOnMemo(s)).length,
    }
}

/**
 * A suggestion Brio made from a memo waits on that memo, to accept or dismiss there with its action
 * items: a memo reviewed in one place (.claude/plans/brio-features-round-2.md, §13). The RAID tab and
 * the Overview card leave it out and point to the memo instead.
 */
export function waitsOnMemo(s: Pick<RaidItemView, 'sourceKind'>): boolean {
    return s.sourceKind === 'MEMO'
}

/** The memos that have suggestions waiting on them, each once, in the order the suggestions came. */
export function memoSuggestionGroups(suggestions: RaidItemView[]): { memoId: string | null; title: string; count: number }[] {
    const groups = new Map<string, { memoId: string | null; title: string; count: number }>()
    for (const s of suggestions) {
        if (!waitsOnMemo(s)) continue
        const source = s.sources.find((x) => x.kind === 'MEMO')
        const key = source?.memoId ?? source?.label ?? 'memo'
        const group = groups.get(key) ?? { memoId: source?.memoId ?? null, title: (source?.label ?? '').replace(/^Memo( · )?/, ''), count: 0 }
        group.count += 1
        groups.set(key, group)
    }
    return Array.from(groups.values())
}

/** Where a memo is reviewed: Discussions › Memos with it open (on /tour, the page's own query). */
export function memoReviewHref(engagementBase: string, memoId: string | null): string {
    const memo = memoId ? `&memo=${encodeURIComponent(memoId)}` : ''
    return engagementBase ? `${engagementBase}/comments?view=memos${memo}` : `?tab=comments&view=memos${memo}`
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────

/** "Nov 11": a day, as the table shows it. */
export function shortDay(iso: string | Date | null | undefined): string {
    if (!iso) return ''
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Checked today 08:02", "Checked Nov 11", or "Not checked yet": when Brio last read the conversation. */
/** "today 08:02" or "Nov 12": when Brio last checked, for the log's status tooltip; null before the first. */
export function lastCheckedPhrase(lastCheckedAt: string | null, now: Date = new Date()): string | null {
    if (!lastCheckedAt) return null
    const at = new Date(lastCheckedAt)
    if (Number.isNaN(at.getTime())) return null
    const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
    if (sameDay) return `today ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "the open Issue “QSR-9 overdue”": what an attaching suggestion adds to. */
export function attachPhrase(target: { type: RaidType; title: string }): string {
    const state = target.type === 'DECISION' ? 'recorded' : 'open'
    return `adds to the ${state} ${RAID_TYPE_LABEL[target.type]} “${target.title}”`
}

/** Where the RAID log is: the engagement's RAID tab (it was a Discussions sub-tab until 2026-11-14). */
export function raidLogHref(engagementBase: string): string {
    // Without a base (/tour), the page's own query: the tour switches tabs with ?tab=.
    return engagementBase ? `${engagementBase}/raid` : '?tab=raid'
}

/**
 * Where a source chip goes: the discussion, the memo in Files, the item on the Board, or for health the
 * Overview chart it comes from (`…/analytics`, the Overview's own path: the bare engagement URL reopens
 * the last tab). The Overview scrolls to `#ring-…` once its charts load.
 *
 * Without a base (/tour), the tab it came from on the tour's own page (tourSourceHref).
 */
export function sourceHref(engagementBase: string, source: Pick<RaidSourceView, 'kind' | 'documentId' | 'memoId' | 'label' | 'overviewSection'>): string | null {
    if (!engagementBase) return tourSourceHref(source)
    if (source.kind === 'MEMO') return source.memoId ? memoReviewHref(engagementBase, source.memoId) : null
    if (source.kind === 'HEALTH') return `${engagementBase}/analytics${source.overviewSection ? `#ring-${source.overviewSection}` : ''}`
    if (!source.documentId) return null
    if (source.kind === 'THREAD' || source.label.startsWith('Thread')) return `${engagementBase}/comments#doc-comment:${source.documentId}`
    if (source.kind === 'STATUS' || source.kind === 'BOARD') return `${engagementBase}/board#doc-file:${source.documentId}`
    return null
}

/**
 * The same places on /tour, which switches tabs with `?tab=` and has no item ids to link to: the
 * Overview chart for health, as in the app, then the tab itself for the rest (Discussions, its Memos,
 * the Board). Like raidLogHref, the page's own query.
 */
function tourSourceHref(source: Pick<RaidSourceView, 'kind' | 'label' | 'overviewSection'>): string | null {
    if (source.kind === 'HEALTH') return `?tab=analytics${source.overviewSection ? `#ring-${source.overviewSection}` : ''}`
    if (source.kind === 'MEMO') return '?tab=comments&view=memos'
    if (source.kind === 'THREAD' || source.label.startsWith('Thread')) return '?tab=comments'
    if (source.kind === 'STATUS' || source.kind === 'BOARD') return '?tab=board'
    return null
}

/** Sent when the log changes on this page, so the switch's count follows without a refetch. */
export const RAID_CHANGED_EVENT = 'firma:raid-changed'
export interface RaidChangedDetail {
    projectId: string
    count: number
}

// ── The firm's open risks and issues (Firm Overview) ──────────────────────────────────────────

/** One open Risk or Issue on the Firm Overview, with the engagement it's in. */
export interface FirmRaidRow {
    id: string
    type: 'RISK' | 'ISSUE'
    priority: RaidPriority
    title: string
    /** The owner's first name, or null when no one owns it. */
    ownerFirstName: string | null
    /** ISO. */
    raisedAt: string
    engagement: { name: string; clientName: string; /** Its RAID tab. */ href: string }
}

/**
 * What GET /api/firms/[firmId]/raid answers: the open Risks and Issues across the engagements the person
 * may see the RAID log of, from every source, issues first, newest first.
 */
export interface FirmRaidOverview {
    counts: {
        openIssues: number
        openRisks: number
        /** Of those, how many are High. */
        high: number
        /** Engagements with at least one open. */
        engagements: number
    }
    rows: FirmRaidRow[]
    /** Open but not sent, past FIRM_RAID_MAX_ROWS: "and 2 more, in their engagements' RAID logs". */
    more: number
}

/** "Dana" from "Dana Whitfield": how a row names its owner. */
export function firstNameOf(name: string | null | undefined): string | null {
    const first = (name ?? '').trim().split(/\s+/)[0]
    return first || null
}
