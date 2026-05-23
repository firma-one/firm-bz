'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

export async function createResearchCampaign(): Promise<ActionResponse<{ id: string }>> {
    return serverActionWrapper(async () => {
        const campaign = await (prisma as any).researchCampaign.create({
            data: {},
            select: { id: true },
        })
        return campaign
    }, 'createResearchCampaign')
}
