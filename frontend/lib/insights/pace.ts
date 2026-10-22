import type { StatusStage } from '@/lib/ui/status'

/**
 * Delivered against time used: how far behind the share of deliverables approved is the share of
 * the timeline gone. One rule for the engagement Overview's Pace chart and the Firm Overview's
 * engagement rows.
 */
export function paceStatus(deliveredPct: number, timePct: number): { text: string; color: 'green' | 'yellow' | 'red' } {
    const gap = timePct - deliveredPct
    if (gap <= 0) return { text: 'On pace', color: 'green' }
    if (gap <= 15) return { text: 'Slightly behind', color: 'yellow' }
    return { text: 'Behind pace', color: 'red' }
}

/**
 * Pace in the status language, the same on the engagement and Firm Overviews: on pace is Done, behind
 * (slightly or not) is Waiting. Red stays for what's past its due date (the firm's Overdue), never for
 * pace alone (.claude/plans/app-design-refinements.md, "Data colors").
 */
export function paceStage(color: 'green' | 'yellow' | 'red'): StatusStage {
    return color === 'green' ? 'done' : 'waiting'
}
