'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { DemoClient, DemoEngagement } from '@/lib/demo/static-demo-data'

const BAR_COLORS = [
    { bar: 'bg-blue-500', legend: 'bg-blue-500', text: 'text-blue-600' },
    { bar: 'bg-indigo-500', legend: 'bg-indigo-500', text: 'text-indigo-600' },
    { bar: 'bg-violet-500', legend: 'bg-violet-500', text: 'text-violet-600' },
    { bar: 'bg-teal-500', legend: 'bg-teal-500', text: 'text-teal-600' },
]

// Shades per color family for the engagement drill-down — first engagement always matches
// the parent bar color exactly, subsequent ones fan out. Matches firm-business-insights.tsx.
const BAR_COLOR_SHADES: { bar: string; legend: string; text: string }[][] = [
    [ // blue
        { bar: 'bg-blue-500', legend: 'bg-blue-500', text: 'text-blue-600' },
        { bar: 'bg-blue-700', legend: 'bg-blue-700', text: 'text-blue-800' },
        { bar: 'bg-blue-400', legend: 'bg-blue-400', text: 'text-blue-500' },
    ],
    [ // indigo
        { bar: 'bg-indigo-500', legend: 'bg-indigo-500', text: 'text-indigo-600' },
        { bar: 'bg-indigo-700', legend: 'bg-indigo-700', text: 'text-indigo-800' },
        { bar: 'bg-indigo-400', legend: 'bg-indigo-400', text: 'text-indigo-500' },
    ],
    [ // violet
        { bar: 'bg-violet-500', legend: 'bg-violet-500', text: 'text-violet-600' },
        { bar: 'bg-violet-700', legend: 'bg-violet-700', text: 'text-violet-800' },
        { bar: 'bg-violet-400', legend: 'bg-violet-400', text: 'text-violet-500' },
    ],
    [ // teal
        { bar: 'bg-teal-500', legend: 'bg-teal-500', text: 'text-teal-600' },
        { bar: 'bg-teal-700', legend: 'bg-teal-700', text: 'text-teal-800' },
        { bar: 'bg-teal-400', legend: 'bg-teal-400', text: 'text-teal-500' },
    ],
]

function formatValue(val: number): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
    return `$${val.toFixed(0)}`
}

function engagementValue(e: DemoEngagement): number {
    return Number(e.rateOrValue ?? 0) || 0
}

