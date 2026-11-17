import 'server-only'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import type { EngagementFolderIds } from '@/lib/connectors/types'

const NONE: EngagementFolderIds = { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null }

/**
 * An engagement's top folders (General / Confidential / Staging), asked of its connector's own
 * adapter — the lookup the Files page uses (getEngagementFolderIds in lib/actions/project.ts).
 *
 * Never read `connector.settings.projectFolderSettings[slug]` for these: that is where Google Drive
 * keeps them, but OneDrive keeps them under `settings.organizations[firmId].projectFolderSettings`,
 * so a direct read finds none on OneDrive. resolve-path did that, and on OneDrive every comment link
 * to an item in the top folder landed with "Couldn't find that file's folder … may have been moved
 * or deleted".
 *
 * No access check: callers check the caller may view the engagement first.
 */
export async function engagementRootFolderIds(engagementId: string): Promise<EngagementFolderIds> {
    const [engagement, connectorId] = await Promise.all([
        prisma.engagement.findUnique({
            where: { id: engagementId },
            select: { slug: true, name: true, connectorRootFolderId: true, client: { select: { slug: true, name: true } } },
        }),
        resolveEngagementConnectorId(engagementId),
    ])
    if (!engagement?.slug || !connectorId) return NONE
    const adapter = await getPermissionAdapter(connectorId)
    if (!adapter) return NONE
    return adapter.getEngagementFolderIds(connectorId, engagement.slug, {
        projectName: engagement.name,
        clientSlug: engagement.client?.slug,
        clientName: engagement.client?.name,
        projectFolderId: engagement.connectorRootFolderId ?? undefined,
    })
}

/** Which top folder an id is, by name, for a breadcrumb: General, Confidential or Staging. */
export function rootFolderName(ids: EngagementFolderIds, id: string): string {
    return id === ids.generalFolderId ? 'General' : id === ids.confidentialFolderId ? 'Confidential' : 'Staging'
}
