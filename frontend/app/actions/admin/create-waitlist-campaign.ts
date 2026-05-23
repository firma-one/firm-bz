'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

interface CreatedCampaign {
    id: string
    name: string
}

export async function createWaitlistCampaign(name: string): Promise<ActionResponse<CreatedCampaign>> {
    return serverActionWrapper(async () => {
        // Close any currently active campaign
        await (prisma as any).waitlistCampaign.updateMany({
            where: { isActive: true },
            data: { isActive: false, closedAt: new Date() },
        })

        const campaign = await (prisma as any).waitlistCampaign.create({
            data: { name },
            select: { id: true, name: true },
        })

        return campaign
    }, 'createWaitlistCampaign')
}
