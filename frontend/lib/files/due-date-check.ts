import 'server-only'
import { prisma } from '@/lib/prisma'
import { documentStage, parseSettingsFromDb } from '@/lib/sharing-settings'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { isLaterDay, type DueConflict, type DueFix, type DueNamed } from '@/lib/files/due-date-rule'

/**
 * Checking a due date against the rule (.claude/plans/due-date-rule.md): a document no later than
 * its deliverable, a deliverable no later than its engagement, by calendar day, approved work left
 * out. Returns the first conflict, or, once the caller has chosen fixes, the other dates those
 * fixes change.
 */

export interface DueTarget {
    id: string
    externalId: string
    parentId: string | null
    isFolder: boolean
    fileName: string
    docId: string | null
    settings: unknown
}

export interface DuePlan {
    conflict: DueConflict | null
    /** Other documents (or the deliverable) whose due date the chosen fixes change. */
    documents: { id: string; due: Date }[]
    /** The engagement's new due date, when the chosen fix moves it. */
    engagementDue: Date | null
}

const named = (row: { id: string; docId: string | null; fileName: string }): DueNamed => ({ id: row.id, docId: row.docId, name: row.fileName })

const isDeliverableFolder = (row: { isFolder: boolean; settings: unknown }) => row.isFolder && !!parseSettingsFromDb(row.settings).share?.createdAt

/** A deliverable is approved by its stored stage; a document by its own. */
const isApproved = (row: { isFolder: boolean; settings: unknown }) =>
    (row.isFolder ? parseSettingsFromDb(row.settings).activity?.status : documentStage(row.settings)) === 'approved'

/** The deliverable's documents with a due date, not approved: the ones the rule weighs. */
async function datedDocumentsOf(engagementId: string, deliverableExternalId: string) {
    const rows = (await prisma.$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId", "isFolder", "fileName", "docId", "dueDate", settings, 1 AS depth
           FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId", ed."isFolder", ed."fileName", ed."docId", ed."dueDate", ed.settings, d.depth + 1
           FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid AND d.depth < 50
         )
         SELECT id, "fileName", "docId", "dueDate", settings FROM descendants
         WHERE "isFolder" = false AND "dueDate" IS NOT NULL`,
        deliverableExternalId,
        engagementId,
    )) as { id: string; fileName: string; docId: string | null; dueDate: Date; settings: unknown }[]
    return rows.filter((r) => documentStage(r.settings) !== 'approved')
}

export async function planDueDate(engagementId: string, target: DueTarget, proposed: Date | null, fixes: readonly DueFix[]): Promise<DuePlan> {
    const plan: DuePlan = { conflict: null, documents: [], engagementDue: null }
    // Clearing a date never breaks the rule; approved work no longer counts.
    if (!proposed || isApproved(target)) return plan

    const engagement = await prisma.engagement.findUnique({ where: { id: engagementId }, select: { id: true, name: true, dueDate: true } })
    const proposedIso = proposed.toISOString()

    /** The deliverable at `due` against its engagement. */
    const checkEngagement = (deliverable: DueNamed, due: Date): DueConflict | null => {
        if (!engagement?.dueDate || !isLaterDay(due, engagement.dueDate)) return null
        if (fixes.includes('move_engagement')) {
            plan.engagementDue = due
            return null
        }
        return { kind: 'after_engagement', proposed: due.toISOString(), deliverable, engagement: { id: engagement.id, name: engagement.name, due: engagement.dueDate.toISOString() } }
    }

    if (isDeliverableFolder(target)) {
        const later = (await datedDocumentsOf(engagementId, target.externalId)).filter((d) => isLaterDay(d.dueDate, proposed))
        if (later.length > 0) {
            if (fixes.includes('pull_documents')) {
                plan.documents.push(...later.map((d) => ({ id: d.id, due: proposed })))
            } else {
                const latest = later.reduce((a, b) => (b.dueDate > a.dueDate ? b : a))
                plan.conflict = {
                    kind: 'before_documents',
                    proposed: proposedIso,
                    deliverable: named(target),
                    latest: { ...named(latest), due: latest.dueDate.toISOString() },
                    count: later.length,
                }
                return plan
            }
        }
        plan.conflict = checkEngagement(named(target), proposed)
        return plan
    }

    if (target.isFolder) return plan // a folder inside a deliverable has no due date of its own to weigh

    const ref = await deliverableOf(engagementId, target.parentId)
    if (!ref) return plan // outside any deliverable, a document is free
    const deliverable = await prisma.engagementDocument.findUnique({
        where: { id: ref.id },
        select: { id: true, fileName: true, docId: true, dueDate: true, isFolder: true, settings: true },
    })
    if (!deliverable?.dueDate || isApproved(deliverable) || !isLaterDay(proposed, deliverable.dueDate)) return plan

    if (!fixes.includes('move_deliverable')) {
        plan.conflict = {
            kind: 'after_deliverable',
            proposed: proposedIso,
            document: named(target),
            deliverable: { ...named(deliverable), due: deliverable.dueDate.toISOString() },
        }
        return plan
    }
    // Moving the deliverable later never puts it before its documents; it may pass the engagement.
    plan.documents.push({ id: deliverable.id, due: proposed })
    plan.conflict = checkEngagement(named(deliverable), proposed)
    return plan
}

/**
 * The engagement's own due date can't fall before one of its deliverables (approved ones left out).
 * Returns the deliverable that would be due after it, or null.
 */
export async function deliverableDueAfter(engagementId: string, proposed: Date): Promise<(DueNamed & { due: string }) | null> {
    const rows = await prisma.engagementDocument.findMany({
        where: { engagementId, isFolder: true, dueDate: { not: null } },
        select: { id: true, fileName: true, docId: true, dueDate: true, isFolder: true, settings: true },
    })
    const later = rows
        .filter((r) => isDeliverableFolder(r) && !isApproved(r) && r.dueDate && isLaterDay(r.dueDate, proposed))
        .sort((a, b) => b.dueDate!.getTime() - a.dueDate!.getTime())
    const latest = later[0]
    return latest ? { ...named(latest), due: latest.dueDate!.toISOString() } : null
}
