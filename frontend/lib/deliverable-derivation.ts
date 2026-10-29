import { isOnBoard, type ActivityStatus } from '@/lib/sharing-settings'

/**
 * A deliverable's stage, from its documents' (.claude/plans/deliverable-stages-blocked.md, §2). Only
 * documents on the Board count; Not started ones are left out. Shared by the server, which stores the
 * result, and the panes, which say ahead of a move what it will do to the deliverable.
 *
 * 1. none on the Board → To do
 * 2. any In progress → In progress
 * 3. all Approved → Approved
 * 4. all In review → In review
 * 5. all To do → To do
 * 6. any other mix → In progress (work underway, without a fifth "mixed" stage)
 */
export function deriveDeliverableStage(documentStages: readonly ActivityStatus[]): ActivityStatus {
    const tracked = documentStages.filter(isOnBoard)
    if (tracked.length === 0) return 'to_do'
    if (tracked.some((s) => s === 'in_progress')) return 'in_progress'
    if (tracked.every((s) => s === 'approved')) return 'approved'
    if (tracked.every((s) => s === 'in_review')) return 'in_review'
    if (tracked.every((s) => s === 'to_do')) return 'to_do'
    return 'in_progress'
}
