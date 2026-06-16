import { EngagementRole, DocumentSharingPermissionStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Sync engagement_document_sharing_users rows for a shared document.
 *
 * Manages DB rows only — Drive permission grants/revokes belong to the regrant
 * flow triggered by ActionMenu > OPEN (sharing.settings.updated Inngest event).
 *
 * Rules:
 * - Both disabled  → mark all GRANTED rows REVOKED
 * - EC enabled     → upsert GRANTED rows for all eng_ext_collaborator members
 * - Guest enabled  → upsert GRANTED rows for all eng_viewer members
 * - Members no longer in project → mark their rows REVOKED
 * - PENDING rows are never touched (intake approval handles those)
 */
export async function syncDocumentSharingUsers(projectDocumentId: string, actorId?: string | null) {
  try {
    const doc = await prisma.engagementDocument.findUnique({
      where: { id: projectDocumentId },
      include: { sharingUsers: true },
    })

    if (!doc) return

    const settings = (doc.settings as any)?.share ?? {}
    const isEcEnabled = settings?.externalCollaborator?.enabled === true
    const isGuestEnabled = settings?.guest?.enabled === true
    const projectId = doc.engagementId

    // Only touch GRANTED rows — leave PENDING (intake) rows alone
    const grantedRows = doc.sharingUsers.filter(
      (u) => (u.sharingPermissionStatus as string) === 'GRANTED'
    )

    if (!isEcEnabled && !isGuestEnabled) {
      // Revoke all GRANTED rows
      if (grantedRows.length > 0) {
        await prisma.engagementDocumentSharingUser.updateMany({
          where: {
            projectDocumentId,
            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
          },
          data: {
            sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
            connectorPermissionId: null,
            ...(actorId ? { updatedBy: actorId } : {}),
          },
        })
      }
      return
    }

    // Collect which roles are enabled
    const enabledRoles: EngagementRole[] = []
    if (isEcEnabled) enabledRoles.push(EngagementRole.eng_ext_collaborator)
    if (isGuestEnabled) enabledRoles.push(EngagementRole.eng_viewer)

    const members = await prisma.engagementMember.findMany({
      where: { engagementId: projectId, role: { in: enabledRoles } },
    })

    const userIds = members.map((m) => m.userId)
    const authUsers = await prisma.$queryRaw<Array<{ id: string; email: string }>>(
      Prisma.sql`SELECT id::text, email FROM auth.users WHERE id = ANY(${userIds}::uuid[])`
    )
    const userEmailMap = new Map(authUsers.map((u) => [u.id, u.email]))

    // Upsert GRANTED rows for each enabled member
    for (const member of members) {
      const email = userEmailMap.get(member.userId)
      if (!email) continue

      const existing = doc.sharingUsers.find((u) => u.userId === member.userId)

      // Already GRANTED — nothing to do
      if ((existing?.sharingPermissionStatus as string) === 'GRANTED') continue
      // Never touch PENDING rows
      if ((existing?.sharingPermissionStatus as string) === 'PENDING') continue

      if (existing) {
        await prisma.engagementDocumentSharingUser.update({
          where: { id: existing.id },
          data: {
            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
            email,
            connectorPermissionId: null,
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
            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
            ...(actorId ? { createdBy: actorId, updatedBy: actorId } : {}),
          },
        })
      }
    }

    // Revoke GRANTED rows for members no longer covered by any enabled role
    const validUserIds = new Set(members.map((m) => m.userId))
    const toRevoke = grantedRows.filter((u) => !validUserIds.has(u.userId))

    for (const row of toRevoke) {
      await prisma.engagementDocumentSharingUser.update({
        where: { id: row.id },
        data: {
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          connectorPermissionId: null,
          ...(actorId ? { updatedBy: actorId } : {}),
        },
      })
    }
  } catch (error) {
    logger.error('Error in syncDocumentSharingUsers', error as Error)
  }
}
