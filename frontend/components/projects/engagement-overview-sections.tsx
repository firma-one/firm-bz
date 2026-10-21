'use client'

import React, { useState } from 'react'
import {
    AlertTriangle,
    CalendarClock,
    ClipboardCheck,
    FolderOpen,
    Gauge,
    Heart,
    MessagesSquare,
    Package,
    ListChecks,
    Users,
} from 'lucide-react'
import { DATA, Donut, ScoreDeductions, tint } from './insight-rings'
import { StatusPill } from '@/components/ui/status-pill'
import { Hint } from '@/components/ui/tooltip'
import { STAGE_PILL_CLASSES, STATUS, type StatusStage } from '@/lib/ui/status'
import {
    ChartBlock,
    InfoHint,
    Legend,
    Meter,
    PaceBars,
    SegmentedBar,
    Stat,
    type ChartSegment,
} from './overview-charts'
import { Tag } from '@/components/ui/tag'
import { cn } from '@/lib/utils'
import type { DeliverableStage } from '@/lib/insights/engagement-insights'

/*
 * The sections of the engagement Overview, drawn from plain numbers so the dashboard
 * (engagement-insights-dashboard.tsx) and the tour (demo-engagement-overview.tsx) show the same
 * thing. See .claude/plans/engagement-overview-redesign.md. Every block keeps the anchor id its
 * ring had (`ring-status`, `ring-schedule`, …): the Action Center's "Show in…" buttons and the
 * firm's hidden-ring settings still point at them.
 */

const DAY_MS = 86400000

/** Each stage as the Board shows it: its label from the status registry, its bar hue (DATA). */
export const STAGE_META: Record<DeliverableStage, { label: string; hex: string }> = {
    to_do: { label: STATUS.deliverable.to_do.label, hex: DATA.notStarted },
    in_progress: { label: STATUS.deliverable.in_progress.label, hex: DATA.underway },
    in_review: { label: STATUS.deliverable.in_review.label, hex: DATA.waiting },
    approved: { label: STATUS.deliverable.approved.label, hex: DATA.done },
}

/** A good / needs attention / at risk band in the status palette's done, waiting and problem. */
export const BAND_STAGE = { good: 'done', warning: 'waiting', critical: 'problem' } as const satisfies Record<string, StatusStage>
const BAND_HEX = { good: DATA.done, warning: DATA.waiting, critical: DATA.problem }
const BAND_TEXT = { good: 'text-status-done-fg', warning: 'text-status-waiting-fg', critical: 'text-status-problem-fg' }

/** A band as a pill in its stage's colors: a judgment, not a status, so no status icon. */
export function BandPill({ band, children, className }: { band: keyof typeof BAND_STAGE; children: React.ReactNode; className?: string }) {
    return (
        <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-control px-1.5 text-caption', STAGE_PILL_CLASSES[BAND_STAGE[band]], className)}>
            {children}
        </span>
    )
}
export const STAGE_ORDER: DeliverableStage[] = ['to_do', 'in_progress', 'in_review', 'approved']

/** A deliverable as the Overview needs it. */
export interface OverviewDeliverable {
    id: string
    docId: string | null
    name: string
    stage: DeliverableStage
    dueDate: string | null
    isOverdue: boolean
    createdAt: string | null
    finalizedAt: string | null
}

/**
 * Below two columns (a phone, or a laptop with panels docked) blocks stack; they stop at 28rem
 * rather than stretching across whatever width is left. On a phone that is the full width anyway.
 */
export const ONE_COLUMN_CAP = '[&>*]:max-w-md @2xl:[&>*]:max-w-none'

/**
 * The page's unit is a third of its width. A bar is read by comparing its length with the whole,
 * which is quick within a glance and slow across a page: a page-wide bar makes the eye travel
 * end to end, and one resolved thread drew a 1,100px stripe. So blocks sit in columns — two from
 * 42rem of content width, three from 56rem — and no bar runs wider than its column. Container
 * queries, not the window: a docked Brio panel or search pane narrows the content, not the window.
 */
export const THIRDS = 'grid grid-cols-1 gap-x-10 gap-y-8 @2xl:grid-cols-2 @4xl:grid-cols-3 ' + ONE_COLUMN_CAP

