'use client'

import React from 'react'
import { Info } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { STAGE_PILL_CLASSES, type StatusStage } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import { paceStatus } from '@/lib/insights/pace'

/*
 * The charts of the engagement Overview, after the rings (.claude/plans/engagement-overview-redesign.md).
 * Linear's segmented progress bar, Jira's horizontal "types of work" meters.
 * Only the Overall Health Score keeps a ring: it is a score out of 100, which is what a gauge is
 * for. Shared by the dashboard (engagement-insights-dashboard.tsx) and the tour's static copy.
 */

export interface ChartSegment {
    label: string
    hex: string
    value: number
}

/** An info icon with a tooltip, beside a block's title. */
export function InfoHint({ text, label }: { text: string; label: string }) {
    return (
        <Hint label={<span className="block max-w-[260px] text-xs leading-relaxed">{text}</span>}>
            <button type="button" aria-label={label} className="inline-flex items-center text-fg-subtle transition-colors hover:text-fg-muted" onClick={(e) => e.preventDefault()}>
                <Info className="h-3 w-3" />
            </button>
        </Hint>
    )
}

/**
 * A titled block: icon, title, an optional info tip, and a right-aligned summary ("0 of 1
 * approved"). `id` is the anchor the Action Center's "Show in…" button scrolls to.
 */
export function ChartBlock({ id, icon: Icon, title, info, aside, className, fill = false, children }: {
    id?: string
    icon: React.ElementType
    title: string
    info?: string
    aside?: React.ReactNode
    className?: string
    /** Grow to the parent's height and center the content under the title (cards beside the summary). */
    fill?: boolean
    children: React.ReactNode
}) {
    return (
        <div id={id} className={cn('flex min-w-0 scroll-mt-24 flex-col gap-2.5', fill && 'flex-1', className)}>
            {/* Wraps rather than truncating: on a phone the summary drops under the title. */}
            <div className="flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                <p className="text-small font-medium text-fg">{title}</p>
                {info && <InfoHint text={info} label={`About ${title}`} />}
                {aside && <div className="ml-auto text-small tabular-nums text-fg-muted">{aside}</div>}
            </div>
            {fill ? <div className="flex flex-1 flex-col justify-center gap-2.5">{children}</div> : children}
        </div>
    )
}

/**
 * A 100% bar split into parts, in the order given (workflow order for stages). Parts at zero take
 * no room; with nothing to show it is an empty track.
 */
export function SegmentedBar({ segments, className }: { segments: ChartSegment[]; className?: string }) {
    const visible = segments.filter((s) => s.value > 0)
    return (
        <div className={cn('flex h-2 w-full gap-[2px] overflow-hidden rounded-full', visible.length === 0 && 'bg-surface-muted', className)}>
            {visible.map((s) => (
                <Hint key={s.label} label={`${s.label}: ${s.value}`}>
                    <div className="h-full min-w-[6px]" style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.hex }} />
                </Hint>
            ))}
        </div>
    )
}

/** Dot, label and count for each part, in one wrapping line. Parts at zero are muted. */
export function Legend({ items, className }: { items: ChartSegment[]; className?: string }) {
    return (
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
            {items.map((i) => (
                <span key={i.label} className={cn('inline-flex items-center gap-1.5 text-caption', i.value > 0 ? 'text-fg-muted' : 'text-fg-subtle')}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.value > 0 ? i.hex : 'var(--ui-line-strong)' }} />
                    {i.label}
                    <span className={cn('tabular-nums', i.value > 0 && 'font-medium text-fg')}>{i.value}</span>
                </span>
            ))}
        </div>
    )
}

/**
 * One horizontal meter: label, a value on the right ("1 of 4 set"), and a thin bar filled to
 * `pct`. Used for coverage (filled is good) and for issue shares (filled is the problem).
 */
export function Meter({ label, valueText, pct, hex, muted = false, info }: {
    label: string
    valueText: React.ReactNode
    pct: number
    hex: string
    muted?: boolean
    info?: string
}) {
    const width = Math.max(0, Math.min(100, pct))
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-small">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-fg-muted">{label}</span>
                    {info && <InfoHint text={info} label={`About ${label}`} />}
                </span>
                <span className={cn('shrink-0 tabular-nums', muted ? 'text-fg-subtle' : 'text-fg')}>{valueText}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                {width > 0 && <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: hex }} />}
            </div>
        </div>
    )
}

/** Where delivery stands against the clock, as a tag. The rule lives in lib, shared with the Firm Overview. */
export { paceStatus }

/**
 * Pace in the status palette (app-design-refinements.md, "Data colors"): on pace is Done, behind is
 * Waiting, and only far behind (delivery more than 35 points under the clock) is red. The rule that
 * names the state (lib/insights/pace.ts) is unchanged; this only colors it.
 */
function paceStage(deliveredPct: number, timePct: number, color: 'green' | 'yellow' | 'red'): StatusStage {
    if (color === 'green') return 'done'
    return timePct - deliveredPct > 35 ? 'problem' : 'waiting'
}

/** Delivered against time elapsed, two short bars on one scale, so behind-pace is visible. */
export function PaceBars({ deliveredPct, timePct, hex }: { deliveredPct: number; timePct: number; hex: { delivered: string; time: string } }) {
    const status = paceStatus(deliveredPct, timePct)
    return (
        <div className="flex flex-col gap-1.5">
            {([['Delivered', deliveredPct, hex.delivered], ['Time elapsed', timePct, hex.time]] as const).map(([label, pct, color]) => (
                <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-small">
                    <span className="text-fg-muted">{label}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        {pct > 0 && <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />}
                    </div>
                    <span className="text-right tabular-nums text-fg">{pct}%</span>
                </div>
            ))}
            {/* A flex row, not a plain block: the PDF export (html2canvas) paints an inline tag's
                background over its own text, which left an empty pink chip. */}
            <div className="flex">
                <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-control px-1.5 text-caption', STAGE_PILL_CLASSES[paceStage(deliveredPct, timePct, status.color)])}>
                    {status.text}
                </span>
            </div>
        </div>
    )
}

/**
 * One metric. With no data yet it still shows, saying so and what it will track: new customers
 * and prospects should see that it exists and what to aim for.
 */
export function Stat({ label, value, caption, emptyCaption, info, tone }: {
    label: string
    /** null = no data yet. */
    value: React.ReactNode | null
    caption?: React.ReactNode
    emptyCaption: string
    info?: string
    tone?: 'good' | 'warning' | 'bad'
}) {
    const toneClass = tone === 'bad' ? 'text-danger' : tone === 'warning' ? 'text-status-waiting-fg' : 'text-fg'
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <p className="truncate text-small text-fg-muted">{label}</p>
                {info && <InfoHint text={info} label={`About ${label}`} />}
            </div>
            {value === null ? (
                <>
                    <p className="text-ui font-medium text-fg-subtle">No data yet</p>
                    <p className="text-caption text-fg-subtle">{emptyCaption}</p>
                </>
            ) : (
                <>
                    <p className={cn('text-h3 tabular-nums', toneClass)}>{value}</p>
                    {caption && <p className="text-caption text-fg-subtle">{caption}</p>}
                </>
            )}
        </div>
    )
}
