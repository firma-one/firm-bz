import { DocumentSharingPermissionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isExternalEngagementRole } from '@/lib/engagement-access'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { isDocumentFinalized } from '@/lib/sharing-settings'
import { NO_CONNECTOR_REASON } from '@/lib/connectors/revoke-share-permissions'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { logger } from '@/lib/logger'

/** A file permission storage wouldn't change, and why, in words for people. */
export interface FileAccessFailure {
    userId: string
    documentId: string
    fileName: string
    permissionId: string
    reason: string
}

/**
 * A completed engagement is read only for everyone, and this is that on the files themselves: the
 * permission a secure open granted, which stands until it's changed. Reopening gives edit back.
 *
 * It's the other half of setFirmFolderAccess. Limited Access contributors only ever have these (clients
 * get Drive access file by file, never by folder), and a firm member who opened a file through Firma has
 * one as well, which lowering the folder doesn't lower. The regrant route would correct either at the next
 * open through Firma, but not before, and not for someone who goes to Drive directly.
 *
 * Only the role changes, and the row stays as it is: removing the member is what takes access away. Drive
 * won't lower a file's owner, so that counts as a failure here and they keep full access.
 *
 * The event can arrive late, so each change first checks the engagement is still in the status that asked
 * for it, as setFirmFolderAccess does.
 *
 * Answers which permissions storage wouldn't change, and why, so the job can retry and then tell the Leads.
 */

const BATCH_SIZE = 10

export async function setMemberFileAccess(
    projectId: string,
    change: 'read_only' | 'restore',
): Promise<{ changed: number; failed: number; failures: FileAccessFailure[] }> {
    const result = { changed: 0, failed: 0, failures: [] as FileAccessFailure[] }

    const engagement = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { status: true },
    })
    if (!engagement) return result
    if ((engagement.status === 'COMPLETED') !== (change === 'read_only')) return result

    const shares = await prisma.engagementDocumentSharingUser.findMany({
        where: {
            engagementId: projectId,
            connectorPermissionId: { not: null },
            sharingPermissionStatus: { in: [DocumentSharingPermissionStatus.GRANTED, DocumentSharingPermissionStatus.INHERITED] },
            // A Reviewer is read only at every stage.
            member: { role: { not: 'eng_viewer' } },
        },
        select: {
            userId: true,
            connectorPermissionId: true,
            member: { select: { role: true } },
            document: { select: { id: true, fileName: true, externalId: true, connectorId: true, settings: true } },
        },
    })

    // Through the connector it was granted on, as the regrant route resolves it.
    const connectorOf = new Map<string | null, string | null>()
    for (const documentConnectorId of Array.from(new Set(shares.map((s) => s.document.connectorId)))) {
        connectorOf.set(documentConnectorId, await resolveEngagementConnectorId(projectId, documentConnectorId))
    }
    const byConnector = new Map<string | null, typeof shares>()
    for (const share of shares) {
        const connectorId = connectorOf.get(share.document.connectorId) ?? null
        byConnector.set(connectorId, [...(byConnector.get(connectorId) ?? []), share])
    }

    const fail = (share: (typeof shares)[number], reason: string) => {
        result.failed++
        result.failures.push({
            userId: share.userId,
            documentId: share.document.id,
            fileName: share.document.fileName ?? 'a file',
            permissionId: share.connectorPermissionId!,
            reason,
        })
    }

    for (const [connectorId, group] of Array.from(byConnector.entries())) {
        const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
        if (!connectorId || !adapter) {
            for (const share of group) fail(share, NO_CONNECTOR_REASON)
            continue
        }
        const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })

        const toChange = group.filter((share) => {
            // On OneDrive their grant is a view-only link, whatever the engagement's status (see regrant).
            if (connector?.type === 'ONEDRIVE' && isExternalEngagementRole(share.member.role)) return false
            // Finalized stays read only after reopening: Unlock is what lifts that.
            if (change === 'restore' && isDocumentFinalized(share.document.settings)) return false
            return true
        })
        for (let i = 0; i < toChange.length; i += BATCH_SIZE) {
            await Promise.all(toChange.slice(i, i + BATCH_SIZE).map(async (share) => {
                let reason = 'The storage refused the change.'
                const done = await adapter
                    .patchFilePermissionRole(connectorId, share.document.externalId, share.connectorPermissionId!, change === 'read_only' ? 'viewer' : 'editor')
                    .catch((e: unknown) => {
                        reason = e instanceof StorageFailure ? e.message : "Couldn't reach the storage."
                        return false
                    })
                if (done) result.changed++
                else fail(share, reason)
            }))
        }
    }

    if (result.failed > 0) {
        logger.warn(`File access could not be fully changed (${change})`, { projectId, failed: result.failed })
    }
    return result
}
