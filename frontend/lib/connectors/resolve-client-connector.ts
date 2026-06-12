import { prisma } from '@/lib/prisma'
import type { Connector } from '@prisma/client'

/** Resolve the connector id for a client. One per client, possibly shared with siblings.
 *  No firm-level fallback — firm connectors no longer exist as the source of truth. */
export async function resolveClientConnector(clientId: string): Promise<{
  connectorId: string | null
  firmId: string
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { firmId: true, connectorId: true },
  })
  if (!client) throw new Error('Client not found')
  return { connectorId: client.connectorId, firmId: client.firmId }
}

/**
 * Resolve the active Connector for any engagement by joining through its client.
 * Connector ownership is at the client level — returns null when no connector is linked.
 */
export async function resolveEngagementConnector(engagementId: string): Promise<Connector | null> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      client: {
        select: { connector: true },
      },
    },
  })
  if (!engagement) return null
  return engagement.client.connector as Connector | null
}

/**
 * Resolve a connectorId for an engagement using the priority chain:
 *   documentConnectorId (if provided) → client connector → firm connector
 *
 * Used by API routes that need a Drive connector to serve a file. Pass the
 * document's own connectorId as the first argument when available so we
 * prefer the connector that originally indexed the file.
 *
 * Returns null if no active connector is found at any level.
 */
export async function resolveEngagementConnectorId(
  engagementId: string,
  documentConnectorId?: string | null,
): Promise<string | null> {
  if (documentConnectorId) return documentConnectorId

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      firmId: true,
      client: { select: { connectorId: true } },
    },
  })
  if (!engagement) return null

  if (engagement.client.connectorId) return engagement.client.connectorId

  const firm = await prisma.firm.findUnique({
    where: { id: engagement.firmId },
    select: { connectorId: true },
  })
  return firm?.connectorId ?? null
}
