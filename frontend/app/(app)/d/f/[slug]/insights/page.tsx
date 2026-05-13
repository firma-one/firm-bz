import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { FirmBusinessInsights } from '@/components/dashboard/firm-business-insights'
import { DriveInsightsSection } from '@/components/dashboard/drive-insights-section'
import { FirmActionCenter } from '@/components/dashboard/firm-action-center'

export default async function InsightsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    const firm = await prisma.firm.findUnique({
        where: { slug },
        select: { id: true },
    })

    if (!firm) notFound()

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', paddingTop: '1.5rem', paddingBottom: '1.5rem', alignItems: 'start' }}>
            {/* Left column: stacked sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                <FirmBusinessInsights firmId={firm.id} firmSlug={slug} />
                <DriveInsightsSection />
            </div>

            {/* Right column: Action Center */}
            <FirmActionCenter firmId={firm.id} firmSlug={slug} />
        </div>
    )
}
