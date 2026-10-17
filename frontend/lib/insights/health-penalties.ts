/**
 * Pieces of the engagement Overall Health Score that more than one place needs to agree on.
 * Pure, so the server that scores and the page that shows the Action Center count the same way.
 */

/** Points per overdue deliverable, and the most they can take off together. */
const OVERDUE_DELIVERABLE_POINTS = 15
const OVERDUE_DELIVERABLE_CAP = 45

/**
 * The Overall Health Score's deduction for deliverables past their due date and not approved.
 *
 * A deliverable is what the client was promised, so a missed one is high severity on its own
 * (15 points reads as "High" in the deductions list). Until this was added only overdue
 * documents and an overdue engagement counted, and a page could say "90 Healthy" while its only
 * deliverable was late.
 */
export function overdueDeliverablesPenalty(overdueCount: number): { label: string; points: number } | null {
    if (overdueCount <= 0) return null
    return {
        label: `${overdueCount} overdue deliverable${overdueCount === 1 ? '' : 's'}`,
        points: Math.min(OVERDUE_DELIVERABLE_CAP, overdueCount * OVERDUE_DELIVERABLE_POINTS),
    }
}

/** The planning-hygiene counts the gap count is worked out from. */
export interface PlanningCoverage {
    deliverableTotal: number
    deliverableWithDueDate: number
    docTotal: number
    docWithDueDate: number
    docWithAssignee: number
}

/**
 * How many planning fields are missing on in-flight work: deliverable due dates, document due
 * dates and document assignees. The Action Center's "Planning gaps" row and the health score's
 * "Planning gaps (N missing)" deduction both show this number, so they always match.
 */
export function planningGapCount(ph: PlanningCoverage | null | undefined): number {
    if (!ph) return 0
    return Math.max(0,
        (ph.deliverableTotal - ph.deliverableWithDueDate)
        + (ph.docTotal - ph.docWithDueDate)
        + (ph.docTotal - ph.docWithAssignee))
}
