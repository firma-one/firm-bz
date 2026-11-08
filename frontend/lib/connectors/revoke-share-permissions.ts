import { DocumentSharingPermissionStatus, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { logger } from '@/lib/logger'

/**
 * Taking back the Drive permissions a secure open granted, for the revoke jobs (lib/inngest/functions.ts).
 *
 * Each goes through the connector it was granted on: the document's, else its client's, as the regrant
 * route resolves it. Not `Firm.connectorId`, the legacy field, which can be empty or a different Drive
 * when the client has its own.
 *
 * A permission Drive wouldn't give up stays on its row: the row is revoked in Firma all the same, but
 * keeps its id, so the permission isn't forgotten while it still stands and a later revoke retries it.
 * That includes one with no connector left to revoke it through: connecting the storage again lets a
 * later revoke finish it.
 */

/** What a revoke reads from a sharing row. */
export const SHARE_TO_REVOKE_SELECT = {
    id: true,
    connectorPermissionId: true,
    document: { select: { externalId: true, connectorId: true } },
} as const

export interface ShareToRevoke {
    id: string
    connectorPermissionId: string | null
    document: { externalId: string; connectorId: string | null } | null
}

export interface RevokeOutcome {
    revoked: number
    /** The rows whose permission still stands in Drive, including those with no connector left. Their ids stay. */
    failed: string[]
    /** Of those, the permissions with no connector left to revoke them through. */
    unreachable: number
    /** Why each failed row's permission still stands, by row id, in words for people. */
    reasons: Record<string, string>
}

const BATCH_SIZE = 10

export const NO_CONNECTOR_REASON = 'No storage is connected to this client any more. Connect it again so the access can be taken back.'

export async function revokeSharePermissions(engagementId: string, shares: ShareToRevoke[]): Promise<RevokeOutcome> {
    const outcome: RevokeOutcome = { revoked: 0, failed: [], unreachable: 0, reasons: {} }

    const byConnector = new Map<string | null, ShareToRevoke[]>()
    for (const share of shares) {
        if (!share.connectorPermissionId || !share.document?.externalId) continue
        const connectorId = await resolveEngagementConnectorId(engagementId, share.document.connectorId)
        byConnector.set(connectorId, [...(byConnector.get(connectorId) ?? []), share])
    }

    for (const [connectorId, group] of Array.from(byConnector.entries())) {
        const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
        if (!connectorId || !adapter) {
            outcome.unreachable += group.length
            for (const share of group) {
                outcome.failed.push(share.id)
                outcome.reasons[share.id] = NO_CONNECTOR_REASON
            }
            continue
        }
        for (let i = 0; i < group.length; i += BATCH_SIZE) {
            await Promise.all(group.slice(i, i + BATCH_SIZE).map(async (share) => {
                try {
                    if (await adapter.revokePermission(connectorId, share.document!.externalId, share.connectorPermissionId!)) {
                        outcome.revoked++
                        return
                    }
                    outcome.reasons[share.id] = 'The storage refused to remove it.'
                } catch (e) {
                    outcome.reasons[share.id] = e instanceof StorageFailure ? e.message : "Couldn't reach the storage."
                }
                outcome.failed.push(share.id)
            }))
        }
    }

    if (outcome.unreachable > 0) {
        logger.warn('Drive permissions could not be revoked: no connector', { engagementId, count: outcome.unreachable })
    }
    if (outcome.failed.length > outcome.unreachable) {
        logger.error('Drive permissions could not be revoked', new Error('revokePermission failed'), undefined, {
            engagementId,
            count: outcome.failed.length - outcome.unreachable,
            reason: Object.values(outcome.reasons)[0],
        })
    }
    return outcome
}

/**
 * Marks the rows revoked in Firma. Their permission ids are cleared, except those still standing in
 * Drive (`failed`).
 */
export async function markSharesRevoked(where: Prisma.EngagementDocumentSharingUserWhereInput, failed: string[]): Promise<void> {
    await prisma.engagementDocumentSharingUser.updateMany({
        where: { AND: [where, { id: { notIn: failed } }] },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED, connectorPermissionId: null },
    })
    if (failed.length > 0) {
        await prisma.engagementDocumentSharingUser.updateMany({
            where: { id: { in: failed } },
            data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED },
        })
    }
}
