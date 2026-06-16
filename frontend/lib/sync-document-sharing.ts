import { EngagementRole, DocumentSharingPermissionStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { logger } from '@/lib/logger'

/**
 * Sync document sharing permissions for a specific project document (grant/revoke EC users).
 */
export async function syncDocumentSharingUsers(projectDocumentId: string, actorId?: string | null) {
  try {
    const doc = await prisma.engagementDocument.findUnique({
      where: { id: projectDocumentId },
      include: {
        sharingUsers: true,
      },
    })

    if (!doc) return

    const isExternalCollaboratorEnabled = (doc.settings as any)?.share?.externalCollaborator?.enabled === true
    const projectId = doc.engagementId
    const externalId = doc.externalId

    let connectorId = doc.connectorId
    if (!connectorId && doc.firmId) {
      const org = await prisma.firm.findUnique({
        where: { id: doc.firmId },
        include: { connector: true, connectors: true },
      })
      const active = [...(org?.connectors ?? []), ...(org?.connector ? [org.connector] : [])]
        .find(c => c.status === 'ACTIVE')
      connectorId = active?.id ?? null
    }

    if (!connectorId) {
      logger.error('No active connector found for organization', undefined, undefined, {
        organizationId: doc.firmId,
      })
      return
    }

    let adapter
    try {
      adapter = await getPermissionAdapter(connectorId)
    } catch (adapterErr) {
      logger.warn('syncDocumentSharingUsers: connector not found — skipping sync', {
        connectorId,
        organizationId: doc.firmId,
        error: adapterErr instanceof Error ? adapterErr.message : String(adapterErr),
      })
      return
    }
    if (!adapter) {
      logger.warn('syncDocumentSharingUsers: no permission adapter for connector type — skipping sync', {
        connectorId,
        organizationId: doc.firmId,
      })
      return
    }

    if (!isExternalCollaboratorEnabled) {
      for (const user of doc.sharingUsers) {
        if (user.connectorPermissionId && externalId) {
          try {
            await adapter.revokePermission(connectorId, externalId, user.connectorPermissionId)
          } catch (e) {
            logger.error('Failed to revoke connector permission on sync', e as Error)
          }
        }
      }

      await prisma.engagementDocumentSharingUser.updateMany({
        where: { projectDocumentId },
        data: {
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          connectorPermissionId: null,
          ...(actorId ? { updatedBy: actorId } : {}),
        },
      })
      return
    }

    const externalCollaborators = await prisma.engagementMember.findMany({
      where: {
        engagementId: projectId,
        role: EngagementRole.eng_ext_collaborator,
      },
    })

    if (externalCollaborators.length === 0) return

    const userIds = externalCollaborators.map((m) => m.userId)
    const authUsers = await prisma.$queryRaw<Array<{ id: string; email: string }>>(
      Prisma.sql`SELECT id::text, email FROM auth.users WHERE id = ANY(${userIds}::uuid[])`
    )

    const userEmailMap = new Map(authUsers.map(u => [u.id, u.email]))

    for (const member of externalCollaborators) {
      const email = userEmailMap.get(member.userId)
      if (!email) continue

      const existingUserShare = doc.sharingUsers.find((u) => u.userId === member.userId)
      if (existingUserShare?.sharingPermissionStatus === DocumentSharingPermissionStatus.GRANTED) continue
      // Never auto-grant a PENDING row — intake approval must happen explicitly
      if ((existingUserShare?.sharingPermissionStatus as string) === 'PENDING') continue

      try {
        if (!externalId) continue
        const permissionId = await adapter.grantFolderPermission(connectorId, externalId, email, 'writer')

        if (existingUserShare) {
          await prisma.engagementDocumentSharingUser.update({
            where: { id: existingUserShare.id },
            data: {
              connectorPermissionId: permissionId,
              sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
              email,
              ...(actorId ? { updatedBy: actorId } : {}),
            },
          })
        } else {
          await prisma.engagementDocumentSharingUser.create({
            data: {
              projectDocumentId,
              engagementId: projectId,
              userId: member.userId,
              email,
              connectorPermissionId: permissionId,
              sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
              ...(actorId ? { createdBy: actorId, updatedBy: actorId } : {}),
            },
          })
        }
      } catch (e) {
        logger.error(`Failed to grant drive permission to ${email}`, e as Error)
      }
    }

    const validUserIds = new Set(externalCollaborators.map((m) => m.userId))
    const usersToRemove = doc.sharingUsers.filter((u) => !validUserIds.has(u.userId))

    for (const userToRemove of usersToRemove) {
      if (userToRemove.connectorPermissionId && externalId) {
        try {
          await adapter.revokePermission(connectorId, externalId, userToRemove.connectorPermissionId)
        } catch (e) {
          logger.error('Failed to revoke connector permission for removed member', e as Error)
        }
      }
      await prisma.engagementDocumentSharingUser.update({
        where: { id: userToRemove.id },
        data: {
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          connectorPermissionId: null,
          ...(actorId ? { updatedBy: actorId } : {}),
        },
      })
    }
  } catch (error) {
    logger.error('Error in syncDocumentSharingUsers (V2)', error as Error)
  }
}
