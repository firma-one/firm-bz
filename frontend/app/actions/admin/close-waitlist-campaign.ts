'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

export async function closeWaitlistCampaign(campaignId: string): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await (prisma as any).waitlistCampaign.update({
            where: { id: campaignId },
            data: { isActive: false, closedAt: new Date() },
        })
    }, 'closeWaitlistCampaign')
}
