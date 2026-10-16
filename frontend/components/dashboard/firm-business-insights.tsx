'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Users, Briefcase, MailOpen, TrendingUp, RefreshCw, UserPlus, Send, CheckCircle2, PauseCircle, UserMinus, ArrowLeft, CalendarClock, LineChart } from 'lucide-react'
import type { FirmInsightsResponse, ClientPipelineItem, EngagementPipelineItem } from '@/app/api/firms/[firmId]/insights/route'
import { StatTile } from '@/components/ui/stat-tile'
import { AiFirmBrief } from '@/components/dashboard/ai-firm-brief'
import { InsightCard } from '@/components/dashboard/insight-card'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { Tag } from '@/components/ui/tag'

function formatValue(val: number, symbol = ''): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `${symbol}${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${symbol}${(val / 1_000).toFixed(0)}K`
    return `${symbol}${val.toFixed(0)}`
}

/** Pipeline segments and legend dots use the chart palette in ui-tokens.css. */
const PIPELINE_COLORS = ['blue', 'purple', 'pink', 'green', 'orange', 'yellow', 'teal'] as const
type PipelineColor = (typeof PIPELINE_COLORS)[number]
const chartColor = (c: PipelineColor) => `var(--ui-chart-${c})`

/** Dark hover label over a bar segment. */
function SegmentTip({ children }: { children: React.ReactNode }) {
    return (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-control bg-fg px-2.5 py-1.5 text-caption font-medium text-surface opacity-0 shadow-popover transition-opacity group-hover:opacity-100">
            {children}
        </div>
    )
}

