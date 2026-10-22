'use client'

import React from 'react'
import Link from 'next/link'
import { Briefcase, CalendarClock, CalendarDays, Coins, Layers, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/ui/property-cells'
import { ChartBlock, Legend, SegmentedBar, Stat, type ChartSegment } from '@/components/projects/overview-charts'
import { Card, CARDS_ROW, Empty, ONE_COLUMN_CAP, STAGE_META, STAGE_ORDER, StagePill, THIRDS } from '@/components/projects/engagement-overview-sections'
import { DATA, tint } from '@/components/projects/insight-rings'
import { Hint } from '@/components/ui/tooltip'
import { PipelineBar, formatValue } from '@/components/dashboard/pipeline-bar'
import { countByPace, PACE_META, PACE_ORDER, sortByPace, type FirmEngagementRow, type PaceKey } from '@/lib/insights/firm-engagement-pace'
import type { ClientPipelineItem, ContractTypeCount } from '@/app/api/firms/[firmId]/insights/route'

/*
 * The Firm Overview, after the engagement Overview's redesign (.claude/plans/firm-overview-redesign.md):
 * three cards in the left third beside the brief, the active engagements as rows, the pipeline in
 * thirds. Presentational: the app feeds it from the firm insights route, the tour from its sample data.
 */

/** What the Firm Overview draws from. */
export interface FirmOverviewData {
    nowMs: number
    clients: { active: number; prospects: number; onHold: number; past: number }
    pendingInvitations: number
    week: { newClients: number; newEngagements: number; invitationsSent: number; engagementsClosed: number }
    engagementRows: FirmEngagementRow[]
    pipeline: {
        items: ClientPipelineItem[]
        total: number
        symbol: string
        /** Engagements due in the next 30 days, and what they're worth. */
        dueSoonCount: number
        dueSoonValue: number
        revenueAtRisk: number
    }
    contractTypes: ContractTypeCount[]
}

/**
 * The Engagements card's bar, in the status palette (the engagement Overview's pace rule): Overdue red,
 * behind amber (slightly behind a lighter amber), on pace green, can't-judge-yet gray.
 */
const PACE_HEX: Record<PaceKey, string> = {
    overdue: DATA.problem,
    behind: DATA.waiting,
    slightly_behind: tint(DATA.waiting, 55),
    on_pace: DATA.done,
    no_deliverables: DATA.notStarted,
    no_due_date: tint(DATA.notStarted, 55),
}

/** Contract types are categories, not statuses: the warm gray ramp (Wave 3, "Data colors"). */
const TYPE_COLORS = [DATA.category1, DATA.category2, DATA.category3, DATA.category4]

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A count and what it counts, for the cards. */
function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex min-w-0 flex-col">
            <span className={cn('text-h3 tabular-nums', value > 0 ? 'text-fg' : 'text-fg-subtle')}>{value}</span>
            <span className="truncate text-caption text-fg-muted">{label}</span>
        </div>
    )
}

// ─── The cards ───────────────────────────────────────────────────────────────

const ENGAGEMENTS_INFO = 'How the active engagements are tracking. Overdue: past the due date. Otherwise deliverables approved are weighed against the time used, as on each engagement’s Pace chart: on pace, slightly behind, or behind. Engagements without a due date or deliverables can’t be judged yet.'

function EngagementsCard({ data }: { data: FirmOverviewData }) {
    const rows = data.engagementRows
    const counts = countByPace(rows, data.nowMs)
    const attention = counts.overdue + counts.behind + counts.slightly_behind
    const segments: ChartSegment[] = PACE_ORDER.map((k) => ({ label: PACE_META[k].label, hex: PACE_HEX[k], value: counts[k] }))
    return (
        <Card id="firm-engagements">
            <ChartBlock fill icon={Briefcase} title="Engagements" info={ENGAGEMENTS_INFO} aside={rows.length > 0 ? `${rows.length} active` : undefined}>
                {rows.length === 0 ? (
                    <Empty>No active engagements yet. Start one from a client to track it here.</Empty>
                ) : (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className={cn('text-h3 tabular-nums', counts.overdue > 0 ? 'text-danger' : attention > 0 ? 'text-status-waiting-fg' : 'text-fg')}>
                                {attention > 0 ? plural(attention, 'needs attention', 'need attention') : 'None behind'}
                            </span>
                        </div>
                        <SegmentedBar segments={segments} />
                        <Legend items={segments.filter((s) => s.value > 0)} />
                    </>
                )}
            </ChartBlock>
        </Card>
    )
}

function ClientsCard({ data }: { data: FirmOverviewData }) {
    const c = data.clients
    return (
        <Card id="firm-clients">
            <ChartBlock fill icon={Users} title="Clients" aside={c.active > 0 ? `${c.active} active` : undefined}>
                {/* One row where they fit, wrapping where the card is narrow: kept short so the
                    cards column stays close to the brief's height. */}
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <MiniStat label="Active" value={c.active} />
                    <MiniStat label="Prospects" value={c.prospects} />
                    <MiniStat label="Invitations pending" value={data.pendingInvitations} />
                    {c.onHold > 0 && <MiniStat label="On hold" value={c.onHold} />}
                    {c.past > 0 && <MiniStat label="Past" value={c.past} />}
                </div>
            </ChartBlock>
        </Card>
    )
}

