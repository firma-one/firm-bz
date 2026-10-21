import { paceStage, paceStatus } from './pace'
import type { StatusStage } from '@/lib/ui/status'
import type { TagColor } from '@/lib/ui/status-colors'

/**
 * One active engagement on the Firm Overview's list (.claude/plans/firm-overview-redesign.md).
 * Cheap counts, not the engagement's full Health Score: that one lists Drive folders, too slow to
 * run for every engagement on each load.
 */
export interface FirmEngagementRow {
    engagementId: string
    name: string
    slug: string
    clientName: string
    clientSlug: string
    /** Kickoff, or when the engagement was created. */
    startDate: string | null
    dueDate: string | null
    lead: { name: string; avatarUrl: string | null } | null
    deliverables: { total: number; toDo: number; inProgress: number; inReview: number; approved: number; overdue: number }
}

export type PaceKey = 'overdue' | 'behind' | 'slightly_behind' | 'on_pace' | 'no_deliverables' | 'no_due_date'

/** Worst first: the order of the list and of the Engagements card's bar. */
export const PACE_ORDER: PaceKey[] = ['overdue', 'behind', 'slightly_behind', 'on_pace', 'no_deliverables', 'no_due_date']

/**
 * Each key's label, and its stage in the status language (lib/insights/pace.ts paceStage): past due is
 * the only red, behind is Waiting, on pace is Done, and "can't judge yet" is Not started. `tag` is the
 * older Notion tag color, kept for the marketing site's static mocks.
 */
export const PACE_META: Record<PaceKey, { label: string; tag: TagColor; stage: StatusStage }> = {
    overdue: { label: 'Overdue', tag: 'red', stage: 'problem' },
    behind: { label: 'Behind pace', tag: 'orange', stage: paceStage('red') },
    slightly_behind: { label: 'Slightly behind', tag: 'yellow', stage: paceStage('yellow') },
    on_pace: { label: 'On pace', tag: 'green', stage: paceStage('green') },
    no_deliverables: { label: 'No deliverables yet', tag: 'gray', stage: 'not-started' },
    no_due_date: { label: 'No due date', tag: 'gray', stage: 'not-started' },
}

export interface EngagementPace {
    key: PaceKey
    /** Share of the timeline gone, 0–100; null without a start and a due date. */
    timePct: number | null
    /** Share of deliverables approved, 0–100; null with none. */
    deliveredPct: number | null
    /** Whole days to the due date, negative when overdue; null without one. */
    daysLeft: number | null
}

const DAY_MS = 86400000
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }

/**
 * How an engagement is tracking: overdue when past its due date; otherwise the engagement
 * Overview's pace rule (deliverables approved against time used); otherwise why it can't say.
 */
export function engagementPace(row: FirmEngagementRow, nowMs: number): EngagementPace {
    const { total, approved } = row.deliverables
    const deliveredPct = total > 0 ? Math.round((approved / total) * 100) : null
    const dueMs = row.dueDate ? new Date(row.dueDate).getTime() : null
    const startMs = row.startDate ? new Date(row.startDate).getTime() : null
    const daysLeft = dueMs != null ? Math.round((startOfDay(dueMs) - startOfDay(nowMs)) / DAY_MS) : null
    const timePct = dueMs != null && startMs != null && dueMs > startMs
        ? Math.max(0, Math.min(100, Math.round(((nowMs - startMs) / (dueMs - startMs)) * 100)))
        : null

    let key: PaceKey
    if (daysLeft != null && daysLeft < 0) key = 'overdue'
    else if (dueMs == null) key = 'no_due_date'
    else if (deliveredPct == null) key = 'no_deliverables'
    else {
        const { color } = paceStatus(deliveredPct, timePct ?? 0)
        key = color === 'green' ? 'on_pace' : color === 'yellow' ? 'slightly_behind' : 'behind'
    }
    return { key, timePct, deliveredPct, daysLeft }
}

/** Worst first; within a group, the soonest due date first. */
export function sortByPace(rows: FirmEngagementRow[], nowMs: number): Array<FirmEngagementRow & { pace: EngagementPace }> {
    return rows
        .map((r) => ({ ...r, pace: engagementPace(r, nowMs) }))
        .sort((a, b) => {
            const byPace = PACE_ORDER.indexOf(a.pace.key) - PACE_ORDER.indexOf(b.pace.key)
            if (byPace !== 0) return byPace
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
            return ad - bd || a.name.localeCompare(b.name)
        })
}

/** How many engagements are in each pace group. */
export function countByPace(rows: FirmEngagementRow[], nowMs: number): Record<PaceKey, number> {
    const counts = Object.fromEntries(PACE_ORDER.map((k) => [k, 0])) as Record<PaceKey, number>
    for (const r of rows) counts[engagementPace(r, nowMs).key]++
    return counts
}
