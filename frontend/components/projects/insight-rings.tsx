'use client'

import React from 'react'

/*
 * The rings and score breakdown of the engagement Overview, shared by the dashboard
 * (engagement-insights-dashboard.tsx) and the public demo's static copy of it.
 */

// ─── Donut primitive ──────────────────────────────────────────────────────────
// Reusable SVG donut. Segments stack clockwise from top. Pass `total` to render a
// gauge (single arc over a fixed 0–total scale); omit it to size arcs by their sum.
export function Donut({ segments, total, size = 120, thickness = 14, trackColor = 'rgba(55, 53, 47, 0.07)', centerTop, centerBottom }: {
    segments: { value: number; hex: string }[]
    total?: number
    size?: number
    thickness?: number
    trackColor?: string
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    // useId can contain ':' or '«»', which an SVG url(#…) reference may not resolve; keep it plain.
    const plateId = `donut-plate-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const sum = total ?? segments.reduce((s, x) => s + x.value, 0)
    const R = (size - thickness) / 2
    const c = size / 2
    const C = 2 * Math.PI * R
    const visible = sum > 0 ? segments.filter((s) => s.value > 0) : []
    // Several segments get a 2px gap at each join so they read as separate parts; a single arc
    // (a gauge) gets rounded ends instead.
    const joinGap = visible.length > 1 ? 2 : 0
    let acc = 0
    const arcs = visible.map((s) => {
        const frac = s.value / sum
        const arc = { hex: s.hex, len: Math.max(0, frac * C - joinGap), offset: -acc * C }
        acc += frac
        return arc
    })
    const plateR = R - thickness / 2 - 3
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <defs>
                    {/* A faint dish in the middle, so the ring reads as a dial rather than a sticker. */}
                    <radialGradient id={plateId} cx="50%" cy="50%" r="50%">
                        <stop offset="70%" stopColor="#ffffff" />
                        <stop offset="100%" stopColor="#f6f5f3" />
                    </radialGradient>
                </defs>
                {plateR > 0 && (
                    <circle cx={c} cy={c} r={plateR} fill={`url(#${plateId})`} stroke="rgba(55, 53, 47, 0.06)" strokeWidth={1} />
                )}
                <circle cx={c} cy={c} r={R} fill="none" stroke={trackColor} strokeWidth={thickness} />
                {/* Only the colored arcs lift, softly; the track stays flat. */}
                <g style={{ filter: 'drop-shadow(0 1px 1.5px rgba(15, 23, 42, 0.16))' }}>
                    {arcs.map((a, i) => (
                        <circle key={i} cx={c} cy={c} r={R} fill="none" style={{ stroke: a.hex }} strokeWidth={thickness}
                            strokeLinecap={arcs.length === 1 && a.len < C - 1 ? 'round' : 'butt'}
                            strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={a.offset} />
                    ))}
                </g>
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

/**
 * Data colors (.claude/plans/app-design-refinements.md, Wave 3 "Data colors"): the status
 * language's bar hues, so the Overview's charts read like the Board. Statuses and health bands use
 * the stages; data that isn't a status uses the categorical gray ramp. Never the action color: a
 * firm's theme would otherwise change what its charts mean. Values are CSS variables, so tint them
 * with color-mix(), not by appending an alpha to a hex.
 */
export const DATA = {
    notStarted: 'var(--ui-status-not-started-bar)',
    underway: 'var(--ui-status-underway-bar)',
    waiting: 'var(--ui-status-waiting-bar)',
    done: 'var(--ui-status-done-bar)',
    problem: 'var(--ui-status-problem-bar)',
    category1: 'var(--ui-data-category-1)',
    category2: 'var(--ui-data-category-2)',
    category3: 'var(--ui-data-category-3)',
    category4: 'var(--ui-data-category-4)',
} as const

/** A data color at `pct`% over transparent, e.g. the pale track behind a bar. */
export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

/**
 * @deprecated Replaced by DATA (the Overview's charts now share the Board's palette). Kept until the
 * refinements are signed off; nothing renders with it.
 */
export const RING = {
    amber:  '#fcd34d', // amber-300
    blue:   '#5A78FF', // Firma brand blue
    indigo: '#818cf8', // indigo-400
    green:  '#069668', // Firma brand green (--primary)
    red:    '#f87171', // red-400
    gray:   '#cbd5e1', // slate-300
}

// Donut + labelled legend + total row. Used for the Delivery Status / Schedule rings.
export function RingWithLegend({ items, total, centerTop, centerBottom, size = 108 }: {
    items: { label: string; hex: string; value: number }[]
    total?: number
    centerTop: React.ReactNode
    centerBottom: React.ReactNode
    size?: number
}) {
    const sum = total ?? items.reduce((s, i) => s + i.value, 0)
    return (
        <div className="flex flex-col items-center gap-3 w-full">
            <Donut size={size} segments={items.map((i) => ({ value: i.value, hex: i.hex }))} total={total} centerTop={centerTop} centerBottom={centerBottom} />
            <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                {items.map((i) => (
                    <div key={i.label} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: i.hex }} />
                        <span className="text-fg-muted truncate">{i.label}</span>
                        <span className="ml-auto font-semibold text-fg tabular-nums">{i.value}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2 text-xs pt-1.5 mt-0.5 border-t border-line">
                    <span className="text-fg-muted">Total</span>
                    <span className="ml-auto font-semibold text-fg tabular-nums">{sum}</span>
                </div>
            </div>
        </div>
    )
}

// Concentric progress rings — each ring (outer→inner) fills to its coverage %.
export function ConcentricRings({ rings, size = 128, centerTop, centerBottom }: {
    rings: { pct: number; hex: string }[]
    size?: number
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    const c = size / 2
    const thickness = 8
    const gap = 7
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                {rings.map((r, i) => {
                    const R = size / 2 - thickness / 2 - i * (thickness + gap)
                    const C = 2 * Math.PI * R
                    const arc = Math.max(0, Math.min(1, r.pct / 100)) * C
                    return (
                        <g key={i}>
                            <circle cx={c} cy={c} r={R} fill="none" stroke="rgba(55, 53, 47, 0.07)" strokeWidth={thickness} />
                            {arc > 0 && (
                                <circle cx={c} cy={c} r={R} fill="none" strokeWidth={thickness} strokeDasharray={`${arc} ${C}`} strokeLinecap="round" style={{ stroke: r.hex, filter: 'drop-shadow(0 1px 1.5px rgba(15, 23, 42, 0.16))' }} />
                            )}
                        </g>
                    )
                })}
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

export function PlanningGapRow({ hex, label, missing, total }: { hex: string; label: string; missing: number; total: number }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
            <span className="text-fg-muted truncate flex-1">{label}</span>
            <span className={`shrink-0 font-medium tabular-nums ${missing > 0 ? 'text-status-waiting-fg' : 'text-fg-subtle'}`}>{missing}/{total} not set</span>
        </div>
    )
}

/**
 * What lowered a score below 100, worst first: each issue with its severity and the points it
 * cost. It sits directly under its score ring, beside the "100 − x = score" sum it explains.
 * Shared by Engagement Health and File Organization.
 */
export function ScoreDeductions({ penalties, emptyText, className = '' }: {
    penalties: { label: string; points: number }[]
    emptyText: string
    className?: string
}) {
    // Severity as plain colored text — a tinted chip here read as decoration rather than meaning.
    // Severity in the status palette: High is problem red, Medium waiting amber, Low gray.
    const severity = (pts: number) => pts >= 15 ? { text: 'High', cls: 'text-status-problem-fg' } : pts >= 8 ? { text: 'Medium', cls: 'text-status-waiting-fg' } : { text: 'Low', cls: 'text-fg-subtle' }
    const deductClass = (pts: number) => pts >= 15 ? 'text-status-problem-fg font-bold' : pts >= 8 ? 'text-status-waiting-fg font-semibold' : 'text-fg-subtle font-medium'
    if (penalties.length === 0) {
        return <p className={`pt-3 border-t border-line text-[11px] text-status-done-fg font-medium text-center ${className}`}>{emptyText}</p>
    }
    return (
        <div className={`pt-3 border-t border-line flex flex-col gap-2 ${className}`}>
            <p className="text-[11px] font-medium text-fg-subtle">What lowered the score</p>
            {penalties.map((p) => {
                const sev = severity(p.points)
                return (
                    <div key={p.label} className="flex items-center gap-1.5 text-[11px]">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${p.points >= 15 ? 'bg-status-problem-bar' : p.points >= 8 ? 'bg-status-waiting-bar' : 'bg-status-not-started-bar'}`} />
                        <span className="text-fg-muted truncate flex-1">{p.label}</span>
                        <span className={`shrink-0 text-[11px] font-medium ${sev.cls}`}>{sev.text}</span>
                        <span className={`tabular-nums shrink-0 ${deductClass(p.points)}`}>−{p.points}</span>
                    </div>
                )
            })}
        </div>
    )
}
