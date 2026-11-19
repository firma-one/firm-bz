import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { FirmRole } from '@prisma/client'
import { SYSTEM_MANAGEMENT_ORG_SLUG } from '@/lib/system-management'

const NOTIFICATION_TYPE = 'ai_spend_ceiling'

/** System admins: firm admins of the System Management org (lib/permission-helpers.ts). */
export async function systemAdminUserIds(): Promise<string[]> {
    const firm = await prisma.firm.findUnique({ where: { slug: SYSTEM_MANAGEMENT_ORG_SLUG }, select: { id: true } })
    if (!firm) return []
    const members = await prisma.firmMember.findMany({
        where: { firmId: firm.id, role: FirmRole.firm_admin },
        select: { userId: true },
    })
    return members.map((m) => m.userId)
}

/** In-app notices to every system admin, once per `dedupeKey`. Never throws. */
export async function noticeSystemAdmins(notice: { title: string; body: string; dedupeKey: string; ctaUrl?: string; metadata?: Record<string, unknown> }): Promise<void> {
    try {
        const admins = await systemAdminUserIds()
        if (admins.length === 0) {
            logger.warn(`No system admin to notify: ${notice.title}`)
            return
        }
        await prisma.notification.createMany({
            data: admins.map((userId) => ({
                userId,
                scope: 'PLATFORM' as const,
                firmId: null,
                type: NOTIFICATION_TYPE,
                priority: 'WARNING' as const,
                title: notice.title,
                body: notice.body,
                ctaUrl: notice.ctaUrl ?? '/system',
                metadata: (notice.metadata ?? {}) as object,
                channels: { inApp: true },
                dedupeKey: `${notice.dedupeKey}:${userId}`,
            })),
            skipDuplicates: true,
        })
    } catch (error) {
        logger.error(`System admin notice failed (${notice.title}):`, error as Error)
    }
}

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`

/**
 * A group's model spend reached its monthly ceiling: Brio pauses for it, its admin is told why, and so
 * are the system admins (a group at the ceiling means something is wrong: a bug, a price, abuse).
 * Once per group per window. Never throws, so it can't fail the refusal it accompanies.
 */
export async function noticeSpendCeiling(params: { groupId: string; spentMicros: number; ceilingMicros: number; periodEnd: Date }): Promise<void> {
    const { groupId, spentMicros, ceilingMicros, periodEnd } = params
    const window = periodEnd.toISOString()
    logger.error(`AI spend ceiling reached: group ${groupId} spent ${dollars(spentMicros)} of ${dollars(ceilingMicros)}`, new Error('ai_spend_ceiling'))
    try {
        const admin = await prisma.groupMember.findFirst({
            where: { groupId, role: 'GROUP_ADMIN' },
            orderBy: { createdAt: 'asc' },
            select: { userId: true },
        })
        if (admin) {
            const refill = periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
            await prisma.notification.createMany({
                data: [{
                    userId: admin.userId,
                    scope: 'PLATFORM',
                    firmId: null,
                    type: NOTIFICATION_TYPE,
                    priority: 'WARNING',
                    title: 'Brio is paused until ' + refill,
                    body: `This month's AI use reached the limit for your plan, so Brio is paused until ${refill}. Everything else works as usual. We've been told and will be in touch.`,
                    ctaUrl: '/d/billing',
                    metadata: { groupId, spentMicros, ceilingMicros },
                    channels: { inApp: true },
                    dedupeKey: `ai-spend-ceiling:${groupId}:${window}`,
                }],
                skipDuplicates: true,
            })
        }
    } catch (error) {
        logger.error('AI spend ceiling notice to the group failed:', error as Error)
    }
    await noticeSystemAdmins({
        title: 'A group reached its AI spend ceiling',
        body: `Group ${groupId} spent ${dollars(spentMicros)} on AI this month, its ceiling is ${dollars(ceilingMicros)}. Brio is paused for it until the window ends.`,
        dedupeKey: `ai-spend-ceiling-admin:${groupId}:${window}`,
        metadata: { groupId, spentMicros, ceilingMicros },
    })
}
