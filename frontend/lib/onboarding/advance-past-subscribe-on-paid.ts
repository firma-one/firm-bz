import { prisma } from '@/lib/prisma'
import { listFirmIdsInBillingGroup } from '@/lib/billing/billing-group'
import { logger } from '@/lib/logger'

/**
 * When a paid Polar subscription becomes active, move flow-v3 firms still on the subscribe
 * step to "connect Drive" so onboarding resumes at stage 3 without relying on URL flags.
 */
export async function advanceOnboardingPastSubscribeForBillingAnchor(
    groupId: string,
    productId: string | null
): Promise<void> {
    const freeId = process.env.POLAR_FREE_PRODUCT_ID?.trim()
    if (freeId && productId && productId === freeId) {
        return
    }

    const firmIds = await listFirmIdsInBillingGroup(groupId)
    const firms = await prisma.firm.findMany({
        where: { id: { in: firmIds } },
        select: { id: true, settings: true },
    })

    for (const f of firms) {
        const prev = ((f.settings as Record<string, unknown>) || {}) as Record<string, unknown>
        const prevOn = (prev.onboarding as Record<string, unknown>) || {}
        const flowV = Number(prevOn.onboardingFlowVersion) || 2
        const stage = String(prevOn.stage || '')
        const subscribeSkipped = prevOn.subscribeSkipped === true
        if (flowV < 3 || subscribeSkipped) continue
        if (stage !== 'awaiting_subscribe') continue

        await prisma.firm.update({
            where: { id: f.id },
            data: {
                settings: {
                    ...prev,
                    onboarding: {
                        ...prevOn,
                        onboardingFlowVersion: 3,
                        stage: 'awaiting_drive',
                        resumeAtStep: 3,
                        subscribeSkipped: false,
                        lastUpdated: new Date().toISOString(),
                    },
                },
            },
        })
        logger.info('Onboarding: advanced past subscribe after paid subscription (webhook)', {
            firmId: f.id,
            groupId,
        })
    }
}