function WeekCard({ data }: { data: FirmOverviewData }) {
    const w = data.week
    return (
        <Card id="firm-week">
            <ChartBlock fill icon={CalendarDays} title="This week" info="The last seven days.">
                <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="New clients" value={w.newClients} />
                    <MiniStat label="New engagements" value={w.newEngagements} />
                    <MiniStat label="Invitations sent" value={w.invitationsSent} />
                    <MiniStat label="Engagements closed" value={w.engagementsClosed} />
                </div>
            </ChartBlock>
        </Card>
    )
}

/**
 * The top of the Overview: the cards to read first in the left third, the brief in the right two
 * thirds, as on the engagement Overview. The two columns end level: when the brief is taller the
 * cards share out its height; when the cards are, the brief card stretches (its footer stays at
 * the bottom). Without a brief the cards sit in a row of thirds.
 */
export function FirmOverviewTop({ data, brief }: { data: FirmOverviewData; brief: React.ReactNode | null }) {
    const cards = [
        <EngagementsCard key="engagements" data={data} />,
        <ClientsCard key="clients" data={data} />,
        <WeekCard key="week" data={data} />,
    ]
    if (!brief) {
        return <div className="@container"><div className={CARDS_ROW}>{cards}</div></div>
    }
    return (
        <div className="@container">
            <div className="grid grid-cols-1 gap-x-10 gap-y-4 @4xl:grid-cols-3">
                <div className={cn('grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:flex @4xl:flex-col', ONE_COLUMN_CAP)}>{cards}</div>
                <div className="flex min-w-0 flex-col @4xl:col-span-2 [&>*]:flex-1">{brief}</div>
            </div>
        </div>
    )
}

// ─── The engagements ─────────────────────────────────────────────────────────

const LIST_INFO = 'Every active engagement, worst first. Deliverables: how many are approved, and the bar shows their stages. Time: the share of the time from kickoff to the due date already used. Click a row to open that engagement’s Overview.'

/**
 * Every active engagement as a row, like a Linear project list: who leads it, where its
 * deliverables stand, how much time is gone, and whether it's on pace. Worst first.
 */
