import { prisma } from '@/lib/prisma'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `projectId` here is the engagement id (same as API route param). */
export async function getFileInfo(projectId: string, documentIdParam: string): Promise<{ organizationId: string, externalId: string, connectorId: string | null, fileName?: string } | null> {
  const doc = await prisma.engagementDocument.findFirst({
    where: {
      engagementId: projectId,
      OR: [
        { externalId: documentIdParam },
        ...(UUID_REGEX.test(documentIdParam) ? [{ id: documentIdParam }] : []),
      ],
    },
    select: { firmId: true, externalId: true, connectorId: true, fileName: true },
  })

  if (doc) {
    return {
      organizationId: doc.firmId,
      externalId: doc.externalId,
      connectorId: doc.connectorId,
      fileName: doc.fileName,
    }
  }

  return null
}

/** Resolve project document by projectId + documentId (externalId or UUID). Returns id, organizationId, clientId, projectId for use in doc-comments/audit. */
export async function getProjectDocumentContext(
  projectId: string,
  documentIdParam: string
): Promise<{ id: string; organizationId: string; clientId: string; projectId: string; externalId: string } | null> {
  const doc = await prisma.engagementDocument.findFirst({
    where: {
      engagementId: projectId,
      OR: [
        { externalId: documentIdParam },
        ...(UUID_REGEX.test(documentIdParam) ? [{ id: documentIdParam }] : []),
      ],
    },
    select: {
      id: true,
      firmId: true,
      clientId: true,
      engagementId: true,
      externalId: true,
      engagement: { select: { clientId: true } },
    },
  })
  if (!doc) return null
  const clientId = doc.clientId ?? doc.engagement?.clientId
  if (!clientId) return null
  return {
    id: doc.id,
    organizationId: doc.firmId,
    clientId,
    projectId: doc.engagementId,
    externalId: doc.externalId,
  }
}
