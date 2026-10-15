'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { requireSystemAdmin } from '@/lib/auth/require-system-admin'

export async function deleteResearchCampaign(id: string): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await requireSystemAdmin()
        await (prisma as any).researchCampaign.delete({ where: { id } })
    }, 'deleteResearchCampaign')
}
