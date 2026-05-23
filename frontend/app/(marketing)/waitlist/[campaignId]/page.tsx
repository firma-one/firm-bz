import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { WaitlistPageContent } from './waitlist-content'

export default async function WaitlistCampaignPage({
    params,
    searchParams,
}: {
    params: Promise<{ campaignId: string }>
    searchParams: Promise<Record<string, string>>
}) {
    const { campaignId } = await params
    const resolvedSearchParams = await searchParams

    // Validate campaign exists
    const campaign = await (prisma as any).waitlistCampaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, isActive: true },
    })

    if (!campaign) notFound()

    return <WaitlistPageContent campaignId={campaignId} batch={campaign} searchParams={resolvedSearchParams} />
}
