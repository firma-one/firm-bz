import { prisma } from '@/lib/prisma'
import { DocumentSharingPermissionStatus } from '@prisma/client'

const MAX_ANCESTOR_DEPTH = 10

/**
 * Returns true if the given document has a GRANTED sharingUser row for the user,
 * OR if any ancestor folder (walking parentId chain) does.
 *
 * Used by the regrant route to confirm the file is reachable via a shared ancestor
 * before granting Drive permission — prevents EVs from self-granting access to
 * documents that were never enabled for sharing.
 *
 * parentId on EngagementDocument is the Drive externalId of the parent folder,
 * so each level requires one indexed lookup on (engagementId, externalId).
 */
export async function isDescendantOfGrantedFolder(
  documentId: string,
  userId: string,
  engagementId: string
): Promise<boolean> {
  let currentExternalId: string | null = null

  // Start from the document's own parentId
  const doc = await prisma.engagementDocument.findUnique({
    where: { id: documentId },
    select: { parentId: true },
  })
  currentExternalId = doc?.parentId ?? null

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && currentExternalId; depth++) {
    const ancestor = await prisma.engagementDocument.findFirst({
      where: { engagementId, externalId: currentExternalId },
      select: {
        id: true,
        parentId: true,
        sharingUsers: {
          where: {
            userId,
            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
          },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!ancestor) break

    if (ancestor.sharingUsers.length > 0) return true

    currentExternalId = ancestor.parentId ?? null
  }

  return false
}
