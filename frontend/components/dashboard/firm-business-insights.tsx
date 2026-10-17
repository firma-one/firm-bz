'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { RefreshCw, LineChart } from 'lucide-react'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'
import { FirmBriefCard, useFirmBrief } from '@/components/dashboard/ai-firm-brief'
import { InsightCard } from '@/components/dashboard/insight-card'
import { FirmEngagementsList, FirmOverviewTop, FirmPipelineSection, type FirmOverviewData } from '@/components/dashboard/firm-overview-sections'
import { FirmActions, type FirmActionLinks } from '@/components/dashboard/firm-actions'
import { firmActionsFromInsights } from '@/lib/insights/firm-actions'
import { Hint } from '@/components/ui/tooltip'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { clientPath, engagementPath } from '@/lib/navigation/firm-paths'

// The pipeline bar moved to its own file; re-exported for anything still importing it from here.
export { PipelineBar } from '@/components/dashboard/pipeline-bar'

/**
 * One block of the Business overview. A full-width hairline sets it apart from the block above,
 * as between the ring rows on the engagement Overview.
 */
export function SubSection({ title, trailing, children }: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="mt-5 border-t border-line pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-small font-medium text-fg-muted">{title}</h3>
                {trailing}
            </div>
            {children}
        </div>
    )
}

/** The firm insights route, as the Overview's sections read it. */
export function firmOverviewFromInsights(d: FirmInsightsResponse, nowMs: number): FirmOverviewData {
    return {
        nowMs,
        clients: {
            active: d.clientCounts?.ACTIVE ?? 0,
            prospects: d.clientCounts?.PROSPECT ?? 0,
            onHold: d.clientCounts?.ON_HOLD ?? 0,
            past: d.clientCounts?.PAST ?? 0,
        },
        pendingInvitations: d.pendingInvitations?.length ?? 0,
        week: d.weeklyActivity ?? { newClients: 0, newEngagements: 0, invitationsSent: 0, engagementsClosed: 0 },
        engagementRows: d.engagementRows ?? [],
        pipeline: {
            items: d.clientPipelineBreakdown ?? [],
            total: d.pipelineValue ?? 0,
            symbol: d.currencySymbol ?? '',
            dueSoonCount: d.engagementsDueSoon?.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30).length ?? 0,
            dueSoonValue: d.closingSoonValue ?? 0,
            revenueAtRisk: d.revenueAtRisk ?? 0,
        },
        contractTypes: d.contractTypeBreakdown ?? [],
    }
}

interface FirmBusinessInsightsProps {
    firmId: string
    firmSlug: string
    groupSlug: string
}

/**
 * The Firm Overview: the Action Center, then the report — the cards and the brief, the active
 * engagements, the pipeline (.claude/plans/firm-overview-redesign.md). One request feeds both.
 */
export function FirmBusinessInsights({ firmId, firmSlug, groupSlug }: FirmBusinessInsightsProps) {
    const { session } = useAuth()
    const [data, setData] = useState<FirmInsightsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)
    const brief = useFirmBrief(firmId)

    useEffect(() => {
        if (!session?.access_token) return
        setLoading(true)
        fetch(`/api/firms/${firmId}/insights`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
            .then((r) => {
                if (!r.ok) throw new Error(`Insights request failed (${r.status})`)
                return r.json()
            })
            .then((d) => setData(d))
            .catch((e) => console.error('Failed to load firm insights', e))
            .finally(() => setLoading(false))
    }, [firmId, session, refreshTick])

    // "Now" is when the data arrived, so the rows don't shift while it's on screen.
    const overview = useMemo(() => (data ? firmOverviewFromInsights(data, Date.now()) : null), [data])
    const actions = useMemo(() => (data ? firmActionsFromInsights(data) : null), [data])
    const links: FirmActionLinks = useMemo(() => ({
        engagement: (clientSlug, engagementSlug, tab) => engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug, tab ? { tab } : undefined),
        client: (clientSlug, tab) => clientPath(groupSlug, firmSlug, clientSlug) + (tab ? `?tab=${tab}` : ''),
    }), [groupSlug, firmSlug])

    const refreshButton = (
        <Hint label="Refresh">
            <button
                type="button"
                onClick={() => setRefreshTick((t) => t + 1)}
                className="rounded-control p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg print:hidden"
                aria-label="Refresh business overview"
            >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </Hint>
    )

    const briefCard = brief.available ? (
        <FirmBriefCard
            brief={brief.brief}
            loading={brief.loading}
            refreshing={brief.refreshing}
            streamText={brief.streamText}
            refreshError={brief.refreshError}
            onRewrite={brief.refresh}
            onStop={brief.stop}
        />
    ) : null

    return (
        <div className="flex flex-col gap-10">
        <FirmActions data={actions} loading={loading} onRefresh={() => setRefreshTick((t) => t + 1)} links={links} />
        <InsightCard title="Business overview" icon={LineChart} theme="blue" subtext="Engagements, clients and pipeline" headerExtra={refreshButton}>
            {!overview ? (
                <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3" aria-busy="true">
                    <ShimmerBlock className="h-40 w-full" />
                    <ShimmerBlock className="h-40 w-full md:col-span-2" />
                </div>
            ) : (
                <div className={`flex flex-col gap-10 pt-4 transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    <FirmOverviewTop data={overview} brief={briefCard} />
                    <FirmEngagementsList
                        rows={overview.engagementRows}
                        nowMs={overview.nowMs}
                        hrefFor={(r) => engagementPath(groupSlug, firmSlug, r.clientSlug, r.slug, { tab: 'analytics' })}
                    />
                    <FirmPipelineSection data={overview} />
                </div>
            )}
        </InsightCard>
        </div>
    )
}
