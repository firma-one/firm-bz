import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withoutAgentIds } from '@/lib/ai/agent-email'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { NO_CONNECTOR_REASON, revokeSharePermissions } from '@/lib/connectors/revoke-share-permissions'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { folderIdOf, type EngagementFolderName } from '@/lib/grant-engagement-drive-folder-access'
import { logger } from '@/lib/logger'

/** A member's folder access that storage wouldn't change, and why, in words for people. */
export interface FolderAccessFailure {
    userId: string
    email: string
    folder: EngagementFolderName
    folderId: string
    reason: string
}

const reasonOf = (e: unknown) => (e instanceof StorageFailure ? e.message : "Couldn't reach the storage.")

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
 *
 * Answers who storage wouldn't change, and why, so the job can retry and then tell the Leads.
 */
export async function setFirmFolderAccess(
    projectId: string,
    change: 'read_only' | 'restore',
): Promise<{ changed: number; failed: number; failures: FolderAccessFailure[] }> {
    const none = () => ({ changed: 0, failed: 0, failures: [] as FolderAccessFailure[] })

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
    if (!engagement?.connectorRootFolderId) return none()
    if ((engagement.status === 'COMPLETED') !== (change === 'read_only')) return none()

    const connectorId = await resolveEngagementConnectorId(projectId)
    const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
    if (!connectorId || !adapter) return none()

    const members = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: { in: ['eng_member', 'eng_admin'] } },
        select: { userId: true, role: true },
    })
    const people = new Set(await withoutAgentIds(members.map((m) => m.userId)))
    const firmMembers = members.filter((m) => people.has(m.userId))
    if (firmMembers.length === 0) return none()

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

    const result = none()
    for (const member of firmMembers) {
        const email = emailOf.get(member.userId)
        if (!email) continue
        const names: EngagementFolderName[] = change === 'restore' && member.role !== 'eng_admin'
            ? ['General']
            : ['General', 'Confidential']
        for (const folder of names) {
            const folderId = folderIdOf(folders, folder)
            if (!folderId) continue
            let reason: string | null = null
            try {
                const done = change === 'read_only'
                    ? await adapter.downgradeFolderUserPermissionToReader(connectorId, folderId, email)
                    : await adapter.upgradeFolderUserPermissionToEditor(connectorId, folderId, email)
                if (!done) reason = 'The storage refused the change.'
            } catch (e) {
                reason = reasonOf(e)
            }
            if (reason === null) {
                result.changed++
            } else {
                result.failed++
                result.failures.push({ userId: member.userId, email, folder, folderId, reason })
            }
        }
    }
    if (result.failed > 0) {
        logger.warn(`Firm folder access could not be fully changed (${change})`, { projectId, failed: result.failed, reason: result.failures[0]?.reason })
    }
    return result
}

/**
 * Takes back the folder grants a member holds on an engagement's folders: General, Confidential and
 * Staging, where Firma shares them (grantEngagementDriveFolderAccess), never the engagement's root. For
 * removing a member, lowering their role (only the folders the new role doesn't have) and deleting what
 * the engagement belongs to. Both storages: Graph has no revoke-by-email, so the OneDrive adapter lists
 * the folder's permissions first.
 *
 * Answers which folders still give them access, and why. Nothing to take back (no folders, the person
 * has none there) is no failure; no storage connected to folders that exist is.
 */
export async function revokeMemberFolderAccess(
    projectId: string,
    member: { userId: string; email: string },
    folderNames: EngagementFolderName[] = ['General', 'Confidential', 'Staging'],
): Promise<{ revoked: EngagementFolderName[]; failures: FolderAccessFailure[] }> {
    const outcome = { revoked: [] as EngagementFolderName[], failures: [] as FolderAccessFailure[] }
    if (folderNames.length === 0 || !member.email) return outcome

    const engagement = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: {
            slug: true,
            name: true,
            connectorRootFolderId: true,
            client: { select: { slug: true, name: true } },
        },
    })
    if (!engagement?.connectorRootFolderId) return outcome

    const connectorId = await resolveEngagementConnectorId(projectId)
    const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
    if (!connectorId || !adapter) {
        for (const folder of folderNames) {
            outcome.failures.push({ ...member, folder, folderId: '', reason: NO_CONNECTOR_REASON })
        }
        return outcome
    }

    let folders
    try {
        folders = await adapter.getEngagementFolderIds(connectorId, engagement.slug, {
            projectName: engagement.name,
            clientSlug: engagement.client.slug,
            clientName: engagement.client.name,
            projectFolderId: engagement.connectorRootFolderId,
        })
    } catch (e) {
        for (const folder of folderNames) outcome.failures.push({ ...member, folder, folderId: '', reason: reasonOf(e) })
        return outcome
    }

    for (const folder of folderNames) {
        const folderId = folderIdOf(folders, folder)
        if (!folderId) continue
        try {
            await adapter.revokeFolderPermissionByEmail(connectorId, folderId, member.email)
            outcome.revoked.push(folder)
        } catch (e) {
            outcome.failures.push({ ...member, folder, folderId, reason: reasonOf(e) })
        }
    }
    if (outcome.failures.length > 0) {
        logger.warn('Folder access could not be fully taken back', { projectId, failed: outcome.failures.length, reason: outcome.failures[0].reason })
    }
    return outcome
}

