import { EngagementRole, DocumentSharingPermissionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { logger } from '@/lib/logger'

/**
 * Sync document sharing permissions for a specific project document (grant/revoke EC users).
 */
export async function syncDocumentSharingUsers(projectDocumentId: string) {
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
        select: { connectorId: true },
      })
      connectorId = org?.connectorId ?? null
    }

    if (!connectorId) {
      logger.error('No active Google Drive connector found for organization', undefined, undefined, {
        organizationId: doc.firmId,
      })
      return
    }

    if (!isExternalCollaboratorEnabled) {
      for (const user of doc.sharingUsers) {
        if (user.googlePermissionId && externalId) {
          try {
            await googleDriveConnector.revokePermission(connectorId, externalId, user.googlePermissionId)
          } catch (e) {
            logger.error('Failed to revoke Drive permission on sync', e as Error)
          }
        }
      }

      await prisma.engagementDocumentSharingUser.updateMany({
        where: { projectDocumentId },
        data: {
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          googlePermissionId: null,
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
    const authUsers = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
      `SELECT id::text, email FROM auth.users WHERE id IN (${userIds.map((id: string) => `'${id}'`).join(',')})`
    )

    const userEmailMap = new Map(authUsers.map(u => [u.id, u.email]))

    for (const member of externalCollaborators) {
      const email = userEmailMap.get(member.userId)
      if (!email) continue

      const existingUserShare = doc.sharingUsers.find((u) => u.userId === member.userId)
      if (existingUserShare?.sharingPermissionStatus === DocumentSharingPermissionStatus.GRANTED) continue

      try {
        if (!externalId) continue
        const message = `You've been granted access to "${doc.fileName || 'a document'}" in Pockett.`
        const permissionId = await googleDriveConnector.grantFolderPermission(connectorId, externalId, email, 'writer')

        if (existingUserShare) {
          await prisma.engagementDocumentSharingUser.update({
            where: { id: existingUserShare.id },
            data: {
              googlePermissionId: permissionId,
              sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
              email,
            },
          })
        } else {
          await prisma.engagementDocumentSharingUser.create({
            data: {
              projectDocumentId,
              engagementId: projectId,
              userId: member.userId,
              email,
              googlePermissionId: permissionId,
              sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
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
      if (userToRemove.googlePermissionId && externalId) {
        try {
          await googleDriveConnector.revokePermission(connectorId, externalId, userToRemove.googlePermissionId)
        } catch (e) {
          logger.error('Failed to revoke permission for removed member', e as Error)
        }
      }
      await prisma.engagementDocumentSharingUser.update({
        where: { id: userToRemove.id },
        data: {
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          googlePermissionId: null,
        },
      })
    }
  } catch (error) {
    logger.error('Error in syncDocumentSharingUsers (V2)', error as Error)
  }
}
