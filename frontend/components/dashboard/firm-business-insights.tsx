'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Users, Briefcase, MailOpen, TrendingUp, RefreshCw, UserPlus, Send, CheckCircle2, PauseCircle, UserMinus, ArrowLeft, CalendarClock } from 'lucide-react'
import type { FirmInsightsResponse, ClientPipelineItem, EngagementPipelineItem } from '@/app/api/firms/[firmId]/insights/route'
import { StatTile } from '@/components/ui/stat-tile'

function formatValue(val: number, symbol = ''): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `${symbol}${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${symbol}${(val / 1_000).toFixed(0)}K`
    return `${symbol}${val.toFixed(0)}`
}

const BAR_COLORS = [
    { bar: 'bg-blue-500',   legend: 'bg-blue-500',   text: 'text-blue-600' },
    { bar: 'bg-indigo-500', legend: 'bg-indigo-500', text: 'text-indigo-600' },
    { bar: 'bg-violet-500', legend: 'bg-violet-500', text: 'text-violet-600' },
    { bar: 'bg-teal-500',   legend: 'bg-teal-500',   text: 'text-teal-600' },
    { bar: 'bg-emerald-500',legend: 'bg-emerald-500',text: 'text-emerald-600' },
    { bar: 'bg-amber-500',  legend: 'bg-amber-500',  text: 'text-amber-600' },
    { bar: 'bg-pink-500',   legend: 'bg-pink-500',   text: 'text-pink-600' },
]