export function FirmEngagementsList({ rows, nowMs, hrefFor }: {
    rows: FirmEngagementRow[]
    nowMs: number
    /** Where a row goes: that engagement's Overview. Without it rows don't link (the tour). */
    hrefFor?: (row: FirmEngagementRow) => string
}) {
    const sorted = sortByPace(rows, nowMs)
    const COLS = 'grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,22%)_minmax(0,22%)_8.5rem]'
    return (
        <ChartBlock icon={Briefcase} title="Active engagements" info={LIST_INFO} aside={rows.length > 0 ? plural(rows.length, 'engagement') : undefined}>
            {rows.length === 0 ? (
                <Empty>No active engagements yet.</Empty>
            ) : (
                <div className="flex flex-col">
                    <div className={cn(COLS, 'border-b border-line px-2 pb-1.5 text-caption text-fg-subtle')}>
                        <span>Engagement</span>
                        <span className="hidden sm:block">Deliverables</span>
                        <span className="hidden sm:block">Time</span>
                        <span className="text-right">Status</span>
                    </div>
                    {sorted.map((r) => {
                        const { pace } = r
                        const d = r.deliverables
                        const stages: ChartSegment[] = STAGE_ORDER.map((s) => ({
                            label: STAGE_META[s].label,
                            hex: STAGE_META[s].hex,
                            value: s === 'to_do' ? d.toDo : s === 'in_progress' ? d.inProgress : s === 'in_review' ? d.inReview : d.approved,
                        }))
                        const late = pace.daysLeft != null && pace.daysLeft < 0
                        // As on the engagement's Timeline: Underway, Waiting from 85% used, red once past due.
                        const timeHex = late ? DATA.problem : (pace.timePct ?? 0) >= 85 ? DATA.waiting : DATA.underway
                        const timeText = pace.daysLeft == null
                            ? 'No due date'
                            : late ? `${plural(-pace.daysLeft, 'day')} overdue`
                            : pace.daysLeft === 0 ? 'Due today' : `${plural(pace.daysLeft, 'day')} left`
                        const content = (
                            <>
                                <div className="flex min-w-0 items-center gap-2.5">
                                    {r.lead
                                        ? <PersonAvatar person={r.lead} size={22} />
                                        : <Hint label="No lead"><span className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-line-strong" /></Hint>}
                                    <div className="min-w-0">
                                        <Hint label={r.name}><p className="truncate text-small font-medium text-fg">{r.name}</p></Hint>
                                        <p className="truncate text-caption text-fg-subtle">
                                            {r.clientName} · {r.lead ? r.lead.name : 'No lead'}
                                        </p>
                                    </div>
                                </div>
                                <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                                    <SegmentedBar segments={d.total > 0 ? stages : []} />
                                    <span className={cn('truncate text-caption', d.overdue > 0 ? 'text-danger' : 'text-fg-subtle')}>
                                        {d.total === 0 ? 'No deliverables yet' : `${d.approved} of ${d.total} approved${d.overdue > 0 ? ` · ${d.overdue} overdue` : ''}`}
                                    </span>
                                </div>
                                <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                                        {pace.timePct != null && <div className="h-full rounded-full" style={{ width: `${Math.max(pace.timePct, 2)}%`, backgroundColor: timeHex }} />}
                                    </div>
                                    <span className={cn('truncate text-caption', late ? 'text-danger' : 'text-fg-subtle')}>
                                        {timeText}{pace.timePct != null && !late ? ` · ${pace.timePct}% used` : ''}
                                    </span>
                                </div>
                                <div className="flex min-w-0 flex-col items-end">
                                    <StagePill stage={PACE_META[pace.key].stage}>{PACE_META[pace.key].label}</StagePill>
                                    <span className={cn('text-caption', late ? 'text-danger' : 'text-fg-subtle')}>
                                        {r.dueDate ? `Due ${shortDate(new Date(r.dueDate).getTime())}` : '—'}
                                    </span>
                                </div>
                            </>
                        )
                        // Padded inside the list, not pulled out with negative margins: inside a scroll
                        // area set to scroll vertically, 8px past the edge is a horizontal scrollbar.
                        const rowClass = cn(COLS, 'rounded-control border-b border-line px-2 py-2 last:border-b-0')
                        return hrefFor ? (
                            <Link key={r.engagementId} href={hrefFor(r)} className={cn(rowClass, 'transition-colors hover:bg-surface-hover')}>{content}</Link>
                        ) : (
                            <div key={r.engagementId} className={rowClass}>{content}</div>
                        )
                    })}
                </div>
            )}
        </ChartBlock>
    )
}

// ─── The pipeline ────────────────────────────────────────────────────────────

/** The pipeline in thirds: by client, by type, and what's due soon or at risk. */
export function FirmPipelineSection({ data }: { data: FirmOverviewData }) {
    const p = data.pipeline
    const engagementCount = data.engagementRows.length
    const hasValues = p.total > 0
    const types: ChartSegment[] = data.contractTypes.map((t, i) => ({ label: t.type, hex: TYPE_COLORS[i % TYPE_COLORS.length], value: t.count }))
    return (
        <div className="@container">
            <div className={THIRDS}>
                <ChartBlock
                    icon={Coins}
                    title="Revenue pipeline"
                    info="The fees of the active engagements, by client. Click a client to see its engagements."
                    aside={hasValues ? formatValue(p.total, p.symbol) : engagementCount > 0 ? plural(engagementCount, 'engagement') : undefined}
                >
                    {p.items.length === 0 ? (
                        <Empty>No clients yet.</Empty>
                    ) : (
                        <>
                            <PipelineBar items={p.items} total={p.total} symbol={p.symbol} />
                            {!hasValues && <Empty>No fees yet. Set a fee on an engagement to see the pipeline by value; until then it&apos;s split by engagement count.</Empty>}
                        </>
                    )}
                </ChartBlock>

                <ChartBlock icon={Layers} title="Engagement types" info="The active engagements by contract type." aside={engagementCount > 0 ? plural(engagementCount, 'engagement') : undefined}>
                    {types.length === 0 ? (
                        <Empty>No active engagements yet.</Empty>
                    ) : (
                        <>
                            <SegmentedBar segments={types} />
                            <Legend items={types} />
                        </>
                    )}
                </ChartBlock>

                <ChartBlock icon={CalendarClock} title="Coming up" info="Due in 30 days: active engagements due within the next 30 days, and their fees. Revenue at risk: the past fees of active clients and prospects that have no active engagement now.">
                    <div className="grid grid-cols-2 gap-4">
                        <Stat
                            label="Due in 30 days"
                            value={p.dueSoonCount}
                            caption={p.dueSoonValue > 0 ? formatValue(p.dueSoonValue, p.symbol) : undefined}
                            emptyCaption=""
                            tone={p.dueSoonCount > 0 ? 'warning' : undefined}
                        />
                        {/* "No data yet" only while no engagement has a fee; with fees, nothing at risk is "None". */}
                        <Stat
                            label="Revenue at risk"
                            value={p.revenueAtRisk > 0 ? formatValue(p.revenueAtRisk, p.symbol) : hasValues ? 'None' : null}
                            caption={p.revenueAtRisk > 0 ? 'Past fees, no active engagement' : undefined}
                            emptyCaption="Needs fees on engagements: the past fees of clients with no active engagement."
                            tone={p.revenueAtRisk > 0 ? 'bad' : undefined}
                        />
                    </div>
                </ChartBlock>
            </div>
        </div>
    )
}
