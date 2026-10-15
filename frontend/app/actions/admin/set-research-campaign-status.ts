'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { requireSystemAdmin } from '@/lib/auth/require-system-admin'

export async function setResearchCampaignStatus(
    id: string,
    status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await requireSystemAdmin()
        await (prisma as any).researchCampaign.update({
            where: { id },
            data: {
                status,
                closedAt: status === 'CLOSED' ? new Date() : null,
            },
        })
    }, 'setResearchCampaignStatus')
}
