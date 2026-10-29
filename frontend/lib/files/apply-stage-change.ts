import 'server-only'
import { EngagementRole, DocumentSharingPermissionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, documentStage, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { STAGE_ORDER, STAGE_ROLE_MAP } from '@/lib/deliverable-stage-roles'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { getFirmReminderConfig } from '@/lib/firm-reminder-config'
import { createEventNotifications, sendEventEmailToUser, buildAbsoluteUrl } from '@/lib/notify-event'
import { resolveEntity } from '@/lib/reminders/entity-registry'
import { renderDocumentStatusChangedEmail } from '@/lib/email-templates/document-status-changed'

/**
 * A document's or deliverable's move to a new stage, with everything a move does: client access
 * widens on a forward move into a stage that grants it (STAGE_ROLE_MAP) and is never taken back by a
 * backward one; Approved finalizes; the audit trail and the firm's notifications hear of it.
 *
 * Shared by a person's move of a document and the derived move of its deliverable that can follow
 * (lib/files/deliverable-stage.ts), so both behave alike. Lifted unchanged from the stage route.
 */

export interface StageRow {
    id: string
    externalId: string
    fileName: string
    settings: unknown
    createdBy: string | null
    isFolder: boolean
    /** Its Doc ID ("QSR-9"), where loaded: what the move's confirmation names it by. */
    docId?: string | null
}

export interface StageMoveContext {
    projectId: string
    firmId: string
    clientId: string | null
    actorUserId: string
}

/** The row's current stage: a deliverable's as stored (To do by default), a document's Not started by default. */
export function currentStageOf(row: Pick<StageRow, 'settings' | 'isFolder'>): ActivityStatus {
    return row.isFolder ? (parseSettingsFromDb(row.settings).activity?.status ?? 'to_do') : documentStage(row.settings)
}

/** Which client roles a forward move into `next` would newly let in. */
export function accessWidenedBy(row: Pick<StageRow, 'settings' | 'isFolder'>, next: ActivityStatus): { externalCollaborators: boolean; viewers: boolean } {
    const current = currentStageOf(row)
    const parsed = parseSettingsFromDb(row.settings)
    const forward = STAGE_ORDER[next] > STAGE_ORDER[current]
    const stage = STAGE_ROLE_MAP[next]
    return {
        externalCollaborators: forward && stage.ecEnabled && !parsed.share?.externalCollaborator?.enabled,
        viewers: forward && stage.evEnabled && !parsed.share?.guest?.enabled,
    }
}

export async function applyStageChange(
    row: StageRow,
    next: ActivityStatus,
    ctx: StageMoveContext,
    opts: { orderIndex?: number; derived?: boolean; auditMeta?: Record<string, unknown> } = {},
): Promise<{ oldStatus: ActivityStatus }> {
    const { projectId, firmId, clientId, actorUserId } = ctx
    const oldStatus = currentStageOf(row)
    const now = new Date().toISOString()
    const widened = accessWidenedBy(row, next)

    // Only update EC/EV enabled flags on forward moves — once granted, access is never
    // revoked by a backward lane move. Use "Untag as Deliverable" to fully revoke.
    const shareUpdate: Record<string, unknown> = {}
    if (widened.externalCollaborators) shareUpdate.externalCollaborator = { enabled: true }
    if (widened.viewers) shareUpdate.guest = { enabled: true }
    // Set finalizedAt when moving to approved
    const finalizedAt = next === 'approved' ? now : (next !== oldStatus ? null : undefined)

    const settings = buildSettingsForDb(row.settings as Record<string, unknown>, {
        activity: { status: next, updatedAt: now, orderIndex: opts.orderIndex },
        ...(Object.keys(shareUpdate).length > 0 ? { share: shareUpdate as never } : {}),
        ...(finalizedAt !== undefined ? { finalizedAt } : {}),
    })

    await prisma.engagementDocument.update({
        where: { id: row.id },
        data: { settings: settings as object, updatedAt: new Date() },
    })

    // Sync EC/EV sharing rows for the folder and all descendants on forward moves
    if (Object.keys(shareUpdate).length > 0) {
        Promise.resolve().then(async () => {
            try {
                // Folder itself — syncDocumentSharingUsers reads the folder's own settings correctly
                await syncDocumentSharingUsers(row.id, actorUserId)

                // Descendants have empty settings so syncDocumentSharingUsers would no-op on them.
                // Instead, directly insert rows for the newly-enabled roles based on the folder's flags.
                const newlyEnabledRoles: EngagementRole[] = []
                if (shareUpdate.externalCollaborator) newlyEnabledRoles.push(EngagementRole.eng_ext_collaborator)
                if (shareUpdate.guest) newlyEnabledRoles.push(EngagementRole.eng_viewer)
                if (newlyEnabledRoles.length === 0) return

                const members = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, role: { in: newlyEnabledRoles } },
                })
                if (members.length === 0) return

                const descendants = (await prisma.$queryRawUnsafe(
                    `WITH RECURSIVE descendants AS (
                       SELECT id, "externalId" FROM platform.engagement_documents
                       WHERE "parentId" = $1 AND "engagementId" = $2::uuid
                       UNION ALL
                       SELECT ed.id, ed."externalId" FROM platform.engagement_documents ed
                       INNER JOIN descendants d ON ed."parentId" = d."externalId"
                       WHERE ed."engagementId" = $2::uuid
                     )
                     SELECT id FROM descendants`,
                    row.externalId,
                    projectId,
                )) as Array<{ id: string }>

                for (const child of descendants) {
                    for (const member of members) {
                        await prisma.engagementDocumentSharingUser.upsert({
                            where: { projectDocumentId_userId: { projectDocumentId: child.id, userId: member.userId } },
                            update: { sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED, updatedBy: actorUserId },
                            create: {
                                projectDocumentId: child.id,
                                engagementId: projectId,
                                userId: member.userId,
                                sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
                                createdBy: actorUserId,
                                updatedBy: actorUserId,
                            },
                        })
                    }
                }
            } catch (err) {
                console.error('[stage] descendant sync error:', err)
            }
        })
    }

    audit(AUDIT_EVENT.DOCUMENT_STATUS_CHANGED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(firmId)
        .client(clientId)
        .engagement(projectId)
        .document(row.id)
        .actor(actorUserId)
        // `derived`: a deliverable that moved because its documents did, not by anyone's hand.
        .meta({ fileName: row.fileName, oldStatus, newStatus: next, ...(opts.derived ? { derived: true } : {}), ...(opts.auditMeta ?? {}) })
        .fireAndForget()

    // Event notifications — status changed / rejected, gated per-firm via Event Notifications grid
    Promise.resolve().then(async () => {
        try {
            const isRejection = oldStatus === 'in_review' && next === 'in_progress'
            const config = await getFirmReminderConfig(firmId)
            const eventCfg = isRejection ? config.events.documentRejected : config.events.statusChanged
            if (!eventCfg.inApp && !eventCfg.email) return

            const recipientIds = new Set<string>()
            if (isRejection) {
                if (row.createdBy) recipientIds.add(row.createdBy)
            } else {
                const staff = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
                    select: { userId: true },
                })
                staff.forEach((m) => recipientIds.add(m.userId))
            }
            recipientIds.delete(actorUserId) // don't notify the actor of their own change
            if (recipientIds.size === 0) return

            const entityCtx = await resolveEntity('platform.engagements.shares', projectId)
            const ctaUrl = buildAbsoluteUrl(entityCtx?.ctaUrl ?? null)
            const notifType = isRejection ? 'DOCUMENT_REJECTED' : 'DOCUMENT_STATUS_CHANGED'
            const title = isRejection
                ? `Changes requested: "${row.fileName}"`
                : `Status changed to ${next}: "${row.fileName}"`

            if (eventCfg.inApp) {
                await createEventNotifications(Array.from(recipientIds).map((userId) => ({
                    firmId,
                    clientId,
                    engagementId: projectId,
                    documentId: row.id,
                    userId,
                    type: notifType,
                    title,
                    ctaUrl: entityCtx?.ctaUrl ?? null,
                    metadata: { fileName: row.fileName, oldStatus, newStatus: next },
                    dedupeKey: `doc:${row.id}:${notifType}:${next}`,
                })))
            }
            if (eventCfg.email) {
                await Promise.all(Array.from(recipientIds).map((userId) => sendEventEmailToUser(userId, () =>
                    renderDocumentStatusChangedEmail({
                        fileName: row.fileName,
                        engagementName: entityCtx?.name ?? '',
                        oldStatus,
                        newStatus: next,
                        isRejection,
                        ctaUrl,
                    })
                )))
            }
        } catch (e) {
            console.error('[stage] event notification error:', e)
        }
    })

    return { oldStatus }
}
