import 'server-only'
import { ConnectorType, EngagementRole, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnector, resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { markSharesRevoked, revokeSharePermissions, SHARE_TO_REVOKE_SELECT } from '@/lib/connectors/revoke-share-permissions'

/**
 * Taking back, now and in the request, the storage permissions a secure open granted Limited Access
 * contributors and Reviewers: on demoting a deliverable (decision 5) and on making a document internal
 * only. Done here rather than by an event, because an event can be dropped and the person must be told
 * what still stands.
 *
 * Every row matched with a permission id is revoked through the connector it was granted on. Each is
 * then marked revoked in Firma; a permission storage wouldn't give up keeps its id on its row, so a later
 * revoke retries it, and the caller must not delete that row.
 */

const CLIENT_ROLES: EngagementRole[] = [EngagementRole.eng_ext_collaborator, EngagementRole.eng_viewer]

export interface TakeBackOutcome {
    /** Rows whose permission still stands in storage: keep them. */
    kept: string[]
    /** How many people still have access in storage. */
    peopleStillHolding: number
    /** "2 people still have access in storage · Google Drive refused to take it back. …"; null when all of it was taken back. */
    stillHolding: string | null
}

export async function takeBackClientAccess(
    engagementId: string,
    where: Prisma.EngagementDocumentSharingUserWhereInput,
): Promise<TakeBackOutcome> {
    const shares = await prisma.engagementDocumentSharingUser.findMany({
        where: { AND: [where, { connectorPermissionId: { not: null } }, { member: { role: { in: CLIENT_ROLES } } }] },
        select: { ...SHARE_TO_REVOKE_SELECT, userId: true },
    })
    if (shares.length === 0) return { kept: [], peopleStillHolding: 0, stillHolding: null }

    const outcome = await revokeSharePermissions(engagementId, shares)
    const kept = new Set(outcome.failed)
    // Permissions with no connector left to go through stand all the same. (The revoke counts them among
    // `failed` now; this keeps them whichever way it counts.)
    if (outcome.unreachable > 0) {
        for (const share of shares) {
            if (kept.has(share.id) || !share.document?.externalId) continue
            const connectorId = await resolveEngagementConnectorId(engagementId, share.document.connectorId)
            if (!connectorId || !(await getPermissionAdapter(connectorId))) kept.add(share.id)
        }
    }
    await markSharesRevoked({ id: { in: shares.map((s) => s.id) } }, Array.from(kept))

    const people = new Set(shares.filter((s) => kept.has(s.id)).map((s) => s.userId)).size
    if (people === 0) return { kept: [], peopleStillHolding: 0, stillHolding: null }

    const connector = await resolveEngagementConnector(engagementId).catch(() => null)
    const provider = connector?.type === ConnectorType.ONEDRIVE ? 'OneDrive' : 'Google Drive'
    const who = people === 1 ? '1 person still has' : `${people} people still have`
    // Storage's own reason when it gave one (a StorageFailure's words), else that it refused.
    const refusedIds = outcome.failed.length > outcome.unreachable ? outcome.failed : []
    const said = refusedIds.map((id) => outcome.reasons?.[id]).find((r) => r && r !== 'The storage refused to remove it.' && r !== "Couldn't reach the storage.")
    const why = refusedIds.length > 0
        ? said ?? `${provider} refused to take it back. Remove their access in ${provider}.`
        : 'No storage is connected to take it back.'
    return { kept: Array.from(kept), peopleStillHolding: people, stillHolding: `${who} access in storage · ${why}` }
}
