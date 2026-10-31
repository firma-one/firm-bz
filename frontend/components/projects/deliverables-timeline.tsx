'use client'

import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/ui/status-icon'
import { STAGE_ICON_CLASSES, statusOf } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import { ChartBlock } from './overview-charts'
import { Empty, type OverviewDeliverable } from './engagement-overview-sections'

/*
 * The Overview's deliverables as a Linear-style timeline: neutral bars with the name above, months
 * over a row of day numbers, and color only where it means something (the stage icon, the due-date
 * diamond, today, time past a due date). Supersedes DeliverablesTimeline in
 * engagement-overview-sections.tsx, which stays until this one is signed off.
 */

const DAY_MS = 86400000
/** A bar runs this far past its diamond, so the diamond sits inside the bar's end rather than on its edge. */
const DIAMOND_INSET_PX = 14
/** Below this the plot scrolls sideways instead of squeezing the axis. */
const MIN_PLOT_PX = 560
const FADE_OUT = 'linear-gradient(90deg, #000 calc(100% - 56px), transparent)'
// Literal rgba of --ui-status-problem-icon: html2canvas (the PDF export) can't resolve color-mix().
const LATE_LINE = 'rgba(217, 98, 90, 0.55)'
const LATE_FILL = 'linear-gradient(90deg, rgba(217, 98, 90, 0.06), rgba(217, 98, 90, 0.16))'

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** The lower axis row: every day or two on a short window, Mondays on a longer one; never more than ~16. */
function axisTicks(minMs: number, maxMs: number): number[] {
    const spanDays = (maxMs - minMs) / DAY_MS
    const step = [1, 2, 7, 14, 28].find((s) => spanDays / s <= 16) ?? Math.ceil(spanDays / 16 / 7) * 7
    const d = new Date(minMs)
    d.setHours(0, 0, 0, 0)
    if (step >= 7) while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
    const ticks: number[] = []
    for (; d.getTime() <= maxMs; d.setDate(d.getDate() + step)) {
        if (d.getTime() >= minMs) ticks.push(d.getTime())
    }
    return ticks
}