type Show = (ringId: string) => boolean
const showAll: Show = () => true

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** A quiet "nothing here yet" line, for blocks that stay visible before there is data. */
export function Empty({ children }: { children: React.ReactNode }) {
    return <p className="text-small text-fg-subtle">{children}</p>
}

// ─── Deliverables ────────────────────────────────────────────────────────────

const STAGE_FILL_PCT: Record<DeliverableStage, number> = { to_do: 25, in_progress: 50, in_review: 75, approved: 100 }

/**
 * Each deliverable as a row on one time axis (Linear's timeline, Jira's): the bar runs from when
 * it was marked a deliverable to its due date, filled by stage, red when overdue. With a handful
 * of deliverables this is the list itself — name, stage and due date on every row.
 */
export function DeliverablesTimeline({ deliverables, startDate, dueDate, nowMs }: {
    deliverables: OverviewDeliverable[]
    startDate: string | null
    dueDate: string | null
    nowMs: number
}) {
    const [zoom, setZoom] = useState<'30d' | '90d' | 'full'>('full')

    const rows = deliverables.map((d) => {
        const approved = d.stage === 'approved'
        const openEnded = !d.dueDate && !approved
        const end = d.dueDate ?? (approved ? d.finalizedAt : null)
        return {
            ...d,
            openEnded,
            endMs: end ? new Date(end).getTime() : nowMs,
            startMs: d.createdAt ? new Date(d.createdAt).getTime() : nowMs,
        }
    })
    const candidates = [startDate, dueDate, ...rows.flatMap((d) => [d.createdAt, d.dueDate, d.finalizedAt])]
        .filter((v): v is string => !!v).map((v) => new Date(v).getTime())
    candidates.push(nowMs)
    const halfWindow = zoom === '30d' ? 15 : zoom === '90d' ? 45 : null
    const minMs = halfWindow !== null ? nowMs - halfWindow * DAY_MS : Math.min(...candidates)
    const maxMs = halfWindow !== null ? nowMs + halfWindow * DAY_MS : Math.max(...candidates)
    const span = Math.max(1, maxMs - minMs)
    const at = (ms: number) => Math.max(0, Math.min(100, ((ms - minMs) / span) * 100))
    const visible = rows
        .filter((d) => halfWindow === null || (d.endMs >= minMs && d.startMs <= maxMs))
        .sort((a, b) => a.endMs - b.endMs)
    const engDueMs = dueDate ? new Date(dueDate).getTime() : null
    const noDueCount = rows.filter((d) => d.openEnded).length

    return (
        <ChartBlock
            icon={Package}
            title="Deliverables"
            info="Each bar runs from when the folder was marked a deliverable to its due date (or approval). The fill shows its stage: a quarter for To Do, half for In Progress, three quarters for In Review, full when approved. Red means overdue; a dashed bar has no due date. The dashed line is today; the solid line is the engagement's due date."
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
                <div className="flex flex-col">
                    {visible.map((d) => {
                        const left = at(d.startMs)
                        const width = Math.max(1, at(d.endMs) - left)
                        // Overdue is the only red: the part of the bar past its due date.
                        const color = d.isOverdue ? DATA.problem : STAGE_META[d.stage].hex
                        const dateText = d.stage === 'approved'
                            ? (d.finalizedAt ? `Approved ${shortDate(new Date(d.finalizedAt).getTime())}` : 'Approved')
                            : d.dueDate ? `Due ${shortDate(new Date(d.dueDate).getTime())}` : 'No due date'
                        return (
                            // The bar takes a third of the row, so it reads at a glance and the name keeps its room.
                            // On a phone there is no room for it: each row is name, stage and date.
                            <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-4 border-b border-line py-1.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,33%)_7.5rem]">
                                <div className="flex min-w-0 items-center gap-2">
                                    {d.docId && <span className="shrink-0 rounded-[4px] bg-surface-muted px-1 font-mono text-caption text-fg-muted">{d.docId}</span>}
                                    <Hint label={d.name}>
                                        <span className="truncate text-small text-fg">{d.name}</span>
                                    </Hint>
                                </div>
                                <div className="relative hidden h-6 sm:block">
                                    {/* The track: the whole span of the axis, so a short bar reads as a
                                        part of the engagement rather than a fragment. */}
                                    <div className="absolute inset-x-0 inset-y-1.5 rounded-[4px] bg-surface-muted" />
                                    {engDueMs !== null && engDueMs >= minMs && engDueMs <= maxMs && (
                                        <Hint label={`Engagement due ${shortDate(engDueMs)}`}>
                                            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${at(engDueMs)}%` }} />
                                        </Hint>
                                    )}
                                    <div className="absolute inset-y-0 border-l border-dashed border-fg-subtle" style={{ left: `${at(nowMs)}%` }} />
                                    <Hint label={`${d.docId ? `${d.docId} · ` : ''}${STAGE_META[d.stage].label} · ${dateText}`}>
                                        <div
                                            className={cn('absolute inset-y-1.5 overflow-hidden rounded-[4px]', d.openEnded ? 'border border-dashed border-line-strong' : '')}
                                            style={{ left: `${left}%`, width: `${width}%`, backgroundColor: tint(color, 28) }}
                                        >
                                            <div className="h-full" style={{ width: `${STAGE_FILL_PCT[d.stage]}%`, backgroundColor: color }} />
                                        </div>
                                    </Hint>
                                </div>
                                <div className="flex min-w-0 flex-col items-end">
                                    {/* The stage as on the Board; overdue is the red date below, not a pill. */}
                                    <StatusPill kind="deliverable" status={d.stage} />
                                    <span className={cn('text-caption', d.isOverdue ? 'text-danger' : 'text-fg-subtle')}>{dateText}</span>
                                </div>
                            </div>
                        )
                    })}
                    {/* The axis under the bars: where the span starts, today, and where it ends. */}
                    <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,33%)_7.5rem] gap-4 pt-1.5 sm:grid">
                        <div />
                        <div className="relative h-4 text-caption text-fg-subtle">
                            <span className="absolute left-0">{shortDate(minMs)}</span>
                            <span className={cn('absolute right-0', engDueMs === maxMs && 'text-fg-muted')}>
                                {engDueMs === maxMs ? `Due ${shortDate(maxMs)}` : shortDate(maxMs)}
                            </span>
                            {at(nowMs) > 12 && at(nowMs) < 82 && (
                                <span className="absolute -translate-x-1/2 font-medium text-fg-muted" style={{ left: `${at(nowMs)}%` }}>Today</span>
                            )}
                        </div>
                        <div />
                    </div>
                </div>
            )}
            {noDueCount > 0 && (
                <p className="text-caption text-fg-subtle">
                    {noDueCount} deliverable{noDueCount === 1 ? ' has' : 's have'} no due date, so {noDueCount === 1 ? 'its bar runs' : 'their bars run'} to today.
                </p>
            )}
        </ChartBlock>
    )
}

// ─── The report's inputs ─────────────────────────────────────────────────────

/** What the report draws from. The dashboard maps the insights API onto it; the tour, its sample data. */
export interface ReportInputs {
    deliverables: OverviewDeliverable[]
    /** Kickoff, or when the engagement was created if there is no kickoff date. */
    startDate: string | null
    startIsKickoff: boolean
    dueDate: string | null
    nowMs: number
    deliveredPct: number
    timePct: number
    health: HealthScoreInput | null
    planning: { deliverableTotal: number; deliverableWithDueDate: number; docTotal: number; docWithDueDate: number; docWithAssignee: number } | null
    comments: { resolved: number; flaggedOpen: number; unanswered: number }
    firstTimeRight: { firstTime: number; reworked: number }
    inFlightWithRework: number
    /** Average rework rounds per deliverable; null until a deliverable has been to review. */
    revisionAvg: number | null
    reviewedCount: number
    approvalCycleDays: number | null
    approvedCount: number
    /** False for a block the firm has hidden (its `hiddenRings` id). */
    show?: Show
}

/**
 * One of the small cards beside the summary. `id` is the block's anchor. Beside the summary the
 * cards share out its height (each grows by an equal part), so the column has no empty tail.
 */
export function Card({ id, children }: { id?: string; children: React.ReactNode }) {
    return <div id={id} className="flex min-w-0 scroll-mt-24 flex-col rounded-card border border-line bg-surface p-4 @4xl:grow">{children}</div>
}

/** The cards side by side when there is no summary to sit beside: thirds, two-up when narrower. */
export const CARDS_ROW = 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 ' + ONE_COLUMN_CAP

// ─── Report top: the summary, and the cards to read first ────────────────────

/**
 * The top of the report: the three cards to read first — Overall Health, Timeline and Status — in
 * the left third, where the eye lands, and the summary in the right two thirds. Prose that ran the
 * full width made lines too long to read; two thirds keeps them to a comfortable length. The cards
 * column runs the summary's full height, the cards sharing it out. With no summary (or while it is
 * being edited) the cards sit in a row of thirds.
 * Below 56rem of content width the cards go two-up first and the summary takes the full width.
 */
export function OverviewTop({ summary, aboveSummary, report: r }: {
    summary: React.ReactNode | null
    /** Anything that sits above the summary in its column (the inline draft review, without a right pane). */
    aboveSummary?: React.ReactNode
    report: ReportInputs
}) {
    const show = r.show ?? showAll
    const cards = [
        r.health && show('engagement.health_score') ? <HealthScoreCard key="health" health={r.health} /> : null,
        <Card key="timeline" id="ring-schedule"><TimelineBlock r={r} /></Card>,
        show('engagement.delivery_status') ? <Card key="status" id="ring-status"><StatusBlock r={r} /></Card> : null,
    ].filter(Boolean)

    if (!summary) {
        return (
            <div className="@container flex flex-col gap-4">
                {aboveSummary}
                <div className={CARDS_ROW}>{cards}</div>
            </div>
        )
    }
    return (
        <div className="@container">
            <div className="grid grid-cols-1 gap-x-10 gap-y-4 @4xl:grid-cols-3">
                <div className={cn('grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:flex @4xl:flex-col', ONE_COLUMN_CAP)}>{cards}</div>
                <div className="flex min-w-0 flex-col gap-4 @4xl:col-span-2">
                    {aboveSummary}
                    {summary}
                </div>
            </div>
        </div>
    )
}

/**
 * Where the engagement stands against its due date, like a Linear project's target date. It
 * answers three questions at a glance: how much time is left, is anything late, and what is due
 * next. (It used to be a strip with a dot per deliverable due date: unlabeled dots could not be
 * read without hovering, and the Deliverables timeline below already places every deliverable.)
 */
function TimelineBlock({ r }: { r: ReportInputs }) {
    const show = r.show ?? showAll
    const startMs = r.startDate ? new Date(r.startDate).getTime() : null
    const endMs = r.dueDate ? new Date(r.dueDate).getTime() : null
    const hasRange = startMs !== null && endMs !== null && endMs > startMs

    const info = 'Time left until the engagement’s due date, and the share of the time from kickoff (or when it was created) already used. Overdue lists deliverables past their due date and not approved; Next due is the nearest upcoming one.'
    if (!hasRange) {
        return (
            <ChartBlock fill icon={CalendarClock} title="Timeline" info={info}>
                <Empty>No due date yet. Set the engagement&apos;s due date to see how much time is left.</Empty>
            </ChartBlock>
        )
    }

    const totalDays = Math.max(1, Math.round((endMs! - startMs!) / DAY_MS))
    const daysLeft = Math.round((endMs! - r.nowMs) / DAY_MS)
    const usedPct = Math.round(Math.max(0, Math.min(100, ((r.nowMs - startMs!) / (endMs! - startMs!)) * 100)))
    const late = daysLeft < 0
    const barHex = late ? DATA.problem : usedPct >= 85 ? DATA.waiting : DATA.underway
    const headline = late ? `${-daysLeft} day${daysLeft === -1 ? '' : 's'} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`

    const byDue = (a: OverviewDeliverable, b: OverviewDeliverable) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    const overdue = r.deliverables.filter((d) => d.isOverdue && d.dueDate).sort(byDue)
    const next = r.deliverables.filter((d) => d.stage !== 'approved' && !d.isOverdue && d.dueDate).sort(byDue)[0]
    const label = (d: OverviewDeliverable) => d.docId ?? d.name
    const inDays = (ms: number) => {
        const n = Math.round((ms - r.nowMs) / DAY_MS)
        return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
    }

    return (
        <ChartBlock fill icon={CalendarClock} title="Timeline" info={info} aside={`${usedPct}% used`}>
            <div className="flex items-baseline gap-2">
                <span className={cn('text-h3 tabular-nums', late ? 'text-danger' : 'text-fg')}>{headline}</span>
                {!late && <span className="text-small text-fg-subtle">of {totalDays}</span>}
            </div>
            <div className="flex flex-col gap-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(usedPct, 2)}%`, backgroundColor: barHex }} />
                </div>
                <div className="flex items-center justify-between gap-3 text-caption text-fg-subtle">
                    <span>{r.startIsKickoff ? 'Kickoff' : 'Started'} {shortDate(startMs!)}</span>
                    <span className={cn(late && 'font-medium text-danger')}>Due {shortDate(endMs!)}</span>
                </div>
            </div>
            {show('engagement.delivery_schedule') && r.deliverables.length > 0 && (
                <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line pt-2.5 text-small">
                    <dt className="text-fg-muted">Overdue</dt>
                    <dd className={cn('min-w-0 truncate', overdue.length > 0 ? 'font-medium text-danger' : 'text-fg-subtle')}>
                        {overdue.length === 0
                            ? 'None'
                            : `${label(overdue[0])} · since ${shortDate(new Date(overdue[0].dueDate!).getTime())}${overdue.length > 1 ? ` · +${overdue.length - 1} more` : ''}`}
                    </dd>
                    <dt className="text-fg-muted">Next due</dt>
                    <dd className={cn('min-w-0 truncate', next ? 'text-fg' : 'text-fg-subtle')} title={next ? next.name : undefined}>
                        {next
                            ? `${label(next)} · ${shortDate(new Date(next.dueDate!).getTime())}, ${inDays(new Date(next.dueDate!).getTime())}`
                            : 'Nothing scheduled'}
                    </dd>
                </dl>
            )}
        </ChartBlock>
    )
}

/** Where the deliverables stand: a segmented bar in workflow order (the Delivery Status ring). */
function StatusBlock({ r }: { r: ReportInputs }) {
    const total = r.deliverables.length
    const approved = r.deliverables.filter((d) => d.stage === 'approved').length
    const items: ChartSegment[] = STAGE_ORDER.map((s) => ({
        label: STAGE_META[s].label,
        hex: STAGE_META[s].hex,
        value: r.deliverables.filter((d) => d.stage === s).length,
    }))
    return (
        <ChartBlock
            fill
            icon={Package}
            title="Status"
            info="Where the deliverables stand, in workflow order: To Do → In Progress → In Review → Approved."
            aside={total > 0 ? `${approved} of ${total} approved` : undefined}
        >
            <SegmentedBar segments={total > 0 ? items : []} />
            {total > 0
                ? <Legend items={items} />
                : <Empty>No deliverables yet. Mark a folder as a deliverable on the Board to track it here.</Empty>}
        </ChartBlock>
    )
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthScoreInput {
    score: number
    level: 'good' | 'warning' | 'critical'
    penalties: { label: string; points: number }[]
}

export const HEALTH_SCORE_INFO =
    'A score out of 100 that starts at 100 and loses points for what puts the engagement at risk: '
    + 'an overdue engagement, overdue deliverables and documents, planning gaps, falling behind pace, '
    + 'unanswered client comments and sensitive files. 80 and up is healthy, 50–79 needs attention, '
    + 'below 50 is critical.'

/**
 * The Overall Health Score — the one ring on the page — with what lowered it. A card beside the
 * summary; the ring and the deductions are centered in whatever height the card gets. (The PDF
 * export widens `#ring-health > :last-child`; that is now this body, which has no width cap.)
 */
function HealthScoreCard({ health }: { health: HealthScoreInput }) {
    const hex = BAND_HEX[health.level]
    const textClass = BAND_TEXT[health.level]
    const levelLabel = health.level === 'good' ? 'Healthy' : health.level === 'warning' ? 'Needs attention' : 'Critical'
    const penalties = [...health.penalties].sort((a, b) => b.points - a.points)
    const deducted = penalties.reduce((s, p) => s + p.points, 0)
    return (
        <div id="ring-health" className="flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-card border border-line bg-surface p-4 @4xl:grow">
            <div className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                <p className="text-small font-medium text-fg">Overall Health Score</p>
                <InfoHint text={HEALTH_SCORE_INFO} label="About Overall Health Score" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="flex items-center gap-4">
                <Donut
                    total={100}
                    size={88}
                    thickness={11}
                    segments={[{ value: health.score, hex }]}
                    centerTop={<span className={`text-[22px] font-bold leading-none tabular-nums ${textClass}`}>{health.score}</span>}
                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">/ 100</span>}
                />
                <div className="min-w-0">
                    <p className={`text-ui font-medium ${textClass}`}>{levelLabel}</p>
                    {deducted > 0 && (
                        <p className="mt-0.5 text-caption text-fg-subtle">100 − <span className="font-medium text-status-problem-fg">{deducted}</span> = <span className={`font-semibold ${textClass}`}>{health.score}</span></p>
                    )}
                </div>
            </div>
            <ScoreDeductions penalties={penalties} emptyText="All clear — no risks" className="w-full" />
            </div>
        </div>
    )
}

/**
 * What feeds the health score, below the deliverables, in thirds: pace, planning hygiene and
 * comment responsiveness, then three numbers. Metrics without data yet stay, saying what they track.
 */
export function OverviewDetails({ report: r }: { report: ReportInputs }) {
    const show = r.show ?? showAll
    const total = r.deliverables.length
    const hasRange = !!r.startDate && !!r.dueDate && new Date(r.dueDate).getTime() > new Date(r.startDate).getTime()

    const ph = r.planning
    const inFlight = !!ph && (ph.deliverableTotal > 0 || ph.docTotal > 0)
    const missing = ph ? (ph.deliverableTotal - ph.deliverableWithDueDate) + (ph.docTotal - ph.docWithDueDate) + (ph.docTotal - ph.docWithAssignee) : 0
    const coverage = (have: number, of: number) => of > 0 ? Math.round((have / of) * 100) : 0
    const coverageHex = (have: number, of: number) => have >= of ? DATA.done : DATA.waiting

    const commentTotal = r.comments.resolved + r.comments.flaggedOpen + r.comments.unanswered
    const commentItems: ChartSegment[] = [
        { label: 'Resolved', hex: DATA.done, value: r.comments.resolved },
        { label: 'Flagged open', hex: DATA.waiting, value: r.comments.flaggedOpen },
        { label: 'Unanswered', hex: DATA.problem, value: r.comments.unanswered },
    ]
    const ftrTotal = r.firstTimeRight.firstTime + r.firstTimeRight.reworked

    return (
        <div className="@container">
            <div className="flex flex-col gap-8">
                <div className={THIRDS}>
                    {show('engagement.pace') && (
                        <ChartBlock
                            id="ring-pace"
                            icon={Gauge}
                            title="Pace"
                            info="Share of deliverables approved against share of the engagement's time used. Delivered below time elapsed means the work is behind the clock."
                        >
                            {hasRange && total > 0 ? (
                                <PaceBars deliveredPct={r.deliveredPct} timePct={r.timePct} hex={{ delivered: DATA.done, time: 'var(--ui-line-strong)' }} />
                            ) : (
                                <Empty>{hasRange ? 'Tracks once there is a deliverable.' : 'Tracks once the engagement has a due date.'}</Empty>
                            )}
                        </ChartBlock>
                    )}
                    {show('engagement.planning_hygiene') && (
                        <ChartBlock
                            id="ring-planning"
                            icon={ClipboardCheck}
                            title="Planning hygiene"
                            info="How much of the in-flight work is set up: due dates on deliverables, and due dates and assignees on the documents inside them. Approved deliverables don't count."
                            aside={inFlight ? (missing > 0 ? `${missing} missing` : 'All set') : undefined}
                        >
                            {inFlight ? (
                                <div className="flex flex-col gap-3">
                                    <Meter label="Deliverable due dates" valueText={`${ph!.deliverableWithDueDate} of ${ph!.deliverableTotal}`} pct={coverage(ph!.deliverableWithDueDate, ph!.deliverableTotal)} hex={coverageHex(ph!.deliverableWithDueDate, ph!.deliverableTotal)} muted={ph!.deliverableTotal === 0} />
                                    <Meter label="Document due dates" valueText={`${ph!.docWithDueDate} of ${ph!.docTotal}`} pct={coverage(ph!.docWithDueDate, ph!.docTotal)} hex={coverageHex(ph!.docWithDueDate, ph!.docTotal)} muted={ph!.docTotal === 0} />
                                    <Meter label="Document assignees" valueText={`${ph!.docWithAssignee} of ${ph!.docTotal}`} pct={coverage(ph!.docWithAssignee, ph!.docTotal)} hex={coverageHex(ph!.docWithAssignee, ph!.docTotal)} muted={ph!.docTotal === 0} />
                                </div>
                            ) : (
                                <Empty>No in-flight deliverables, so nothing to plan right now.</Empty>
                            )}
                        </ChartBlock>
                    )}
                    {show('engagement.comment_responsiveness') && (
                        <ChartBlock
                            id="ring-comments"
                            icon={MessagesSquare}
                            title="Comment responsiveness"
                            info="Document comment threads the firm has resolved. A thread the firm replied to that is still flagged Urgent or Looking counts as open."
                            aside={commentTotal > 0 ? `${Math.round((r.comments.resolved / commentTotal) * 100)}% resolved` : undefined}
                        >
                            <SegmentedBar segments={commentItems} />
                            {commentTotal > 0
                                ? <Legend items={commentItems} />
                                : <Empty>No comment threads yet. Tracks how quickly client comments get a reply.</Empty>}
                        </ChartBlock>
                    )}
                </div>

                <div className={cn(THIRDS, 'border-t border-line pt-6')}>
                    {show('engagement.first_time_right') && (
                        <div id="ring-ftr" className="scroll-mt-24">
                            <Stat
                                label="First-time-right"
                                info="Of the approved deliverables, the share approved without ever being sent back for rework."
                                value={ftrTotal > 0 ? `${Math.round((r.firstTimeRight.firstTime / ftrTotal) * 100)}%` : null}
                                caption={`${r.firstTimeRight.firstTime} of ${ftrTotal} approved first pass`}
                                emptyCaption="Tracks once a deliverable is approved."
                                tone={ftrTotal > 0 && r.firstTimeRight.reworked > r.firstTimeRight.firstTime ? 'warning' : undefined}
                            />
                            {r.inFlightWithRework > 0 && (
                                <p className="mt-1.5 flex items-start gap-1 text-caption text-status-waiting-fg">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    {r.inFlightWithRework} in-flight deliverable{r.inFlightWithRework === 1 ? ' has' : 's have'} already been reworked.
                                </p>
                            )}
                        </div>
                    )}
                    <Stat
                        label="Avg revision rounds"
                        info="Average number of times a deliverable was sent back a stage (for example In Review → In Progress). Lower is better."
                        value={r.revisionAvg === null ? null : r.revisionAvg.toFixed(1)}
                        caption={`per deliverable · ${r.reviewedCount} reviewed`}
                        emptyCaption="Tracks rework once a deliverable goes to review."
                        tone={r.revisionAvg !== null && r.revisionAvg >= 2 ? 'warning' : undefined}
                    />
                    <Stat
                        label="Avg time to approval"
                        info="Average days from marking a folder as a deliverable to its approval. Only approved deliverables count. 7 days or less is good; over 14 is slow."
                        value={r.approvalCycleDays === null ? null : `${r.approvalCycleDays}d`}
                        caption={`To Do → Approved · ${r.approvedCount} deliverable${r.approvedCount === 1 ? '' : 's'}`}
                        emptyCaption="Tracks once the first deliverable is approved."
                        tone={r.approvalCycleDays === null ? undefined : r.approvalCycleDays > 14 ? 'bad' : r.approvalCycleDays > 7 ? 'warning' : 'good'}
                    />
                </div>
            </div>
        </div>
    )
}

// ─── Team ────────────────────────────────────────────────────────────────────

/** Who is on the engagement, as three segmented bars (they were three rings). */
export function TeamSection({ joined, invited, roles, internal, external }: {
    joined: number
    invited: number
    roles: ChartSegment[]
    internal: number
    external: number
}) {
    const teamTotal = joined + invited
    const roleTotal = roles.reduce((s, r) => s + r.value, 0)
    const blocks: { title: string; info: string; aside?: string; items: ChartSegment[]; empty: string }[] = [
        {
            title: 'On team vs invited',
            info: 'People who have joined the engagement against invitations not yet accepted.',
            aside: teamTotal > 0 ? `${Math.round((joined / teamTotal) * 100)}% joined` : undefined,
            // An invitation waiting to be accepted is the status language's Waiting; joined is Done.
            items: [{ label: 'On team', hex: DATA.done, value: joined }, { label: 'Invited', hex: DATA.waiting, value: invited }],
            empty: 'No one on the team yet.',
        },
        {
            title: 'By role',
            info: 'Joined members by role: Admin (engagement lead) and Member on the firm side, Collaborator and Reviewer on the client side.',
            aside: roleTotal > 0 ? `${roleTotal} member${roleTotal === 1 ? '' : 's'}` : undefined,
            items: roles,
            empty: 'No members yet.',
        },
        {
            title: 'Internal vs external',
            info: 'Firm-side members (Admins and Members) against client-side members (Collaborators and Reviewers).',
            aside: roleTotal > 0 ? `${Math.round((internal / roleTotal) * 100)}% internal` : undefined,
            // Not a status: the categorical grays.
            items: [{ label: 'Internal', hex: DATA.category1, value: internal }, { label: 'External', hex: DATA.category3, value: external }],
            empty: 'No members yet.',
        },
    ]
    return (
        <div className="@container">
        <div className={cn('grid grid-cols-1 gap-x-10 gap-y-6 @2xl:grid-cols-3', ONE_COLUMN_CAP)}>
            {blocks.map((b) => {
                const has = b.items.some((i) => i.value > 0)
                return (
                    <ChartBlock key={b.title} icon={Users} title={b.title} info={b.info} aside={b.aside}>
                        <SegmentedBar segments={b.items} />
                        {has ? <Legend items={b.items} /> : <Empty>{b.empty}</Empty>}
                    </ChartBlock>
                )
            })}
        </div>
        </div>
    )
}

// ─── File organization ───────────────────────────────────────────────────────

export interface FileCheck {
    id: string
    label: string
    info: string
    count: number
    of: number
}

export const FOLDER_SCORE_INFO =
    'File organization quality, out of 100. Loses points for badly named files, duplicates, stale and '
    + 'large files, deep or crowded folders, empty folders, and files left outside any folder. Uses the '
    + 'same rules as Review folder organization on the Files tab.'

/**
 * The folder score as a number with a thin bar (the page keeps one ring), what lowered it, and
 * each check as a meter of how many files or folders it flags.
 */
export function FileOrganizationSection({ score, penalties, checks, show = showAll }: {
    score: number
    penalties: { label: string; points: number }[]
    checks: FileCheck[]
    show?: Show
}) {
    const hex = score >= 80 ? DATA.done : score >= 50 ? DATA.waiting : DATA.problem
    const band = score >= 80 ? { text: 'Good', band: 'good' as const } : score >= 60 ? { text: 'Fair', band: 'warning' as const } : { text: 'Needs attention', band: 'critical' as const }
    const sorted = [...penalties].sort((a, b) => b.points - a.points)
    const deducted = sorted.reduce((s, p) => s + p.points, 0)
    const visibleChecks = checks.filter((c) => show(c.id))
    const showScore = show('folder.overall_score')

    return (
        <div className="@container">
        <div className={cn('grid grid-cols-1 gap-x-10 gap-y-8 @2xl:grid-cols-3', ONE_COLUMN_CAP)}>
            {showScore && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-fg-subtle" />
                        <p className="text-small font-medium text-fg">Overall score</p>
                        <InfoHint text={FOLDER_SCORE_INFO} label="About the file organization score" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-[28px] font-bold leading-none tabular-nums text-fg">{score}</span>
                        <span className="text-small text-fg-subtle">/ 100</span>
                        <BandPill band={band.band} className="ml-1 self-center">{band.text}</BandPill>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: hex }} />
                    </div>
                    {deducted > 0 && (
                        <p className="text-caption text-fg-subtle">100 − <span className="font-medium text-status-problem-fg">{deducted}</span> = <span className="font-semibold text-fg">{score}</span></p>
                    )}
                    <ScoreDeductions penalties={sorted} emptyText="All clear — no issues found" className="w-full" />
                </div>
            )}
            {visibleChecks.length > 0 && (
                <ChartBlock icon={ListChecks} title="Checks" info="What each check flags, out of the files or folders it looks at." className="@2xl:col-span-2">
                    <div className="grid grid-cols-1 gap-x-10 gap-y-3 @xl:grid-cols-2">
                        {visibleChecks.map((c) => (
                            <Meter
                                key={c.id}
                                label={c.label}
                                valueText={c.count > 0 ? `${c.count} of ${c.of}` : 'None'}
                                pct={c.of > 0 ? (c.count / c.of) * 100 : 0}
                                hex={DATA.waiting}
                                muted={c.count === 0}
                                info={c.info}
                            />
                        ))}
                    </div>
                </ChartBlock>
            )}
        </div>
        </div>
    )
}
