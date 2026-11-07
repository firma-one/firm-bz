import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withoutAgentIds } from '@/lib/ai/agent-email'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { logger } from '@/lib/logger'

/**
 * A completed engagement is read-only for the firm, in Firma and in Drive: its members drop to read on the
 * engagement's folders, and get write back when it's reopened. Goes through the client's connector.
 *
 * The event can arrive late, so each change first checks the engagement is still in the status that asked
 * for it: closed and quickly reopened must not end with the firm stuck on read.
 *
 * Only people: the Brio agent's account reaches files through the firm-level grant, and restoring could
 * otherwise share a folder with its address. Only as far as they had it: an engagement member never has
 * Confidential, so reopening doesn't give it to them.
 */
export async function setFirmFolderAccess(
    projectId: string,
    change: 'read_only' | 'restore',
): Promise<{ changed: number; failed: number }> {
    const none = { changed: 0, failed: 0 }

    const engagement = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: {
            slug: true,
            name: true,
            status: true,
            connectorRootFolderId: true,
            client: { select: { slug: true, name: true } },
        },
    })
    if (!engagement?.connectorRootFolderId) return none
    if ((engagement.status === 'COMPLETED') !== (change === 'read_only')) return none

    const connectorId = await resolveEngagementConnectorId(projectId)
    const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
    if (!connectorId || !adapter) return none

    const members = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: { in: ['eng_member', 'eng_admin'] } },
        select: { userId: true, role: true },
    })
    const people = new Set(await withoutAgentIds(members.map((m) => m.userId)))
    const firmMembers = members.filter((m) => people.has(m.userId))
    if (firmMembers.length === 0) return none

    const userIds = firmMembers.map((m) => m.userId)
    const authUsers = await prisma.$queryRaw<Array<{ id: string; email: string }>>(
        Prisma.sql`SELECT id::text, email FROM auth.users WHERE id = ANY(${userIds}::uuid[])`
    )
    const emailOf = new Map(authUsers.map((u) => [u.id, u.email]))

    const folders = await adapter.getEngagementFolderIds(connectorId, engagement.slug, {
        projectName: engagement.name,
        clientSlug: engagement.client.slug,
        clientName: engagement.client.name,
        projectFolderId: engagement.connectorRootFolderId,
    })

    const result = { ...none }
    for (const member of firmMembers) {
        const email = emailOf.get(member.userId)
        if (!email) continue
        const folderIds = change === 'restore' && member.role !== 'eng_admin'
            ? [folders.generalFolderId]
            : [folders.generalFolderId, folders.confidentialFolderId]
        for (const folderId of folderIds) {
            if (!folderId) continue
            const done = change === 'read_only'
                ? await adapter.downgradeFolderUserPermissionToReader(connectorId, folderId, email).catch(() => false)
                : await adapter.upgradeFolderUserPermissionToEditor(connectorId, folderId, email).catch(() => false)
            if (done) result.changed++
            else result.failed++
        }
    }
    if (result.failed > 0) {
        logger.warn(`Firm folder access could not be fully changed (${change})`, { projectId, failed: result.failed })
    }
    return result
}
