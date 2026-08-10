import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { DemoEngagementWorkspace } from '@/components/demo/demo-engagement-workspace'
import { DEMO_FIRM, getDemoEngagement } from '@/lib/demo/static-demo-data'

export function generateStaticParams() {
    return DEMO_FIRM.clients.flatMap((client) =>
        client.engagements.map((engagement) => ({ clientSlug: client.slug, engagementSlug: engagement.slug }))
    )
}

export default async function DemoEngagementPage({
    params,
}: {
    params: Promise<{ clientSlug: string; engagementSlug: string }>
}) {
    const { clientSlug, engagementSlug } = await params
    const result = getDemoEngagement(clientSlug, engagementSlug)
    if (!result) notFound()
    return (
        <Suspense fallback={null}>
            <DemoEngagementWorkspace client={result.client} engagement={result.engagement} />
        </Suspense>
    )
}
