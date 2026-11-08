import 'server-only'
import { DocumentSharingPermissionStatus, EngagementRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { takeBackClientAccess, type TakeBackOutcome } from '@/lib/files/take-back-client-access'
import { STAGE_ROLE_MAP } from '@/lib/deliverable-stage-roles'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { buildSettingsForDb, documentStage, getLock, parseSettingsFromDb, privateSubtreeIds } from '@/lib/sharing-settings'

/**
 * Making a document internal only, and removing that. Stored as a `private` lock, it hides the document
 * from Limited Access contributors and Reviewers on every path (privateSubtreeIds); Leads and Full Access
 * contributors still see it. It isn't a storage move: nothing changes in Drive except that any permission
 * those roles were granted for it is taken back.
 *
 * It's offered only for what's inside a deliverable. Those roles only ever reach files through a
 * deliverable, so outside one the mark would hide nothing. A mark already outside one can still be removed,
 * and keeps a file hidden if it's moved into a deliverable.
 *
 * A document already shared can't be made internal only (they have it; the label would promise something
 * untrue), so that is refused, as it is in the ⋮ menu.
 */

export interface PrivacyRow {
    id: string
    externalId: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
}

const CLIENT_ROLES: EngagementRole[] = [EngagementRole.eng_ext_collaborator, EngagementRole.eng_viewer]

export function loadPrivacyRows(engagementId: string): Promise<PrivacyRow[]> {
    return prisma.engagementDocument.findMany({
        where: { engagementId },
        select: { id: true, externalId: true, parentId: true, isFolder: true, settings: true },
    })
}

/** The row and everything inside it. Bounded by `seen`: a cycle in provider data must not hang the request. */
function subtreeOf(rows: PrivacyRow[], root: PrivacyRow): PrivacyRow[] {
    const childrenOf = new Map<string, PrivacyRow[]>()
    for (const row of rows) {
        if (row.parentId) childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row])
    }
    const seen = new Map<string, PrivacyRow>()
    const pending = [root]
    while (pending.length > 0) {
        const row = pending.pop() as PrivacyRow
        if (seen.has(row.id)) continue
        seen.set(row.id, row)
        pending.push(...(childrenOf.get(row.externalId) ?? []))
    }
    return Array.from(seen.values())
}

/** The document's own sharing with clients (a legacy row keeps it at the top level of its settings). */
function isSharedWithClients(settings: unknown): boolean {
    const s = (settings ?? {}) as { share?: { externalCollaborator?: { enabled?: boolean }; guest?: { enabled?: boolean } }; externalCollaborator?: boolean; guest?: boolean }
    return s.share?.externalCollaborator?.enabled === true || s.share?.guest?.enabled === true || s.externalCollaborator === true || s.guest === true
}

/** Why this change can't be made, in words for the person making it; null when it can. */
export async function whyPrivacyRefused(
    engagementId: string,
    doc: PrivacyRow,
    makePrivate: boolean,
    rows: PrivacyRow[],
): Promise<string | null> {
    const deliverable = await deliverableOf(engagementId, doc.parentId)
    const deliverableRow = deliverable ? rows.find((r) => r.id === deliverable.id) : null
    if (deliverableRow && parseSettingsFromDb(deliverableRow.settings).share?.finalizedAt) return 'Approved deliverables cannot be reorganized.'
    if (!makePrivate) return null
    // Looked up from its parent, so a deliverable's own folder is refused too: its card is meant to be seen.
    if (!deliverable) return 'Only files and folders inside a deliverable can be made internal only.'

    const lock = getLock(doc.settings)
    if (lock?.type === 'finalize') return "A finalized document can't be made internal only. Return it to draft first."
    if (lock?.type === 'intake') return "A document pending review can't be made internal only."
    if (isSharedWithClients(doc.settings)) return "A shared document can't be made internal only. Turn off sharing first."
    if (subtreeOf(rows, doc).some((r) => isSharedWithClients(r.settings))) return 'This folder holds shared documents. Turn off their sharing first.'
    return null
}

/**
 * Takes the document, and all it holds, back from clients: their sharing rows are revoked, and any
 * storage permission a secure open granted them is revoked here, in the request (AC-12). It used to be
 * left to an event, which can be dropped, and a retry found "already internal only" and stopped.
 *
 * Safe to run again: a permission storage wouldn't give up keeps its id, so running this on a document
 * already internal only finishes the job. Says how many people still have access when it couldn't.
 */
export async function withdrawClientAccess(
    engagementId: string,
    doc: PrivacyRow,
    rows: PrivacyRow[],
    actorUserId: string,
): Promise<TakeBackOutcome> {
    const ids = subtreeOf(rows, doc).map((r) => r.id)
    await prisma.engagementDocumentSharingUser.updateMany({
        where: {
            projectDocumentId: { in: ids },
            sharingPermissionStatus: { in: [DocumentSharingPermissionStatus.GRANTED, DocumentSharingPermissionStatus.INHERITED] },
            member: { role: { in: CLIENT_ROLES } },
        },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED, updatedBy: actorUserId },
    })
    // Every client row still holding a permission id, whatever its status: a retry takes back what an
    // earlier try couldn't.
    return takeBackClientAccess(engagementId, { projectDocumentId: { in: ids } })
}

/**
 * Puts the document, and all it holds that isn't private itself, back where its stage would have it:
 * a move made while it was private opened it to nobody, so the roles its stage opens are opened now.
 * Rows taken back when it was made private return for the roles its deliverable still shares with.
 * Outside a deliverable there's nothing to restore: a loose file's stage never shares it.
 */
export async function restoreClientAccess(engagementId: string, doc: PrivacyRow, actorUserId: string): Promise<void> {
    const deliverable = await deliverableOf(engagementId, doc.parentId)
    if (!deliverable) return
    const rows = await loadPrivacyRows(engagementId)
    const root = rows.find((r) => r.id === doc.id)
    if (!root) return
    const stillPrivate = privateSubtreeIds(rows)
    const targets = subtreeOf(rows, root).filter((r) => !stillPrivate.has(r.externalId))

    const deliverableShare = parseSettingsFromDb(rows.find((r) => r.id === deliverable.id)?.settings).share
    const sharedRoles: EngagementRole[] = [
        ...(deliverableShare?.externalCollaborator?.enabled ? [EngagementRole.eng_ext_collaborator] : []),
        ...(deliverableShare?.guest?.enabled ? [EngagementRole.eng_viewer] : []),
    ]
    if (sharedRoles.length > 0) {
        await prisma.engagementDocumentSharingUser.updateMany({
            where: {
                projectDocumentId: { in: targets.map((r) => r.id) },
                sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                member: { role: { in: sharedRoles } },
            },
            data: { sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED, connectorPermissionId: null, updatedBy: actorUserId },
        })
    }

    for (const row of targets) {
        if (row.isFolder) continue
        const opens = STAGE_ROLE_MAP[documentStage(row.settings)]
        if (!opens.ecEnabled && !opens.evEnabled) continue
        const share: Record<string, unknown> = {}
        if (opens.ecEnabled) share.externalCollaborator = { enabled: true }
        if (opens.evEnabled) share.guest = { enabled: true }
        await prisma.engagementDocument.update({
            where: { id: row.id },
            data: { settings: buildSettingsForDb(row.settings as Record<string, unknown>, { share: share as never }) as object, updatedAt: new Date() },
        })
        await syncDocumentSharingUsers(row.id, actorUserId)
    }
}