function EngagementDrillBar({ client, colorIndex, onBack }: { client: DemoClient; colorIndex: number; onBack: () => void }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const engagements = client.engagements
    const clientTotal = engagements.reduce((sum, e) => sum + engagementValue(e), 0)
    const hasValues = clientTotal > 0
    const shades = BAR_COLOR_SHADES[colorIndex % BAR_COLOR_SHADES.length]

    return (
        <div>
            <div className="flex items-center gap-2 h-8 mb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-2.5 h-full rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 transition-all text-gray-700 font-medium text-xs"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                </button>
                <span className="text-sm font-bold text-gray-900">{client.name}</span>
                <span className="text-xs text-gray-400">— {engagements.length} engagement{engagements.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-sm font-bold text-gray-900">{hasValues ? formatValue(clientTotal) : `${engagements.length} eng`}</span>
            </div>

            <div className="relative h-5 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-3">
                {engagements.map((eng, i) => {
                    const color = shades[i % shades.length]
                    const value = engagementValue(eng)
                    const pct = hasValues ? (value / clientTotal) * 100 : (1 / engagements.length) * 100
                    return (
                        <div
                            key={eng.slug}
                            style={{ width: `${pct}%` }}
                            onMouseEnter={() => setHovered(eng.slug)}
                            onMouseLeave={() => setHovered(null)}
                            className={`h-full ${color.bar} relative group cursor-default transition-opacity ${hovered && hovered !== eng.slug ? 'opacity-50' : ''}`}
                        >
                            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                {eng.name}
                                {hasValues ? ` · ${formatValue(value)} (${pct.toFixed(1)}%)` : ' · no value set'}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {engagements.map((eng, i) => {
                    const color = shades[i % shades.length]
                    const value = engagementValue(eng)
                    const pct = hasValues ? ((value / clientTotal) * 100).toFixed(0) : null
                    return (
                        <div
                            key={eng.slug}
                            className={`flex items-start gap-2 transition-opacity ${hovered && hovered !== eng.slug ? 'opacity-40' : ''}`}
                            onMouseEnter={() => setHovered(eng.slug)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${color.legend}`} />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-700 font-medium leading-tight">{eng.name}</span>
                                <div className="flex items-center gap-1.5">
                                    {eng.contractType && <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{eng.contractType}</span>}
                                    {hasValues && (
                                        <>
                                            <span className={`text-xs font-semibold ${color.text}`}>{formatValue(value)}</span>
                                            {pct && <span className="text-xs text-gray-400">{pct}%</span>}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/** Static counterpart to PipelineBar in firm-business-insights.tsx — click a client segment to drill into its per-engagement revenue breakdown, matching the real interaction exactly. */
export function DemoPipelineBar({ clients }: { clients: DemoClient[] }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const [drillClient, setDrillClient] = useState<{ client: DemoClient; colorIndex: number } | null>(null)
    const isDrilled = drillClient !== null

    const items = clients.filter((c) => c.engagements.length > 0)
    const total = items.reduce((sum, c) => sum + c.engagements.reduce((s, e) => s + engagementValue(e), 0), 0)
    const hasValues = total > 0

    return (
        <div className="relative overflow-hidden">
            <div className={`transition-all duration-250 ease-in-out ${isDrilled ? 'opacity-0 -translate-x-4 pointer-events-none absolute inset-x-0 top-0' : 'opacity-100 translate-x-0'}`}>
                <div className="flex items-center gap-2 mb-3 h-8">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">All Clients</span>
                    {hasValues && <span className="ml-auto text-sm font-bold text-gray-900">{formatValue(total)}</span>}
                </div>
                <div className="relative h-5 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-3">
                    {items.map((client, i) => {
                        const color = BAR_COLORS[i % BAR_COLORS.length]
                        const value = client.engagements.reduce((s, e) => s + engagementValue(e), 0)
                        const pct = hasValues ? (value / total) * 100 : (client.engagements.length / items.reduce((s, c) => s + c.engagements.length, 0)) * 100
                        return (
                            <div
                                key={client.slug}
                                style={{ width: `${pct}%` }}
                                onMouseEnter={() => setHovered(client.slug)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => setDrillClient({ client, colorIndex: i })}
                                className={`h-full ${color.bar} relative group cursor-pointer transition-opacity ${hovered && hovered !== client.slug ? 'opacity-50' : ''}`}
                            >
                                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                    {client.name} · {hasValues ? `${formatValue(value)} (${pct.toFixed(1)}%)` : `${client.engagements.length} engagement${client.engagements.length !== 1 ? 's' : ''}`} · click to drill in
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {items.map((client, i) => {
                        const color = BAR_COLORS[i % BAR_COLORS.length]
                        const value = client.engagements.reduce((s, e) => s + engagementValue(e), 0)
                        const pct = hasValues ? ((value / total) * 100).toFixed(0) : null
                        return (
                            <button
                                key={client.slug}
                                onClick={() => setDrillClient({ client, colorIndex: i })}
                                className={`flex items-start gap-2 transition-opacity hover:opacity-70 ${hovered && hovered !== client.slug ? 'opacity-40' : ''}`}
                                onMouseEnter={() => setHovered(client.slug)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${color.legend}`} />
                                <div className="flex flex-col gap-0.5 text-left">
                                    <span className="text-xs text-gray-700 font-medium leading-tight">{client.name}</span>
                                    <div className="flex items-center gap-1.5">
                                        {value > 0 && pct ? (
                                            <>
                                                <span className={`text-xs font-semibold ${color.text}`}>{formatValue(value)}</span>
                                                <span className="text-xs text-gray-400">{pct}%</span>
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-400 font-semibold">—</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className={`transition-all duration-250 ease-in-out ${isDrilled ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none absolute inset-x-0 top-0'}`}>
                {drillClient && (
                    <EngagementDrillBar
                        client={drillClient.client}
                        colorIndex={drillClient.colorIndex}
                        onBack={() => setDrillClient(null)}
                    />
                )}
            </div>
        </div>
    )
}
