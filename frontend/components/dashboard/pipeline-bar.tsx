'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ClientPipelineItem, EngagementPipelineItem } from '@/app/api/firms/[firmId]/insights/route'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { StagePill } from '@/components/projects/engagement-overview-sections'

/*
 * The client pipeline bar on the Firm Overview, with its drill-down into a client's engagements.
 * Shared with the tour's Overview.
 */

export function formatValue(val: number, symbol = ''): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `${symbol}${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${symbol}${(val / 1_000).toFixed(0)}K`
    return `${symbol}${val.toFixed(0)}`
}

/**
 * Pipeline segments and legend dots: clients and engagements are categories, not statuses, so they
 * take the warm gray ramp (--ui-data-category-1…4), darkest first (app-design-refinements.md,
 * "Data colors"). The amounts carry the meaning.
 */
const PIPELINE_COLORS = [1, 2, 3, 4] as const
type PipelineColor = (typeof PIPELINE_COLORS)[number]
const chartColor = (c: PipelineColor) => `var(--ui-data-category-${c})`

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
                                    {eng.closingSoon && <StagePill stage="waiting">Soon</StagePill>}
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
                {/* No hint row above the bar: the total and "click a client" are in the block's
                    heading and info tip (firm-overview-sections.tsx), so this bar starts level
                    with the bars in the blocks beside it. */}
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
                                            <span className="text-fg-subtle">{item.engagementCount} engagement{item.engagementCount !== 1 ? 's' : ''}</span>
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
