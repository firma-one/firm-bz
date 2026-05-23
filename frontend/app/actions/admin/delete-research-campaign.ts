'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

export async function deleteResearchCampaign(id: string): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await (prisma as any).researchCampaign.delete({ where: { id } })
    }, 'deleteResearchCampaign')
}
