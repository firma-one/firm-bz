'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

interface ActiveCampaign {
    id: string
    name: string
    openedAt: Date
}

export async function getActiveCampaign(): Promise<ActionResponse<ActiveCampaign | null>> {
    return serverActionWrapper(async () => {
        const campaign = await (prisma as any).waitlistCampaign.findFirst({
            where: { isActive: true },
            select: { id: true, name: true, openedAt: true },
            orderBy: { openedAt: 'desc' },
        })
        return campaign ?? null
    }, 'getActiveCampaign')
}
