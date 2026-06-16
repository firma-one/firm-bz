import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { listFirmIdsInBillingGroup } from '@/lib/billing/billing-group'
import { userSettingsPlus } from '@/lib/user-settings-plus'

/**
 * After any billing change for an anchor (Polar webhooks, Polar API→DB free tier, resync):
 * invalidate server-side UserSettingsPlus so the next read rebuilds plan/caps from the database.
 *
 * Billing details are **not** written into the JWT — `app_metadata` must stay tiny (see
 * `mergeLeanAppMetadata`); large blobs caused 431 Request Header Fields Too Large.
 */
export async function refreshBillingPlanForFirmGroupUsers(groupId: string): Promise<void> {
    try {
        const groupFirmIds = await listFirmIdsInBillingGroup(groupId)
        const members = await prisma.firmMember.findMany({
            where: { firmId: { in: groupFirmIds } },
            select: { userId: true },
        })
        const userIds = Array.from(new Set(members.map((m) => m.userId)))
        if (userIds.length === 0) return

        userSettingsPlus.invalidateUsers(userIds)
    } catch (error) {
        logger.warn('Failed to refresh billing plan for firm group users', {
            groupId,
            message: error instanceof Error ? error.message : String(error),
        })
    }
}
