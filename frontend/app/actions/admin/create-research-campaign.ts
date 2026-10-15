'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { requireSystemAdmin } from '@/lib/auth/require-system-admin'

export async function createResearchCampaign(): Promise<ActionResponse<{ id: string }>> {
    return serverActionWrapper(async () => {
        await requireSystemAdmin()
        const campaign = await (prisma as any).researchCampaign.create({
            data: {},
            select: { id: true },
        })
        return campaign
    }, 'createResearchCampaign')
}
