'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { logger } from '@/lib/logger'

/**
 * Single authoritative entry point for permanently removing a connector.
 *
 * Cleanup order (must run before the connector row is deleted):
 *   1. engagement_documents.connectorId → null  (no FK cascade; was a gap in prior paths)
 *   2. engagement.connectorRootFolderId  → null
 *   3. client.connectorId + driveFolderId → null
 *   4. firm.firmFolderId                 → null
 *   5. connector row deleted             (DB cascade handles any residual Firm/Client FK SET NULL)
 *
 * Auth: the calling user must be an authenticated member of the firm that owns this connector.
 * The firmId is resolved from the connector row — callers do NOT pass it, preventing cross-firm mistakes.
 *
 * All other removal functions (removeFirmConnector, removeClientConnector, DELETE /api/connectors)
 * must delegate here rather than implementing their own cleanup.
 */
export async function removeConnector({ connectorId }: { connectorId: string }): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { firmId: true, userId: true },
    })
    if (!connector) {
        logger.warn('[removeConnector] Connector not found', `connectorId:${connectorId}`)
        throw new Error('Connector not found')
    }

    if (connector.firmId) {
        const membership = await prisma.firmMember.findFirst({
            where: { firmId: connector.firmId, userId: user.id },
            select: { role: true },
        })
        if (!membership) {
            logger.warn('[removeConnector] Unauthorized — user is not a member of the owning firm', `connectorId:${connectorId} userId:${user.id} firmId:${connector.firmId}`)
            throw new Error('Unauthorized')
        }
    } else {
        // firmId was nulled (e.g. by a replace-connector revoke). Only the connector's direct owner may delete it.
        logger.warn('[removeConnector] Connector has no firmId — falling back to ownership check', `connectorId:${connectorId} ownerId:${connector.userId} requestingUserId:${user.id}`)
        if (connector.userId !== user.id) {
            logger.warn('[removeConnector] Unauthorized — user is not the connector owner', `connectorId:${connectorId}`)
            throw new Error('Unauthorized')
        }
    }

    // --- Gather IDs needed for cascading cleanup ---

    const linkedClients = await prisma.client.findMany({
        where: { connectorId },
        select: { id: true },
    })
    const clientIds = linkedClients.map(c => c.id)
    logger.warn('[removeConnector] Starting removal', `connectorId:${connectorId} firmId:${connector.firmId ?? 'null'} clientCount:${clientIds.length}`)

    // --- Null all connector-owned folder/permission references ---

    // engagement_documents.connectorId — filter directly by connectorId (precise, avoids cross-connector pollution)
    await prisma.engagementDocument.updateMany({
        where: { connectorId },
        data: { connectorId: null },
    })
    logger.warn('[removeConnector] Cleared engagementDocument.connectorId', `connectorId:${connectorId}`)

    // engagement.connectorRootFolderId — only currently-linked clients; previously-unlinked clients
    // are already cleaned up by detachConnectorFromClient at unlink time
    if (clientIds.length > 0) {
        await prisma.engagement.updateMany({
            where: { clientId: { in: clientIds } },
            data: { connectorRootFolderId: null },
        })
        logger.warn('[removeConnector] Cleared engagement.connectorRootFolderId', `clientCount:${clientIds.length}`)
    }

    // client.connectorId + client.driveFolderId
    await prisma.client.updateMany({
        where: { connectorId },
        data: { connectorId: null, driveFolderId: null },
    })
    logger.warn('[removeConnector] Cleared client.connectorId + driveFolderId', `connectorId:${connectorId}`)

    // firm.firmFolderId — skip if firmId was already nulled
    if (connector.firmId) {
        await prisma.firm.update({
            where: { id: connector.firmId },
            data: { firmFolderId: null },
        })
        logger.warn('[removeConnector] Cleared firm.firmFolderId', `firmId:${connector.firmId}`)
    }

    // Delete the connector row
    await prisma.connector.delete({ where: { id: connectorId } })
    logger.warn('[removeConnector] Connector row deleted', `connectorId:${connectorId}`)

    if (connector.firmId) {
        audit(AUDIT_EVENT.STORAGE_CONNECTOR_DETACHED)
            .scope(AUDIT_SCOPE.FIRM)
            .firm(connector.firmId)
            .actor(user.id)
            .meta({ connectorId, action: 'remove' })
            .fireAndForget()
    }

    revalidatePath('/d/f')
}
