/**
 * The RAID log (.claude/plans/brio-features-round-2.md, §9): Risks, Assumptions, Issues and Decisions
 * for one engagement, internal only. What the tab, the Overview card and /tour share: the shapes the
 * route answers, the words for each type, status and source, and the pure helpers that filter and count.
 *
 * Safe to import from client components: no database, no SDK.
 */

import type { StatusStage } from '@/lib/ui/status'

/** What RAID stands for, in one line: the Overview card's hint and the website's RAID info tip. */
export const RAID_MEANING =
    'Risks, Assumptions, Issues and Decisions: what could go wrong, what the plan relies on, what has gone wrong, and what people agreed.'

export type RaidType = 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DECISION'
export type RaidStatus = 'SUGGESTED' | 'OPEN' | 'CLOSED' | 'RECORDED' | 'DISMISSED'
export type RaidSourceKind = 'STATUS' | 'HEALTH' | 'BOARD' | 'THREAD' | 'MEMO' | 'MANUAL'

export const RAID_TYPES: readonly RaidType[] = ['RISK', 'ASSUMPTION', 'ISSUE', 'DECISION']

export const RAID_TYPE_LETTER: Record<RaidType, string> = { RISK: 'R', ASSUMPTION: 'A', ISSUE: 'I', DECISION: 'D' }

/**
 * Each type's color, from the Board's own stages (lib/ui/status.ts), so the log uses the colors the app
 * already uses for state and adds none (Deepak, 2026-11-14): a risk might happen (waiting, amber), an
 * assumption is held for now (underway, blue), an issue is happening (problem, red), a decision is
 * settled (done, green).
 */
export const RAID_TYPE_STAGE: Record<RaidType, StatusStage> = { RISK: 'waiting', ASSUMPTION: 'underway', ISSUE: 'problem', DECISION: 'done' }
export const RAID_TYPE_LABEL: Record<RaidType, string> = { RISK: 'Risk', ASSUMPTION: 'Assumption', ISSUE: 'Issue', DECISION: 'Decision' }
export const RAID_TYPE_PLURAL: Record<RaidType, string> = { RISK: 'Risks', ASSUMPTION: 'Assumptions', ISSUE: 'Issues', DECISION: 'Decisions' }

export const RAID_STATUS_LABEL: Record<RaidStatus, string> = {
    SUGGESTED: 'Suggested',
    OPEN: 'Open',
    CLOSED: 'Closed',
    RECORDED: 'Recorded',
    DISMISSED: 'Dismissed',
}

/** Kept current from the engagement's own signals, free: no person or model wrote them. */
export function isAutoSource(kind: RaidSourceKind): boolean {
    return kind === 'STATUS' || kind === 'HEALTH' || kind === 'BOARD'
}

/** A decision is recorded rather than opened; everything else opens. */
export function liveStatusFor(type: RaidType): 'OPEN' | 'RECORDED' {
    return type === 'DECISION' ? 'RECORDED' : 'OPEN'
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
        case 'approved': return 'From the Board'
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
    /** An Issue about a deliverable past its due date: shown in the danger tone. */
    overdue: boolean
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

/** The status pill's tone: waiting for open, danger for an overdue issue, done for closed, neutral blue for a decision. */
export function raidTone(item: Pick<RaidItemView, 'status' | 'type' | 'overdue'>): RaidTone {
    if (item.status === 'CLOSED' || item.status === 'DISMISSED') return 'closed'
    if (item.status === 'RECORDED') return 'recorded'
    if (item.status === 'SUGGESTED') return 'suggested'
    return item.type === 'ISSUE' && item.overdue ? 'late' : 'open'
}

export type RaidTypeFilter = RaidType | 'ALL'
export type RaidStateFilter = 'open' | 'closed'

function inState(item: Pick<RaidItemView, 'status'>, state: RaidStateFilter): boolean {
    return state === 'open' ? isLive(item) : item.status === 'CLOSED'
}

/** The table's rows for a type and Open or Closed, newest first. */
export function filterRaidItems<T extends Pick<RaidItemView, 'status' | 'type' | 'raisedAt'>>(
    items: readonly T[],
    type: RaidTypeFilter,
    state: RaidStateFilter,
): T[] {
    return items
        .filter((i) => inState(i, state) && (type === 'ALL' || i.type === type))
        .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
}

/** The counts beside each type filter, for Open or Closed. */
export function raidCountsByType(items: readonly Pick<RaidItemView, 'status' | 'type'>[], state: RaidStateFilter): Record<RaidTypeFilter, number> {
    const counts: Record<RaidTypeFilter, number> = { ALL: 0, RISK: 0, ASSUMPTION: 0, ISSUE: 0, DECISION: 0 }
    for (const i of items) {
        if (!inState(i, state)) continue
        counts.ALL += 1
        counts[i.type] += 1
    }
    return counts
}

/** Issues before risks before assumptions: what a reader acts on first. */
const OVERVIEW_ORDER: Record<RaidType, number> = { ISSUE: 0, RISK: 1, ASSUMPTION: 2, DECISION: 3 }

export interface RaidOverview {
    counts: { openRisks: number; assumptions: number; openIssues: number; decisions: number }
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
    const raised = live
        .filter((i) => i.status === 'OPEN' && i.type !== 'DECISION')
        .sort((a, b) => (OVERVIEW_ORDER[a.type] - OVERVIEW_ORDER[b.type]) || b.raisedAt.localeCompare(a.raisedAt))
    const open = raised.slice(0, Math.max(0, maxRows - (latestDecision ? 1 : 0)))
    return {
        counts: {
            openRisks: live.filter((i) => i.type === 'RISK' && i.status === 'OPEN').length,
            assumptions: live.filter((i) => i.type === 'ASSUMPTION' && i.status === 'OPEN').length,
            openIssues: live.filter((i) => i.type === 'ISSUE' && i.status === 'OPEN').length,
            decisions: live.filter((i) => i.type === 'DECISION').length,
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
    counts: { openIssues: number; openRisks: number; /** Engagements with at least one open. */ engagements: number }
    rows: FirmRaidRow[]
    /** Open but not sent, past FIRM_RAID_MAX_ROWS: "and 2 more, in their engagements' RAID logs". */
    more: number
}

/** "Dana" from "Dana Whitfield": how a row names its owner. */
export function firstNameOf(name: string | null | undefined): string | null {
    const first = (name ?? '').trim().split(/\s+/)[0]
    return first || null
}
