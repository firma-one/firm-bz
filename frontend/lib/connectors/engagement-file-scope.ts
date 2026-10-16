import 'server-only'

import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { ConnectorFileMetadata } from '@/lib/connectors/types'

const MAX_DEPTH = 20

/**
 * Whether a Drive item lives inside an engagement's folder tree — so a route that checked the
 * caller's rights on the engagement can't be pointed at some other file the connector can reach
 * (.claude/plans/access-gates.md, root cause 5).
 *
 * True when the item is tracked as one of the engagement's documents, or when walking its Drive
 * parents reaches the engagement's root folder or one of its tracked folders. The walk covers
 * files that were never indexed (uploads that missed their EngagementDocument row).
 */
export async function isFileInEngagementTree(
    engagementId: string,
    connectorId: string,
    fileId: string,
): Promise<boolean> {
    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: { connectorRootFolderId: true },
    })
    if (!engagement) return false

    const isTracked = async (externalId: string) =>
        !!(await prisma.engagementDocument.findFirst({ where: { engagementId, externalId }, select: { id: true } }))

    if (fileId === engagement.connectorRootFolderId) return false // never the engagement root itself
    if (await isTracked(fileId)) return true

    const adapter = await getPermissionAdapter(connectorId)
    if (!adapter) return false
    let current: string | undefined = fileId
    for (let depth = 0; depth < MAX_DEPTH && current; depth++) {
        const meta: ConnectorFileMetadata | null = await adapter.getFileMetadata(connectorId, current).catch(() => null)
        const parent: string | undefined = meta?.parents?.[0]
        if (!parent) return false
        if (parent === engagement.connectorRootFolderId) return true
        if (await isTracked(parent)) return true
        current = parent
    }
    return false
}