function EngagementDrillBar({ engagements, clientTotal, symbol, onBack, clientName, colorIndex }: {
    engagements: EngagementPipelineItem[]
    clientTotal: number
    symbol: string
    onBack: () => void
    clientName: string
    colorIndex: number
}) {
    const [hovered, setHovered] = useState<string | null>(null)
    const hasValues = clientTotal > 0
    // The first engagement keeps the client's color, so the drill-in reads as a zoom of that segment.
    const colorAt = (i: number) => PIPELINE_COLORS[(colorIndex + i) % PIPELINE_COLORS.length]

    return (
        <div>
            <div className="mb-3 flex h-7 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                </Button>
                <span className="text-ui font-medium text-fg">{clientName}</span>
                <span className="text-small text-fg-subtle">{engagements.length} engagement{engagements.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-ui font-medium tabular-nums text-fg">{hasValues ? formatValue(clientTotal, symbol) : `${engagements.length} eng`}</span>
            </div>

            <div className="relative mb-3 flex h-2.5 w-full gap-0.5 rounded-full bg-surface-muted">
                {engagements.map((eng, i) => {
                    const pct = hasValues ? (eng.value / clientTotal) * 100 : (1 / engagements.length) * 100
                    return (
                        <div
                            key={eng.engagementId}
                            style={{ width: `${pct}%`, backgroundColor: chartColor(colorAt(i)) }}
                            onMouseEnter={() => setHovered(eng.engagementId)}
                            onMouseLeave={() => setHovered(null)}
                            className={`group relative h-full cursor-default transition-opacity first:rounded-l-full last:rounded-r-full ${hovered && hovered !== eng.engagementId ? 'opacity-40' : ''}`}
                        >
                            <SegmentTip>
                                {eng.engagementName}
                                {hasValues ? ` · ${formatValue(eng.value, symbol)} (${pct.toFixed(1)}%)` : ' · no value set'}
                                {eng.closingSoon && <span className="ml-1 opacity-70">· closing soon</span>}
                            </SegmentTip>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {engagements.map((eng, i) => {
                    const pct = hasValues && clientTotal > 0 ? ((eng.value / clientTotal) * 100).toFixed(0) : null
                    return (
                        <div
                            key={eng.engagementId}
                            className={`flex items-start gap-2 transition-opacity ${hovered && hovered !== eng.engagementId ? 'opacity-40' : ''}`}
                            onMouseEnter={() => setHovered(eng.engagementId)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(colorAt(i)) }} />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-small leading-tight text-fg">{eng.engagementName}</span>
                                <div className="flex items-center gap-1.5">
                                    {eng.contractType && <Tag color="gray">{eng.contractType}</Tag>}
                                    {hasValues && (
                                        <>
                                            <span className="text-small font-medium tabular-nums text-fg">{formatValue(eng.value, symbol)}</span>
                                            {pct && <span className="text-small tabular-nums text-fg-subtle">{pct}%</span>}
                                        </>
                                    )}
                                    {eng.closingSoon && <Tag color="orange">Soon</Tag>}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/** The client pipeline bar with its drill-down. Shared with the public demo's Overview. */
export function PipelineBar({ items, total, symbol }: { items: ClientPipelineItem[]; total: number; symbol: string }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const [drillClient, setDrillClient] = useState<{ item: ClientPipelineItem; colorIndex: number } | null>(null)
    const isDrilled = drillClient !== null
    const hasItems = items.length > 0
    const hasValues = total > 0
    const engagementTotal = items.reduce((s, x) => s + x.engagementCount, 0)

    return (
        <div className="relative overflow-hidden">
            {/* Top-level view */}
            <div className={`transition-all duration-200 ease-out ${isDrilled ? 'pointer-events-none absolute inset-x-0 top-0 -translate-x-4 opacity-0' : 'translate-x-0 opacity-100'}`}>
                <div className="mb-3 flex h-7 items-center gap-2">
                    <span className="text-caption text-fg-subtle">All clients · click a segment to see its engagements</span>
                    {hasValues && <span className="ml-auto text-ui font-medium tabular-nums text-fg">{formatValue(total, symbol)}</span>}
                </div>
                <div className="relative mb-3 flex h-2.5 w-full gap-0.5 rounded-full bg-surface-muted">
                    {hasItems ? items.map((item, i) => {
                        const color = PIPELINE_COLORS[i % PIPELINE_COLORS.length]
                        const pct = hasValues ? (item.value / total) * 100 : (item.engagementCount / engagementTotal) * 100
                        return (
                            <div
                                key={item.clientId}
                                style={{ width: `${pct}%`, backgroundColor: chartColor(color) }}
                                onMouseEnter={() => setHovered(item.clientId)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => setDrillClient({ item, colorIndex: i })}
                                className={`group relative h-full cursor-pointer transition-opacity first:rounded-l-full last:rounded-r-full ${hovered && hovered !== item.clientId ? 'opacity-40' : ''}`}
                            >
                                <SegmentTip>
                                    {item.clientName} · {hasValues ? `${formatValue(item.value, symbol)} (${pct.toFixed(1)}%)` : `${item.engagementCount} engagement${item.engagementCount !== 1 ? 's' : ''} · no value set`}
                                    {hasValues && item.closingSoonValue > 0 && <span className="ml-1 opacity-70">· {formatValue(item.closingSoonValue, symbol)} closing soon</span>}
                                </SegmentTip>
                            </div>
                        )
                    }) : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {items.map((item, i) => {
                        const color = PIPELINE_COLORS[i % PIPELINE_COLORS.length]
                        const pct = hasValues ? ((item.value / total) * 100).toFixed(0) : null
                        return (
                            <button
                                key={item.clientId}
                                type="button"
                                onClick={() => setDrillClient({ item, colorIndex: i })}
                                className={`flex items-start gap-2 rounded-control px-1 py-0.5 text-left transition-[opacity,background-color] hover:bg-surface-hover ${hovered && hovered !== item.clientId ? 'opacity-40' : ''}`}
                                onMouseEnter={() => setHovered(item.clientId)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(color) }} />
                                <span className="flex flex-col gap-0.5">
                                    <span className="text-small leading-tight text-fg">{item.clientName}</span>
                                    <span className="flex items-center gap-1.5 text-small tabular-nums">
                                        {item.value > 0 && pct ? (
                                            <>
                                                <span className="font-medium text-fg">{formatValue(item.value, symbol)}</span>
                                                <span className="text-fg-subtle">{pct}%</span>
                                            </>
                                        ) : (
                                            <span className="text-fg-subtle">—</span>
                                        )}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Drill-down view */}
            <div className={`transition-all duration-200 ease-out ${isDrilled ? 'translate-x-0 opacity-100' : 'pointer-events-none absolute inset-x-0 top-0 translate-x-4 opacity-0'}`}>
                {drillClient && (
                    <EngagementDrillBar
                        engagements={drillClient.item.engagements}
                        clientTotal={drillClient.item.value}
                        symbol={symbol}
                        clientName={drillClient.item.clientName}
                        colorIndex={drillClient.colorIndex}
                        onBack={() => setDrillClient(null)}
                    />
                )}
            </div>
        </div>
    )
}

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

interface FirmBusinessInsightsProps {
    firmId: string
    firmSlug: string
}

export function FirmBusinessInsights({ firmId }: FirmBusinessInsightsProps) {
    const { session } = useAuth()
    const [data, setData] = useState<FirmInsightsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)

    useEffect(() => {
        if (!session?.access_token) return
        setLoading(true)
        fetch(`/api/firms/${firmId}/insights`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
            .then((r) => r.json())
            .then((d) => setData(d))
            .catch((e) => console.error('Failed to load firm insights', e))
            .finally(() => setLoading(false))
    }, [firmId, session, refreshTick])

    const totalActiveClients = data?.clientCounts?.ACTIVE ?? 0
    const totalProspects = data?.clientCounts?.PROSPECT ?? 0
    const totalEngagements = data?.activeEngagements ?? 0
    const totalPendingInvites = data?.pendingInvitations?.length ?? 0

    const closingSoonCount = data?.engagementsDueSoon?.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30).length ?? 0
    const overdueDueCount = data?.engagementsDueSoon?.filter((e) => e.daysUntil < 0).length ?? 0
    const atRiskClientCount = data ? (data.clientCounts?.ACTIVE ?? 0) + (data.clientCounts?.PROSPECT ?? 0) - (data.engagementsDueSoon?.length ?? 0) : 0

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

    return (
        <>
        <AiFirmBrief firmId={firmId} />
        <InsightCard title="Business overview" icon={LineChart} theme="blue" subtext="Client pipeline and active engagements" headerExtra={refreshButton}>
            <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4 md:grid-cols-4">
                    <StatTile icon={Users} label="Active clients" count={totalActiveClients} colorClass="text-fg-subtle" />
                    <StatTile icon={TrendingUp} label="Prospects" count={totalProspects} colorClass="text-fg-subtle" />
                    <StatTile icon={Briefcase} label="Active engagements" count={totalEngagements} colorClass="text-fg-subtle" />
                    <StatTile icon={MailOpen} label="Pending invitations" count={totalPendingInvites} colorClass="text-fg-subtle" />
                    {(data?.clientCounts?.ON_HOLD ?? 0) > 0 && (
                        <StatTile icon={PauseCircle} label="Clients on hold" count={data?.clientCounts?.ON_HOLD ?? 0} colorClass="text-fg-subtle" />
                    )}
                    {(data?.clientCounts?.PAST ?? 0) > 0 && (
                        <StatTile icon={UserMinus} label="Past clients" count={data?.clientCounts?.PAST ?? 0} colorClass="text-fg-subtle" />
                    )}
                    {(data?.engagementStatusBreakdown?.PLANNED ?? 0) > 0 && (
                        <StatTile icon={CalendarClock} label="Planned engagements" count={data!.engagementStatusBreakdown.PLANNED} colorClass="text-fg-subtle" />
                    )}
                    {(data?.engagementStatusBreakdown?.PAUSED ?? 0) > 0 && (
                        <StatTile icon={PauseCircle} label="Paused engagements" count={data!.engagementStatusBreakdown.PAUSED} colorClass="text-fg-subtle" />
                    )}
                </div>

                {(data?.clientPipelineBreakdown !== undefined) && (
                    <SubSection
                        title="Revenue pipeline"
                        trailing={
                            <div className="flex items-baseline gap-3 text-small">
                                {(closingSoonCount > 0 || overdueDueCount > 0) && (
                                    <span className="text-tag-orange-fg">
                                        {closingSoonCount + overdueDueCount} closing within 30 days
                                        {(data?.closingSoonValue ?? 0) > 0 && ` · ${formatValue(data!.closingSoonValue, data?.currencySymbol)}`}
                                    </span>
                                )}
                                {(data?.revenueAtRisk ?? 0) > 0 && (
                                    <span className="text-danger">{formatValue(data!.revenueAtRisk, data?.currencySymbol)} at risk</span>
                                )}
                                <span className="text-ui font-medium tabular-nums text-fg">
                                    {(data?.pipelineValue ?? 0) > 0 ? formatValue(data!.pipelineValue, data?.currencySymbol) : `${totalEngagements} engagement${totalEngagements !== 1 ? 's' : ''}`}
                                </span>
                            </div>
                        }
                    >
                        <PipelineBar items={data!.clientPipelineBreakdown} total={data?.pipelineValue ?? 0} symbol={data?.currencySymbol ?? ''} />
                    </SubSection>
                )}

                {(data?.contractTypeBreakdown?.length ?? 0) > 0 && (
                    <SubSection title="Engagement types">
                        {/* A plain legend, like the pipeline's: label then count, no chips. */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-small">
                            {data!.contractTypeBreakdown.map(({ type, count }) => (
                                <span key={type} className="inline-flex items-baseline gap-1.5">
                                    <span className="text-fg-muted">{type}</span>
                                    <span className="font-medium tabular-nums text-fg">{count}</span>
                                </span>
                            ))}
                        </div>
                    </SubSection>
                )}

                {data?.weeklyActivity && (
                    <SubSection title="This week">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <StatTile icon={UserPlus} label="New clients" count={data.weeklyActivity.newClients} colorClass="text-fg-subtle" />
                            <StatTile icon={Briefcase} label="New engagements" count={data.weeklyActivity.newEngagements} colorClass="text-fg-subtle" />
                            <StatTile icon={Send} label="Invitations sent" count={data.weeklyActivity.invitationsSent} colorClass="text-fg-subtle" />
                            <StatTile icon={CheckCircle2} label="Engagements closed" count={data.weeklyActivity.engagementsClosed} colorClass="text-fg-subtle" />
                        </div>
                    </SubSection>
                )}
            </div>
        </InsightCard>
        </>
    )
}
