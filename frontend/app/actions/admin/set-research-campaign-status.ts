'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'

export async function setResearchCampaignStatus(
    id: string,
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await (prisma as any).researchCampaign.update({
            where: { id },
            data: {
                status,
                closedAt: status === 'CLOSED' ? new Date() : null,
            },
        })
    }, 'setResearchCampaignStatus')
}
