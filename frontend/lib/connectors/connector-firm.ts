import { prisma } from '@/lib/prisma'

/**
 * Server-only: the firm a connector belongs to. `Connector.firmId` is the owner (the connect flow
 * writes it), then a client using the connector. The legacy `Firm.connectorId` is read last: nothing
 * in the connect flow writes it any more (only `lib/services/connection-manager.ts` via auto-import),
 * so routes that looked there first found nothing and quietly did nothing (audit root cause 9).
 */
export async function findFirmForConnector(connectorId: string) {
    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { firmId: true },
    })
    if (connector?.firmId) {
        const firm = await prisma.firm.findFirst({ where: { id: connector.firmId, deletedAt: null } })
        if (firm) return firm
    }
    const client = await prisma.client.findFirst({ where: { connectorId }, select: { firmId: true } })
    if (client?.firmId) {
        const firm = await prisma.firm.findFirst({ where: { id: client.firmId, deletedAt: null } })
        if (firm) return firm
    }
    return prisma.firm.findFirst({ where: { connectorId, deletedAt: null } })
}
