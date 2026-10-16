'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { requireSystemAdmin } from '@/lib/auth/require-system-admin'

interface UpdateResearchCampaignData {
    description?: string
    scriptSnippet?: string
    queryParams: Array<{ key: string; value: string }>
}

export async function updateResearchCampaign(
    id: string,
    data: UpdateResearchCampaignData
): Promise<ActionResponse<void>> {
    return serverActionWrapper(async () => {
        await requireSystemAdmin()
        await (prisma as any).researchCampaign.update({
            where: { id },
            data: {
                description: data.description || null,
                scriptSnippet: data.scriptSnippet || null,
                queryParams: data.queryParams,
            },
        })
    }, 'updateResearchCampaign')
}
