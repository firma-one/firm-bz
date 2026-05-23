import { prisma } from '@/lib/prisma'
import { ResearchCampaignManager } from './research-campaign-manager'

export const dynamic = 'force-dynamic'

export default async function ResearchCampaignsPage() {
    const campaigns = await (prisma as any).researchCampaign.findMany({
        orderBy: { createdAt: 'desc' },
    })

    return <ResearchCampaignManager campaigns={campaigns} />
}
