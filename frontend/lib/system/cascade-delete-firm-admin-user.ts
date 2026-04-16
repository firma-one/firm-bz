import { FirmRole, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Mirrors `scripts/sql/cascade-delete-platform-data-for-firm-admin.sql`:
 * deletes all firms where the user is `firm_admin` (CASCADE handles most children),
 * then notifications, customer_requests, connectorId nulling, orphan connectors,
 * user_personalizations, and system.system_admins for that user.
 * Does not delete the Supabase auth user.
 */
export type FirmAdminCascadeDeleteCounts = {
    firmAdminFirmIds: string[]
    deletedNotifications: number
    deletedCustomerRequests: number
    deletedFirms: number
    deletedOrphanConnectors: number
    deletedUserPersonalizations: number
    deletedSystemAdmins: number
}

export async function cascadeDeletePlatformDataForFirmAdminUser(targetUserId: string): Promise<FirmAdminCascadeDeleteCounts> {
    return prisma.$transaction(async (tx) => {
        const memberships = await tx.firmMember.findMany({
            where: { userId: targetUserId, role: FirmRole.firm_admin },
            select: { firmId: true },
            orderBy: { firmId: 'asc' },
        })
        const firmIds = Array.from(new Set(memberships.map((m) => m.firmId)))

        if (firmIds.length === 0) {
            return {
                firmAdminFirmIds: [],
                deletedNotifications: 0,
                deletedCustomerRequests: 0,
                deletedFirms: 0,
                deletedOrphanConnectors: 0,
                deletedUserPersonalizations: 0,
                deletedSystemAdmins: 0,
            }
        }

        const nRes = await tx.notification.deleteMany({ where: { firmId: { in: firmIds } } })
        const crRes = await tx.customerRequest.deleteMany({
            where: {
                OR: [{ firmId: { in: firmIds } }, { userId: targetUserId }],
            },
        })

        await tx.firm.updateMany({
            where: { id: { in: firmIds }, connectorId: { not: null } },
            data: { connectorId: null },
        })

        const firmsRes = await tx.firm.deleteMany({ where: { id: { in: firmIds } } })

        const orphanConnectorRes = await tx.$executeRaw`
            DELETE FROM platform.connectors c
            WHERE c."userId" = ${targetUserId}::uuid
              AND NOT EXISTS (
                  SELECT 1 FROM platform.firms f WHERE f."connectorId" = c.id
              )
        `

        const upRes = await tx.userPersonalization.deleteMany({ where: { userId: targetUserId } })
        const saRes = await tx.systemAdmin.deleteMany({ where: { userId: targetUserId } })

        return {
            firmAdminFirmIds: firmIds,
            deletedNotifications: nRes.count,
            deletedCustomerRequests: crRes.count,
            deletedFirms: firmsRes.count,
            deletedOrphanConnectors: typeof orphanConnectorRes === 'bigint' ? Number(orphanConnectorRes) : orphanConnectorRes,
            deletedUserPersonalizations: upRes.count,
            deletedSystemAdmins: saRes.count,
        }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
