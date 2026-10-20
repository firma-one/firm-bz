import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ResearchContent } from './research-content'

export default async function GoCampaignPage({
    params,
}: {
    params: Promise<{ campaignId: string }>
}) {
    const { campaignId } = await params

    const campaign = await (prisma as any).researchCampaign.findUnique({
        where: { id: campaignId },
        select: {
            id: true,
            scriptSnippet: true,
            status: true,
        },
    })

    // Only ACTIVE campaigns are publicly accessible — DRAFT and CLOSED both 404
    if (!campaign || campaign.status !== 'ACTIVE') notFound()

    return <ResearchContent campaign={campaign} />
}