// Shades per color family for the engagement drill-down.
// Order: 500 (matches parent), 700, 400, 800, 300, 600 — so first engagement
// always matches the parent bar color exactly, subsequent ones fan out.
const BAR_COLOR_SHADES: { bar: string; legend: string; text: string }[][] = [
    [ // blue
        { bar: 'bg-blue-500', legend: 'bg-blue-500', text: 'text-blue-600' },
        { bar: 'bg-blue-700', legend: 'bg-blue-700', text: 'text-blue-800' },
        { bar: 'bg-blue-400', legend: 'bg-blue-400', text: 'text-blue-500' },
        { bar: 'bg-blue-800', legend: 'bg-blue-800', text: 'text-blue-900' },
        { bar: 'bg-blue-300', legend: 'bg-blue-300', text: 'text-blue-400' },
        { bar: 'bg-blue-600', legend: 'bg-blue-600', text: 'text-blue-700' },
    ],
    [ // indigo
        { bar: 'bg-indigo-500', legend: 'bg-indigo-500', text: 'text-indigo-600' },
        { bar: 'bg-indigo-700', legend: 'bg-indigo-700', text: 'text-indigo-800' },
        { bar: 'bg-indigo-400', legend: 'bg-indigo-400', text: 'text-indigo-500' },
        { bar: 'bg-indigo-800', legend: 'bg-indigo-800', text: 'text-indigo-900' },
        { bar: 'bg-indigo-300', legend: 'bg-indigo-300', text: 'text-indigo-400' },
        { bar: 'bg-indigo-600', legend: 'bg-indigo-600', text: 'text-indigo-700' },
    ],
    [ // violet
        { bar: 'bg-violet-500', legend: 'bg-violet-500', text: 'text-violet-600' },
        { bar: 'bg-violet-700', legend: 'bg-violet-700', text: 'text-violet-800' },
        { bar: 'bg-violet-400', legend: 'bg-violet-400', text: 'text-violet-500' },
        { bar: 'bg-violet-800', legend: 'bg-violet-800', text: 'text-violet-900' },
        { bar: 'bg-violet-300', legend: 'bg-violet-300', text: 'text-violet-400' },
        { bar: 'bg-violet-600', legend: 'bg-violet-600', text: 'text-violet-700' },
    ],
    [ // teal
        { bar: 'bg-teal-500', legend: 'bg-teal-500', text: 'text-teal-600' },
        { bar: 'bg-teal-700', legend: 'bg-teal-700', text: 'text-teal-800' },
        { bar: 'bg-teal-400', legend: 'bg-teal-400', text: 'text-teal-500' },
        { bar: 'bg-teal-800', legend: 'bg-teal-800', text: 'text-teal-900' },
        { bar: 'bg-teal-300', legend: 'bg-teal-300', text: 'text-teal-400' },
        { bar: 'bg-teal-600', legend: 'bg-teal-600', text: 'text-teal-700' },
    ],
    [ // emerald
        { bar: 'bg-emerald-500', legend: 'bg-emerald-500', text: 'text-emerald-600' },
        { bar: 'bg-emerald-700', legend: 'bg-emerald-700', text: 'text-emerald-800' },
        { bar: 'bg-emerald-400', legend: 'bg-emerald-400', text: 'text-emerald-500' },
        { bar: 'bg-emerald-800', legend: 'bg-emerald-800', text: 'text-emerald-900' },
        { bar: 'bg-emerald-300', legend: 'bg-emerald-300', text: 'text-emerald-400' },
        { bar: 'bg-emerald-600', legend: 'bg-emerald-600', text: 'text-emerald-700' },
    ],
    [ // amber
        { bar: 'bg-amber-500', legend: 'bg-amber-500', text: 'text-amber-600' },
        { bar: 'bg-amber-700', legend: 'bg-amber-700', text: 'text-amber-800' },
        { bar: 'bg-amber-400', legend: 'bg-amber-400', text: 'text-amber-500' },
        { bar: 'bg-amber-800', legend: 'bg-amber-800', text: 'text-amber-900' },
        { bar: 'bg-amber-300', legend: 'bg-amber-300', text: 'text-amber-400' },
        { bar: 'bg-amber-600', legend: 'bg-amber-600', text: 'text-amber-700' },
    ],
    [ // pink
        { bar: 'bg-pink-500', legend: 'bg-pink-500', text: 'text-pink-600' },
        { bar: 'bg-pink-700', legend: 'bg-pink-700', text: 'text-pink-800' },
        { bar: 'bg-pink-400', legend: 'bg-pink-400', text: 'text-pink-500' },
        { bar: 'bg-pink-800', legend: 'bg-pink-800', text: 'text-pink-900' },
        { bar: 'bg-pink-300', legend: 'bg-pink-300', text: 'text-pink-400' },
        { bar: 'bg-pink-600', legend: 'bg-pink-600', text: 'text-pink-700' },
    ],
]

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
    const shades = BAR_COLOR_SHADES[colorIndex % BAR_COLOR_SHADES.length]

    return (
        <div className="animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-2 mb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 transition-all text-gray-700 font-medium text-xs"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                </button>
                <span className="text-sm font-bold text-gray-900">{clientName}</span>
                <span className="text-xs text-gray-400">— {engagements.length} engagement{engagements.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-sm font-bold text-gray-900">{hasValues ? formatValue(clientTotal, symbol) : `${engagements.length} eng`}</span>
            </div>

            <div className="relative h-5 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-3">
                {engagements.map((eng, i) => {
                    const color = shades[i % shades.length]
                    const pct = hasValues
                        ? (eng.value / clientTotal) * 100
                        : (1 / engagements.length) * 100
                    return (
                        <div
                            key={eng.engagementId}
                            style={{ width: `${pct}%` }}
                            onMouseEnter={() => setHovered(eng.engagementId)}
                            onMouseLeave={() => setHovered(null)}
                            className={`h-full ${color.bar} relative group cursor-default transition-opacity ${hovered && hovered !== eng.engagementId ? 'opacity-50' : ''}`}
                        >
                            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                {eng.engagementName}
                                {hasValues ? ` · ${formatValue(eng.value, symbol)} (${pct.toFixed(1)}%)` : ' · no value set'}
                                {eng.closingSoon && <span className="ml-1 opacity-70">· closing soon</span>}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {engagements.map((eng, i) => {
                    const color = shades[i % shades.length]
                    const pct = hasValues && clientTotal > 0 ? ((eng.value / clientTotal) * 100).toFixed(0) : null
                    return (
                        <div
                            key={eng.engagementId}
                            className={`flex items-center gap-1.5 transition-opacity ${hovered && hovered !== eng.engagementId ? 'opacity-40' : ''}`}
                            onMouseEnter={() => setHovered(eng.engagementId)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${color.legend}`} />
                            <span className="text-xs text-gray-700 font-medium">{eng.engagementName}</span>
                            {hasValues && (
                                <>
                                    <span className={`text-xs font-semibold ${color.text}`}>{formatValue(eng.value, symbol)}</span>
                                    {pct && <span className="text-xs text-gray-400">{pct}%</span>}
                                </>
                            )}
                            {eng.closingSoon && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Soon</span>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function PipelineBar({ items, total, symbol }: { items: ClientPipelineItem[]; total: number; symbol: string }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const [drillClient, setDrillClient] = useState<{ item: ClientPipelineItem; colorIndex: number } | null>(null)

    if (drillClient) {
        return (
            <EngagementDrillBar
                engagements={drillClient.item.engagements}
                clientTotal={drillClient.item.value}
                symbol={symbol}
                clientName={drillClient.item.clientName}
                colorIndex={drillClient.colorIndex}
                onBack={() => setDrillClient(null)}
            />
        )
    }

    if (items.length === 0 || total === 0) {
        const hasItems = items.length > 0
        return (
            <div>
                <div className="relative h-5 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-3">
                    {hasItems ? items.map((item, i) => {
                        const color = BAR_COLORS[i % BAR_COLORS.length]
                        const pct = (item.engagementCount / items.reduce((s, x) => s + x.engagementCount, 0)) * 100
                        return (
                            <div
                                key={item.clientId}
                                style={{ width: `${pct}%` }}
                                onMouseEnter={() => setHovered(item.clientId)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => setDrillClient({ item, colorIndex: i })}
                                className={`h-full ${color.bar} relative group cursor-pointer transition-opacity ${hovered && hovered !== item.clientId ? 'opacity-50' : ''}`}
                            >
                                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                    {item.clientName} · {item.engagementCount} engagement{item.engagementCount !== 1 ? 's' : ''} · no value set · click to drill in
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                </div>
                            </div>
                        )
                    }) : <div className="h-full w-full bg-gray-200" />}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {items.map((item, i) => {
                        const color = BAR_COLORS[i % BAR_COLORS.length]
                        return (
                            <button
                                key={item.clientId}
                                onClick={() => setDrillClient({ item, colorIndex: i })}
                                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${color.legend}`} />
                                <span className="text-xs text-gray-600 font-medium">{item.clientName}</span>
                                <span className="text-xs text-gray-400">{item.engagementCount} eng</span>
                            </button>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="relative h-5 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-3">
                {items.map((item, i) => {
                    const pct = (item.value / total) * 100
                    const color = BAR_COLORS[i % BAR_COLORS.length]
                    return (
                        <div
                            key={item.clientId}
                            style={{ width: `${pct}%` }}
                            onMouseEnter={() => setHovered(item.clientId)}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => setDrillClient({ item, colorIndex: i })}
                            className={`h-full ${color.bar} relative group cursor-pointer transition-opacity ${hovered && hovered !== item.clientId ? 'opacity-50' : ''}`}
                        >
                            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                {item.clientName} · {formatValue(item.value, symbol)} ({pct.toFixed(1)}%) · click to drill in
                                {item.closingSoonValue > 0 && <span className="ml-1 opacity-70">· {formatValue(item.closingSoonValue, symbol)} closing soon</span>}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {items.map((item, i) => {
                    const color = BAR_COLORS[i % BAR_COLORS.length]
                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0'
                    return (
                        <button
                            key={item.clientId}
                            onClick={() => setDrillClient({ item, colorIndex: i })}
                            className={`flex items-center gap-1.5 transition-opacity hover:opacity-70 ${hovered && hovered !== item.clientId ? 'opacity-40' : ''}`}
                            onMouseEnter={() => setHovered(item.clientId)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${color.legend}`} />
                            <span className="text-xs text-gray-700 font-medium">{item.clientName}</span>
                            <span className={`text-xs font-semibold ${color.text}`}>{formatValue(item.value, symbol)}</span>
                            <span className="text-xs text-gray-400">{pct}%</span>
                        </button>
                    )
                })}
            </div>
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

    return (
        <div className="bg-white border border-[#e5e7eb] rounded p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Business Overview</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Client pipeline and active engagements</p>
                </div>
                <button
                    onClick={() => setRefreshTick((t) => t + 1)}
                    className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                <div className="grid grid-cols-4 gap-4">
                    <StatTile icon={Users} label="Active Client(s)" count={totalActiveClients} colorClass="bg-blue-50 text-blue-600" />
                    <StatTile icon={TrendingUp} label="Prospective Client(s)" count={totalProspects} colorClass="bg-indigo-50 text-indigo-600" />
                    <StatTile icon={Briefcase} label="Active Engagement(s)" count={totalEngagements} colorClass="bg-purple-50 text-purple-600" />
                    <StatTile icon={MailOpen} label="Pending Invitation(s)" count={totalPendingInvites} colorClass="bg-amber-50 text-amber-600" />
                </div>

                {(data?.clientCounts?.ON_HOLD ?? 0) > 0 || (data?.clientCounts?.PAST ?? 0) > 0 ? (
                    <div className="flex gap-3 mt-1">
                        {(data?.clientCounts?.ON_HOLD ?? 0) > 0 && (
                            <StatTile icon={PauseCircle} label="On Hold" count={data?.clientCounts?.ON_HOLD ?? 0} colorClass="bg-slate-50 text-slate-500" />
                        )}
                        {(data?.clientCounts?.PAST ?? 0) > 0 && (
                            <StatTile icon={UserMinus} label="Past Clients" count={data?.clientCounts?.PAST ?? 0} colorClass="bg-gray-50 text-gray-500" />
                        )}
                    </div>
                ) : null}
            </div>

            {data?.engagementStatusBreakdown && (data.engagementStatusBreakdown.PLANNED + data.engagementStatusBreakdown.PAUSED) > 0 && (
                <div className={`flex gap-4 mt-1 transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    {data.engagementStatusBreakdown.PLANNED > 0 && (
                        <div className="flex-1"><StatTile icon={CalendarClock} label="Planned Engagement(s)" count={data.engagementStatusBreakdown.PLANNED} colorClass="bg-blue-50 text-blue-600" /></div>
                    )}
                    {data.engagementStatusBreakdown.PAUSED > 0 && (
                        <div className="flex-1"><StatTile icon={PauseCircle} label="Paused Engagement(s)" count={data.engagementStatusBreakdown.PAUSED} colorClass="bg-slate-50 text-slate-500" /></div>
                    )}
                </div>
            )}

            {(data?.clientPipelineBreakdown !== undefined) && (
                <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    <div className="flex items-baseline justify-between mt-5 mb-3">
                        <h3 className="text-sm font-semibold text-gray-500">Revenue Pipeline</h3>
                        <div className="flex items-baseline gap-3">
                            {(closingSoonCount > 0 || overdueDueCount > 0) && (
                                <span className="text-xs text-amber-600 font-medium">
                                    {closingSoonCount + overdueDueCount} closing within 30d
                                    {(data?.closingSoonValue ?? 0) > 0 && ` · ${formatValue(data!.closingSoonValue, data?.currencySymbol)}`}
                                </span>
                            )}
                            {(data?.revenueAtRisk ?? 0) > 0 && (
                                <span className="text-xs text-red-600 font-medium">
                                    {formatValue(data!.revenueAtRisk, data?.currencySymbol)} at risk
                                </span>
                            )}
                            <span className="text-lg font-bold text-gray-900">
                                {(data?.pipelineValue ?? 0) > 0 ? formatValue(data!.pipelineValue, data?.currencySymbol) : `${totalEngagements} engagement${totalEngagements !== 1 ? 's' : ''}`}
                            </span>
                        </div>
                    </div>
                    <div className="bg-[#f3f4f6] rounded p-4 border border-gray-100">
                        <PipelineBar items={data!.clientPipelineBreakdown} total={data?.pipelineValue ?? 0} symbol={data?.currencySymbol ?? ''} />
                    </div>
                </div>
            )}

            {(data?.contractTypeBreakdown?.length ?? 0) > 0 && (
                <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    <h3 className="text-sm font-semibold text-gray-500 mb-3 mt-5">Engagement Types</h3>
                    <div className="flex flex-wrap gap-2">
                        {data!.contractTypeBreakdown.map(({ type, count }) => (
                            <div key={type} className="flex items-center gap-2 px-3 py-1.5 bg-[#f3f4f6] border border-gray-100 rounded">
                                <span className="text-sm font-semibold text-gray-900">{count}</span>
                                <span className="text-xs text-gray-500">{type}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data?.weeklyActivity && (
                <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    <h3 className="text-sm font-semibold text-gray-500 mb-3 mt-5">Activity This Week</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <StatTile icon={UserPlus} label="New Client(s)" count={data.weeklyActivity.newClients} colorClass="bg-blue-50 text-blue-600" />
                        <StatTile icon={Briefcase} label="New Engagement(s)" count={data.weeklyActivity.newEngagements} colorClass="bg-indigo-50 text-indigo-600" />
                        <StatTile icon={Send} label="Invitation(s) Sent" count={data.weeklyActivity.invitationsSent} colorClass="bg-amber-50 text-amber-600" />
                        <StatTile icon={CheckCircle2} label="Engagement(s) Closed" count={data.weeklyActivity.engagementsClosed} colorClass="bg-green-50 text-green-600" />
                    </div>
                </div>
            )}
        </div>
    )
}
