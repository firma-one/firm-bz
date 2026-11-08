import { documentStage, isOnBoard, privateSubtreeIds, type ActivityStatus } from '@/lib/sharing-settings'
import { blockedOf, type BlockedReason } from '@/lib/files/blocked'

/**
 * A deliverable's stage, from its documents' (.claude/plans/deliverable-stages-blocked.md, §2). Only
 * documents on the Board count; Not started ones are left out, and callers leave out Internal only ones
 * too, since they aren't part of what's delivered. Shared by the server, which stores the result, and the
 * panes, which say ahead of a move what it will do to the deliverable.
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

/** A blocked document in a deliverable, for its Board card's "n blocked" chip (firm only). */
export interface BlockedDocument { documentId: string; docId: string | null; fileName: string; reason: BlockedReason }

/**
 * What a deliverable's Board card counts, from everything inside it. Internal only documents don't count
 * toward progress, as they don't toward the stage, but the firm still sees a blocked flag on one.
 */
export function deliverableProgress(
    rows: readonly { id: string; externalId: string; parentId: string | null; isFolder: boolean; fileName: string; docId: string | null; settings: unknown }[],
    isFirm: boolean,
): { total: number; approved: number; blocked: BlockedDocument[] } {
    const privateIds = privateSubtreeIds(rows)
    const documents = rows.filter((r) => !r.isFolder && (isFirm || !privateIds.has(r.externalId)))
    const onBoard = documents.filter((r) => !privateIds.has(r.externalId) && isOnBoard(documentStage(r.settings)))
    return {
        total: onBoard.length,
        approved: onBoard.filter((r) => documentStage(r.settings) === 'approved').length,
        blocked: isFirm
            ? documents.flatMap((r) => {
                const flag = blockedOf(r.settings)
                return flag ? [{ documentId: r.id, docId: r.docId ?? null, fileName: r.fileName, reason: flag.reason }] : []
            })
            : [],
    }
}