/** The month the window opens in, then every month boundary inside it. A year shows at January, or on the first label when the window crosses one. */
function axisMonths(minMs: number, maxMs: number) {
    const label = (d: Date, withYear: boolean) =>
        d.toLocaleDateString(undefined, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' })
    const first = new Date(minMs)
    const crossesYear = first.getFullYear() !== new Date(maxMs).getFullYear()
    const months = [{ ms: minMs, label: label(first, crossesYear), boundary: false }]
    for (const m = new Date(first.getFullYear(), first.getMonth() + 1, 1); m.getTime() <= maxMs; m.setMonth(m.getMonth() + 1)) {
        months.push({ ms: m.getTime(), label: label(m, m.getMonth() === 0), boundary: true })
    }
    return months
}

export function DeliverablesTimeline({ deliverables, startDate, dueDate, nowMs }: {
    deliverables: OverviewDeliverable[]
    startDate: string | null
    dueDate: string | null
    nowMs: number
}) {
    const [zoom, setZoom] = useState<'30d' | '90d' | 'full'>('full')

    const rows = deliverables.map((d) => {
        const approved = d.stage === 'approved'
        const due = d.dueDate ? new Date(d.dueDate).getTime() : null
        const finalized = d.finalizedAt ? new Date(d.finalizedAt).getTime() : null
        // What the diamond marks: the due date, or the approval when there was no due date. None = open-ended.
        const markMs = due ?? (approved ? finalized ?? nowMs : null)
        const late = d.isOverdue && markMs !== null
        const created = d.createdAt ? new Date(d.createdAt).getTime() : nowMs
        return {
            ...d,
            approved,
            finalized,
            markMs,
            late,
            startMs: Math.min(created, markMs ?? created),
            // A late bar runs on to today; so does one with no due date.
            endMs: late || markMs === null ? nowMs : markMs,
        }
    })

    const candidates = [nowMs, ...rows.flatMap((r) => [r.startMs, r.endMs])]
    for (const v of [startDate, dueDate]) if (v) candidates.push(new Date(v).getTime())
    const halfWindow = zoom === '30d' ? 15 : zoom === '90d' ? 45 : null
    const minMs = halfWindow !== null ? nowMs - halfWindow * DAY_MS : Math.min(...candidates)
    const maxMs = halfWindow !== null ? nowMs + halfWindow * DAY_MS : Math.max(...candidates)
    const span = Math.max(DAY_MS, maxMs - minMs)
    const at = (ms: number) => Math.max(0, Math.min(100, ((ms - minMs) / span) * 100))
    const inView = (ms: number) => ms >= minMs && ms <= maxMs
    const visible = rows
        .filter((r) => halfWindow === null || (r.endMs >= minMs && r.startMs <= maxMs))
        // A staircase by start date, the way a timeline reads; due date breaks ties.
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

    const nowPct = at(nowMs)
    const engDueMs = dueDate ? new Date(dueDate).getTime() : null
    const engDuePct = engDueMs !== null && inView(engDueMs) ? at(engDueMs) : null
    const months = axisMonths(minMs, maxMs).map((m) => ({ ...m, pos: at(m.ms) }))
    // The opening month's name gives way when the next month starts right beside it.
    const monthLabels = months.filter((m) => m.boundary || !(months[1] && months[1].pos < 8))
    const ticks = axisTicks(minMs, maxMs)
        .map((t) => ({ t, pos: at(t) }))
        // Today's chip covers the numbers under it; numbers at the very edges would hang off the plot.
        .filter(({ pos }) => Math.abs(pos - nowPct) > 4.5 && pos > 2 && pos < 98)
    const engDueLabel = engDuePct !== null && engDuePct > 20
        && !monthLabels.some((m) => m.pos > engDuePct - 18 && m.pos < engDuePct + 1)
    // The chip centers on today, except where centering would push it off either end.
    const chipShift = nowPct < 6 ? 'translate-x-0' : nowPct > 94 ? '-translate-x-full' : '-translate-x-1/2'

    return (
        <ChartBlock
            icon={FolderPlus}
            title="Deliverables"
            info="Each bar runs from when the folder was marked a deliverable to its due date. The diamond marks the due date, filled once the deliverable is approved. A red dashed stretch is time past a due date; a bar that fades out has no due date. The indigo line is today; the solid gray line is the engagement's due date."
            aside={
                deliverables.length > 0 ? (
                    <div className="flex items-center gap-0.5 rounded-control bg-surface-muted p-0.5" data-no-export="">
                        {(['30d', '90d', 'full'] as const).map((w) => (
                            <button
                                key={w}
                                type="button"
                                onClick={() => setZoom(w)}
                                className={cn('rounded-[4px] px-2 py-0.5 text-caption font-medium transition-colors',
                                    zoom === w ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg-muted')}
                            >
                                {w === 'full' ? 'All' : w.toUpperCase()}
                            </button>
                        ))}
                    </div>
                ) : undefined
            }
        >
            {deliverables.length === 0 ? (
                <Empty>No deliverables yet.</Empty>
            ) : visible.length === 0 ? (
                <Empty>No deliverables in this window.</Empty>
            ) : (
                <div className="overflow-x-auto">
                    {/* Right padding leaves room for a bar that runs past a diamond at the window's end. */}
                    <div className="relative pr-4" style={{ minWidth: MIN_PLOT_PX }}>
                        <div className="relative">
                            {/* Behind the bars: month boundaries, the engagement's due date, and today. */}
                            <div aria-hidden className="pointer-events-none absolute inset-0">
                                {months.filter((m) => m.boundary).map((m) => (
                                    <div key={m.ms} className="absolute inset-y-0 border-l border-dashed border-line-strong" style={{ left: `${m.pos}%` }} />
                                ))}
                                {engDuePct !== null && (
                                    <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${engDuePct}%` }} />
                                )}
                                <div className="absolute bottom-0 top-10 w-px bg-[var(--ui-timeline-today)]" style={{ left: `${nowPct}%` }} />
                            </div>

                            {/* The axis: months above, day numbers below, today as a chip. */}
                            <div className="relative h-[46px] border-b border-line">
                                {monthLabels.map((m) => (
                                    <span
                                        key={m.ms}
                                        className="absolute top-1 whitespace-nowrap pl-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-fg-muted"
                                        style={{ left: `${m.pos}%` }}
                                    >
                                        {m.label}
                                    </span>
                                ))}
                                {engDueLabel && engDueMs !== null && (
                                    <span
                                        className="absolute top-1 -translate-x-full whitespace-nowrap pr-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-fg-subtle"
                                        style={{ left: `${engDuePct}%` }}
                                    >
                                        Due {shortDate(engDueMs)}
                                    </span>
                                )}
                                {ticks.map(({ t, pos }) => (
                                    <span key={t} className="absolute top-[23px] -translate-x-1/2 text-[11px] tabular-nums text-fg-subtle" style={{ left: `${pos}%` }}>
                                        {new Date(t).getDate()}
                                    </span>
                                ))}
                                <span
                                    className={cn('absolute top-5 whitespace-nowrap rounded-[4px] bg-[var(--ui-timeline-today)] px-1.5 py-[3px] text-[10.5px] font-semibold uppercase leading-none tracking-[0.04em] text-white', chipShift)}
                                    style={{ left: `${nowPct}%` }}
                                >
                                    {shortDate(nowMs)}
                                </span>
                            </div>

                            <div className="relative pb-1.5 pt-2.5">
                                {visible.map((r) => {
                                    const { stage, label } = statusOf('deliverable', r.stage)
                                    const startPct = at(r.startMs)
                                    const endPct = at(r.endMs)
                                    const markPct = r.markMs !== null && inView(r.markMs) ? at(r.markMs) : null
                                    const open = r.markMs === null
                                    const clippedLeft = r.startMs < minMs
                                    // The bar carries on past the window's right edge, or has no end at all.
                                    const runsOn = open || r.endMs > maxMs
                                    const daysLate = r.late && r.markMs !== null ? Math.max(1, Math.floor((nowMs - r.markMs) / DAY_MS)) : 0
                                    const dateText = open
                                        ? 'No due date'
                                        : r.late
                                            ? `${daysLate} day${daysLate === 1 ? '' : 's'} late`
                                            : r.approved && r.finalized !== null ? shortDate(r.finalized) : shortDate(r.markMs!)
                                    const hint = `${r.docId ? `${r.docId} · ` : ''}${r.approved
                                        ? `${label} ${dateText}`
                                        : `${label} · ${open ? dateText : r.late ? `Due ${shortDate(r.markMs!)}, ${dateText}` : `Due ${dateText}`}`}`

                                    // The span up to the due date. A late bar stops at the due date and its overrun takes over.
                                    const mainEndPct = r.late ? (markPct ?? 0) : endPct
                                    const insetPx = r.late || runsOn ? 0 : DIAMOND_INSET_PX
                                    const showMain = !r.late || (markPct !== null && markPct > startPct)
                                    const mainBar = (
                                        <div
                                            className={cn(
                                                'absolute top-[29px] h-6 rounded-md border border-line-strong bg-surface-muted shadow-[0_1px_1px_rgba(15,15,15,0.03)] transition-colors group-hover:border-[rgba(55,53,47,0.3)]',
                                                clippedLeft && 'rounded-l-none border-l-0',
                                                r.late && 'rounded-r-none',
                                                runsOn && 'rounded-r-none border-r-0',
                                            )}
                                            style={{
                                                left: `${startPct}%`,
                                                width: `max(20px, calc(${mainEndPct - startPct}% + ${insetPx}px))`,
                                                ...(runsOn ? { maskImage: FADE_OUT, WebkitMaskImage: FADE_OUT } : {}),
                                            }}
                                        />
                                    )
                                    const overrun = r.late ? (
                                        <div
                                            className="absolute top-[29px] h-6 rounded-r-md border border-l-0 border-dashed"
                                            style={{
                                                left: `${markPct ?? 0}%`,
                                                width: `${nowPct - (markPct ?? 0)}%`,
                                                borderColor: LATE_LINE,
                                                background: LATE_FILL,
                                            }}
                                        />
                                    ) : null

                                    // The caption sits under the diamond; centered, unless that would hang off an edge.
                                    const capPct = r.markMs !== null ? at(r.markMs) : nowPct
                                    const capShift = open || capPct > 88
                                        ? (open ? '-translate-x-full' : 'translate-x-[calc(-100%_+_8px)]')
                                        : capPct < 8 ? '-translate-x-2' : '-translate-x-1/2'
                                    // A name that starts late in the window ends at its bar's end instead, so it stays on the card.
                                    const anchorRight = startPct > 55

                                    return (
                                        <div key={r.id} className="group relative h-[72px]">
                                            <div
                                                className={cn('absolute top-1.5 flex items-center gap-[7px] whitespace-nowrap', anchorRight && 'justify-end')}
                                                style={anchorRight
                                                    ? { right: `${100 - endPct}%`, maxWidth: `${endPct}%` }
                                                    : { left: `${startPct}%`, maxWidth: `${100 - startPct}%` }}
                                            >
                                                <StatusIcon stage={stage} size={14} />
                                                <Hint label={r.name}>
                                                    <span className="min-w-0 truncate text-small font-medium text-fg">{r.name}</span>
                                                </Hint>
                                                {r.docId && <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{r.docId}</span>}
                                            </div>

                                            {showMain && <Hint label={hint}>{mainBar}</Hint>}
                                            {overrun && (showMain ? overrun : <Hint label={hint}>{overrun}</Hint>)}

                                            {markPct !== null && (
                                                <div
                                                    className={cn(
                                                        'absolute top-[41px] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1.5px] border-[1.5px] border-current',
                                                        r.late ? 'text-status-problem-icon' : STAGE_ICON_CLASSES[stage],
                                                        r.approved ? 'bg-current' : 'bg-surface',
                                                    )}
                                                    style={{ left: `${markPct}%` }}
                                                />
                                            )}

                                            <div
                                                className={cn('absolute top-14 whitespace-nowrap text-[11px]', capShift,
                                                    r.late ? 'text-status-problem-fg' : 'text-fg-subtle')}
                                                style={{ left: `${capPct}%` }}
                                            >
                                                <span className={cn('font-medium', !r.late && 'text-fg-muted')}>{label}</span>
                                                {' · '}
                                                {dateText}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ChartBlock>
    )
}
