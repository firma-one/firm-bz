'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart } from 'lucide-react'
import { InsightCard } from '@/components/dashboard/insight-card'
import { FirmEngagementsList, FirmOverviewTop, FirmPipelineSection } from '@/components/dashboard/firm-overview-sections'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { buildDemoFirmActions, buildDemoFirmOverview } from '@/lib/demo/demo-firm-overview'
import type { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoFirmBrief } from '@/components/demo/demo-firm-brief'
import { FirmActions, type FirmActionLinks } from '@/components/dashboard/firm-actions'

/** The tour's own pages for the Action Center's rows. */
const TOUR_LINKS: FirmActionLinks = {
    engagement: (clientSlug, engagementSlug, tab) => `/tour/${clientSlug}/${engagementSlug}${tab && tab !== 'analytics' ? `?tab=${tab}` : ''}`,
    client: (clientSlug, tab) => `/tour/${clientSlug}${tab ? `?tab=${tab}` : ''}`,
}

/**
 * Static counterpart to the firm Overview (firm-clients-view.tsx → FirmBusinessInsights, which
 * renders the Action Center and the report): the same sections, computed from the sample firm.
 * Everything that depends on today is worked out after mount, so the server and the visitor agree.
 */
export function DemoFirmOverview({ firm }: { firm: DemoFirm }) {
    const [nowMs, setNowMs] = useState<number | null>(null)
    useEffect(() => setNowMs(Date.now()), [])
    const data = useMemo(() => (nowMs === null ? null : buildDemoFirmOverview(firm, nowMs)), [firm, nowMs])
    const actions = useMemo(() => (nowMs === null ? null : buildDemoFirmActions(firm, nowMs)), [firm, nowMs])

    return (
        <div className="flex flex-col gap-10 pb-6">
            <FirmActions data={actions} links={TOUR_LINKS} />
            <InsightCard title="Business overview" icon={LineChart} theme="blue" subtext="Engagements, clients and pipeline">
                {!data ? (
                    <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3" aria-busy="true">
                        <ShimmerBlock className="h-40 w-full" />
                        <ShimmerBlock className="h-40 w-full md:col-span-2" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-10 pt-4">
                        <FirmOverviewTop data={data} brief={<DemoFirmBrief firm={firm} />} />
                        <FirmEngagementsList rows={data.engagementRows} nowMs={data.nowMs} hrefFor={(r) => `/tour/${r.clientSlug}/${r.slug}`} />
                        <FirmPipelineSection data={data} />
                    </div>
                )}
            </InsightCard>
        </div>
    )
}
