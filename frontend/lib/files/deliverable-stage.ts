import 'server-only'
import { prisma } from '@/lib/prisma'
import { documentStage, type ActivityStatus } from '@/lib/sharing-settings'
import { deriveDeliverableStage } from '@/lib/deliverable-derivation'
import { accessWidenedBy, applyStageChange, currentStageOf, type StageMoveContext, type StageRow } from './apply-stage-change'

/**
 * A deliverable's stage follows its documents (.claude/plans/deliverable-stages-blocked.md, section 2):
 * nobody sets it, it is worked out again whenever one of them moves.
 */

export const STAGE_ROW_SELECT = {
    id: true,
    externalId: true,
    fileName: true,
    settings: true,
    createdBy: true,
    isFolder: true,
    parentId: true,
} as const

export type StageRowWithParent = StageRow & { parentId: string | null }

/** The deliverable's documents, at any depth (folders aren't documents). */
export async function deliverableDocuments(engagementId: string, deliverableExternalId: string): Promise<StageRowWithParent[]> {
    const ids = (await prisma.$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId", "isFolder" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId", ed."isFolder" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
         )
         SELECT id FROM descendants WHERE "isFolder" = false`,
        deliverableExternalId,
        engagementId,
    )) as Array<{ id: string }>
    if (ids.length === 0) return []
    return prisma.engagementDocument.findMany({
        where: { id: { in: ids.map((r) => r.id) } },
        select: STAGE_ROW_SELECT,
    })
}

/** The deliverable's move that its documents' stages call for, and what it would let clients do. */
export interface DerivedMove {
    deliverable: StageRow
    from: ActivityStatus
    to: ActivityStatus
    /** External collaborators would see the deliverable for the first time. */
    externalCollaborators: boolean
    /** Viewers would see it for the first time. */
    viewers: boolean
    /** It would be approved, which locks it. */
    approves: boolean
}

/**
 * Where the deliverable would go were `changes` (document id → stage) made to its documents. Null
 * when it would stay where it is.
 */
export async function derivedMove(
    engagementId: string,
    deliverable: StageRow,
    changes: ReadonlyMap<string, ActivityStatus>,
): Promise<DerivedMove | null> {
    const documents = await deliverableDocuments(engagementId, deliverable.externalId)
    const to = deriveDeliverableStage(documents.map((d) => changes.get(d.id) ?? documentStage(d.settings)))
    const from = currentStageOf(deliverable)
    if (to === from) return null
    return { deliverable, from, to, ...accessWidenedBy(deliverable, to), approves: to === 'approved' }
}

/** A move the person should agree to first: it shows the deliverable to clients, or approves it. */
export function needsConfirmation(move: DerivedMove | null): move is DerivedMove {
    return !!move && (move.externalCollaborators || move.viewers || move.approves)
}

/** What the 409 tells the client, so it can ask in words. */
export function confirmationOf(move: DerivedMove) {
    return {
        deliverable: { id: move.deliverable.id, name: move.deliverable.fileName },
        from: move.from,
        to: move.to,
        externalCollaborators: move.externalCollaborators,
        viewers: move.viewers,
        approves: move.approves,
    }
}

export async function applyDerivedMove(move: DerivedMove, ctx: StageMoveContext): Promise<void> {
    await applyStageChange(move.deliverable, move.to, ctx, { derived: true })
}
