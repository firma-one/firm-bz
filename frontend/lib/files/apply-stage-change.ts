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
 *
 * A private document moves with `internalOnly` too (lib/files/private-documents.ts puts it where its
 * stage would have it if it's made public).
 *
 * A file outside any deliverable moves with `internalOnly`: its stage is the firm's own tracking, so
 * the move never opens the file to clients and only the firm hears of it.
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

const STAGE_NAMES: Record<ActivityStatus, string> = {
    not_started: 'Not started',
    to_do: 'To do',
    in_progress: 'In progress',
    in_review: 'In review',
    approved: 'Approved',
}

/** Clients couldn't be given what a forward move opens to them, so the move wasn't made (P1-58). */
export class StageAccessError extends Error {
    constructor(readonly stage: ActivityStatus, readonly cause?: unknown) {
        super(`Couldn't move it to ${STAGE_NAMES[stage]} · clients couldn't be given access to what's in it. Try again.`)
        this.name = 'StageAccessError'
    }
}

/**
 * Rows for the roles a move opens it to, on everything inside it (a deliverable's documents and
 * folders), as INHERITED. Not for anything private, nor inside a private folder: the walk stops there.
 * One transaction, so a failure leaves none half written.
 */
async function openDescendantsTo(row: StageRow, roles: EngagementRole[], ctx: StageMoveContext): Promise<void> {
    const { projectId, actorUserId } = ctx
    const members = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: { in: roles } },
    })
    if (members.length === 0) return

    const descendants = (await prisma.$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
             AND COALESCE(settings->'lock'->>'type', settings->>'locked', '') <> 'private'
           UNION ALL
           SELECT ed.id, ed."externalId" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
             AND COALESCE(ed.settings->'lock'->>'type', ed.settings->>'locked', '') <> 'private'
         )
         SELECT id FROM descendants`,
        row.externalId,
        projectId,
    )) as Array<{ id: string }>
    if (descendants.length === 0) return

    const childIds = descendants.map((d) => d.id)
    const userIds = members.map((m) => m.userId)
    // Created where missing, and made INHERITED where they stand: what one upsert per pair did.
    await prisma.$transaction([
        prisma.engagementDocumentSharingUser.createMany({
            data: childIds.flatMap((projectDocumentId) => userIds.map((userId) => ({
                projectDocumentId,
                engagementId: projectId,
                userId,
                sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
                createdBy: actorUserId,
                updatedBy: actorUserId,
            }))),
            skipDuplicates: true,
        }),
        prisma.engagementDocumentSharingUser.updateMany({
            where: { projectDocumentId: { in: childIds }, userId: { in: userIds } },
            data: { sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED, updatedBy: actorUserId },
        }),
    ])
}

export async function applyStageChange(
    row: StageRow,
    next: ActivityStatus,
    ctx: StageMoveContext,
    opts: { orderIndex?: number; derived?: boolean; auditMeta?: Record<string, unknown>; internalOnly?: boolean } = {},
): Promise<{ oldStatus: ActivityStatus }> {
    const { projectId, firmId, clientId, actorUserId } = ctx
    const oldStatus = currentStageOf(row)
    const now = new Date().toISOString()
    const widened = opts.internalOnly ? { externalCollaborators: false, viewers: false } : accessWidenedBy(row, next)

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

    // A forward move into a stage that opens it to clients: what's inside it (a deliverable's
    // documents) gets their rows first, awaited and in one transaction (P1-58). It used to run after
    // the response, logging a failure nobody saw. When it can't be done the move isn't made, so
    // moving it again retries it (the settings below are what mark it opened).
    const newlyEnabledRoles: EngagementRole[] = []
    if (shareUpdate.externalCollaborator) newlyEnabledRoles.push(EngagementRole.eng_ext_collaborator)
    if (shareUpdate.guest) newlyEnabledRoles.push(EngagementRole.eng_viewer)
    if (newlyEnabledRoles.length > 0) {
        try {
            await openDescendantsTo(row, newlyEnabledRoles, ctx)
        } catch (err) {
            console.error('[stage] descendant sync error:', err)
            throw new StageAccessError(next, err)
        }
    }

    await prisma.engagementDocument.update({
        where: { id: row.id },
        data: { settings: settings as object, updatedAt: new Date() },
    })

    // Its own rows, now its settings say who it's open to. (This sync logs its own failures.)
    if (Object.keys(shareUpdate).length > 0) await syncDocumentSharingUsers(row.id, actorUserId)

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

            const staff = await prisma.engagementMember.findMany({
                where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
                select: { userId: true },
            })
            const staffIds = new Set(staff.map((m) => m.userId))
            const recipientIds = new Set<string>()
            if (isRejection) {
                // The firm's own tracking stays with the firm, even when a client added the file.
                if (row.createdBy && (!opts.internalOnly || staffIds.has(row.createdBy))) recipientIds.add(row.createdBy)
            } else {
                staffIds.forEach((id) => recipientIds.add(id))
            }
            recipientIds.delete(actorUserId) // don't notify the actor of their own change
            if (recipientIds.size === 0) return

            const entityCtx = await resolveEntity('platform.engagements.shares', projectId)
            // A file outside any deliverable isn't on the Board: its link goes to it in Files.
            const link = opts.internalOnly
                ? entityCtx?.ctaUrl?.replace(/\/shares$/, `/files#doc-file:${row.id}`) ?? null
                : entityCtx?.ctaUrl ?? null
            const ctaUrl = buildAbsoluteUrl(link)
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
                    ctaUrl: link,
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