/** What storage still allows after an engagement's access was taken back, for its delete to report. */
export interface EngagementAccessLeft {
    /** Files whose permissions storage wouldn't remove. */
    files: string[]
    /** Who still has access to its folders: addresses, or what a permission is ("anyone with the link"). */
    folderAccess: string[]
    /** True when storage wouldn't even say who has access to a folder. */
    foldersUnchecked: boolean
    /** Why, for the first of those, in words for people. */
    reason?: string
}

/**
 * Takes back everything storage gives on an engagement's behalf, before the engagement (or its client)
 * is deleted and its sharing rows with it: every permission a row still holds, through the connector it
 * was granted on, tried twice; then its General, Confidential and Staging folders and its root are
 * restricted to their owner, on Google Drive and OneDrive, which removes the members' folder grants and
 * anything else shared there. Answers what still stands.
 */
export async function takeBackEngagementAccess(engagementId: string): Promise<EngagementAccessLeft> {
    const left: EngagementAccessLeft = { files: [], folderAccess: [], foldersUnchecked: false }

    const shares = await prisma.engagementDocumentSharingUser.findMany({
        where: { engagementId, connectorPermissionId: { not: null } },
        select: { id: true, connectorPermissionId: true, document: { select: { externalId: true, connectorId: true, fileName: true } } },
    })
    let outcome = await revokeSharePermissions(engagementId, shares)
    if (outcome.failed.length > outcome.unreachable) {
        const again = await revokeSharePermissions(engagementId, shares.filter((s) => outcome.failed.includes(s.id)))
        outcome = { ...again, revoked: outcome.revoked + again.revoked }
    }
    left.files = shares.filter((s) => outcome.failed.includes(s.id)).map((s) => s.document?.fileName || 'a file')
    left.reason = outcome.failed.length > 0 ? outcome.reasons[outcome.failed[0]] : undefined

    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: { slug: true, name: true, connectorRootFolderId: true, client: { select: { slug: true, name: true } } },
    })
    if (!engagement?.connectorRootFolderId) return left

    const connectorId = await resolveEngagementConnectorId(engagementId)
    const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
    if (!connectorId || !adapter) {
        left.foldersUnchecked = true
        left.reason ??= NO_CONNECTOR_REASON
        return left
    }

    const folderIds: string[] = []
    try {
        const folders = await adapter.getEngagementFolderIds(connectorId, engagement.slug, {
            projectName: engagement.name,
            clientSlug: engagement.client.slug,
            clientName: engagement.client.name,
            projectFolderId: engagement.connectorRootFolderId,
        })
        for (const name of ['General', 'Confidential', 'Staging'] as const) {
            const id = folderIdOf(folders, name)
            if (id) folderIds.push(id)
        }
    } catch (e) {
        left.foldersUnchecked = true
        left.reason ??= reasonOf(e)
    }
    folderIds.push(engagement.connectorRootFolderId)

    for (const folderId of Array.from(new Set(folderIds))) {
        try {
            const restricted = await adapter.restrictFolderToOwnerOnly(connectorId, folderId)
            left.folderAccess.push(...restricted.remaining)
            if (restricted.remaining.length > 0) left.reason ??= restricted.reason
        } catch (e) {
            left.foldersUnchecked = true
            left.reason ??= reasonOf(e)
        }
    }
    left.folderAccess = Array.from(new Set(left.folderAccess))
    if (left.files.length > 0 || left.folderAccess.length > 0 || left.foldersUnchecked) {
        logger.warn('Engagement access could not be fully taken back', {
            engagementId, files: left.files.length, folderAccess: left.folderAccess.length, foldersUnchecked: left.foldersUnchecked,
        })
    }
    return left
}
