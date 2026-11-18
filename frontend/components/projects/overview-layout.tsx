'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { OPEN_SECTION_EVENT } from './ring-anchor'
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, FileText, Flag, FolderPlus, Heart, Inbox } from 'lucide-react'
import { DATA, Donut } from './insight-rings'
import { InfoHint, SegmentedBar } from './overview-charts'
import { OverviewDetails, STAGE_META, STAGE_ORDER, HEALTH_SCORE_INFO, type ReportInputs, type OverviewDeliverable } from './engagement-overview-sections'
import { BrioSections } from '@/components/ui/brio-sections'
import { paceStatus } from '@/lib/insights/pace'
import { cn } from '@/lib/utils'

/*
 * The engagement Overview's sections, in the order a Lead reads them (.claude/plans/engagement-overview-restructure.md):
 * where it stands (StatusRow), what needs you (NeedsYou), the latest update, the deliverables, and the
 * health details. Drawn from plain inputs, so the dashboard (engagement-insights-dashboard.tsx) and the
 * tour (demo-engagement-overview.tsx) show the same thing.
 *
 * The PDF export captures the report around them: anything marked `data-no-export` is stripped from it,
 * and anything marked `data-export-only` and hidden on screen is shown in it. So a closed section still
 * prints whole, and Needs you, a list of things to do, never reaches the client.
 */

const DAY_MS = 86400000
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const BAND_TEXT = { good: 'text-status-done-fg', warning: 'text-status-waiting-fg', critical: 'text-status-problem-fg' } as const
const BAND_HEX = { good: DATA.done, warning: DATA.waiting, critical: DATA.problem } as const
const BAND_WORD = { good: 'Healthy', warning: 'Needs attention', critical: 'Critical' } as const

type Show = (ringId: string) => boolean
const showAll: Show = () => true

// ─── Section heading ─────────────────────────────────────────────────────────

/** A section's heading, as the Overview's sections share it: icon, title, a count, actions at the right. */
export function OverviewSectionHeading({ id, icon: Icon, title, count, after, actions }: {
    id?: string
    icon: React.ComponentType<{ className?: string }>
    title: string
    count?: number
    after?: React.ReactNode
    actions?: React.ReactNode
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Icon className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                <h2 id={id} className="truncate text-h3 text-fg">{title}</h2>
                {count !== undefined && count > 0 && <span className="text-small tabular-nums text-fg-muted">{count}</span>}
                {after}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1" data-no-export="">{actions}</div>}
        </div>
    )
}

// ─── 1 · Where it stands ─────────────────────────────────────────────────────

/** One cell of the status row: a small label, then whatever it says. `id` is the block's old anchor. */
export function StatusCell({ id, icon: Icon, label, info, children, noExport, tour }: {
    id?: string
    /** The /tour's anchor for a step that points at this cell. */
    tour?: string
    icon: React.ComponentType<{ className?: string }>
    label: React.ReactNode
    info?: string
    children: React.ReactNode
    /** Internal only: left out of the exported report. */
    noExport?: boolean
}) {
    return (
        <div id={id} className="flex min-w-0 scroll-mt-24 flex-col gap-1.5 bg-surface px-4 py-3.5" data-demo-tour={tour} {...(noExport ? { 'data-no-export': '' } : {})}>
            <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate">{label}</span>
                {info && <InfoHint text={info} label={`About ${typeof label === 'string' ? label : 'this'}`} />}
            </div>
            {children}
        </div>
    )
}

/** A cell's headline: the figure, and a quieter word after it. */
function Headline({ children, after, tone }: { children: React.ReactNode; after?: React.ReactNode; tone?: string }) {
    return (
        <p className="flex min-w-0 items-baseline gap-1.5">
            <span className={cn('text-h2 tabular-nums', tone ?? 'text-fg')}>{children}</span>
            {after && <span className="truncate text-small text-fg-muted">{after}</span>}
        </p>
    )
}

/** A cell's small print. It wraps rather than cutting off: a five-cell row leaves each cell narrow. */
function Caption({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
    return <p className={cn('text-caption font-normal text-fg-muted', className)} title={title}>{children}</p>
}

/** "Behind pace (25% delivered vs 50% elapsed)" → "behind pace": the short form for a caption. */
function shortPenalty(label: string): string {
    const bare = label.replace(/\s*\(.*\)\s*$/, '')
    return bare.charAt(0).toLowerCase() + bare.slice(1)
}

/**
 * Where the engagement stands, in one row (it was three cards: Overall Health, Timeline and Status).
 * The score keeps the page's one ring; what lowered it is its caption. `raid` is the RAID cell, which
 * only the dashboard can fill (it reads the log) and which is never exported.
 */
export function StatusRow({ report: r, raid }: { report: ReportInputs; raid?: React.ReactNode }) {
    const show = r.show ?? showAll
    const total = r.deliverables.length
    const approved = r.deliverables.filter((d) => d.stage === 'approved').length
    const startMs = r.startDate ? new Date(r.startDate).getTime() : null
    const endMs = r.dueDate ? new Date(r.dueDate).getTime() : null
    const hasRange = startMs !== null && endMs !== null && endMs > startMs

    const cells: React.ReactNode[] = []

    if (r.health && show('engagement.health_score')) {
        const h = r.health
        const penalties = [...h.penalties].sort((a, b) => b.points - a.points)
        cells.push(
            <StatusCell key="health" id="ring-health" icon={Heart} label="Health" info={HEALTH_SCORE_INFO}>
                <div className="flex items-center gap-2">
                    <Donut total={100} size={24} thickness={4} segments={[{ value: h.score, hex: BAND_HEX[h.level] }]} />
                    <span className="text-h2 tabular-nums text-fg">{h.score}</span>
                    <span className={cn('text-small font-medium', BAND_TEXT[h.level])}>{BAND_WORD[h.level]}</span>
                </div>
                <Caption title={penalties.map((p) => `${p.label} −${p.points}`).join('\n') || undefined}>
                    {penalties.length > 0 ? penalties.map((p) => `${shortPenalty(p.label)} −${p.points}`).join(' · ') : 'Nothing lowering it'}
                </Caption>
            </StatusCell>,
        )
    }

    {
        const info = 'Time left until the engagement’s due date, and the share of the time from kickoff (or when it was created) already used.'
        if (hasRange) {
            const totalDays = Math.max(1, Math.round((endMs! - startMs!) / DAY_MS))
            const daysLeft = Math.round((endMs! - r.nowMs) / DAY_MS)
            const usedPct = Math.round(Math.max(0, Math.min(100, ((r.nowMs - startMs!) / (endMs! - startMs!)) * 100)))
            const late = daysLeft < 0
            const barHex = late ? DATA.problem : usedPct >= 85 ? DATA.waiting : DATA.underway
            cells.push(
                <StatusCell key="timeline" id="ring-schedule" icon={CalendarClock} label="Timeline" info={info}>
                    <Headline tone={late ? 'text-danger' : undefined} after={late ? undefined : `of ${totalDays}`}>
                        {late ? `${-daysLeft} day${daysLeft === -1 ? '' : 's'} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                    </Headline>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${usedPct}% of the time used`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(usedPct, 2)}%`, backgroundColor: barHex }} />
                    </div>
                    <Caption>{r.startIsKickoff ? 'Kickoff' : 'Started'} {shortDate(startMs!)} · due {shortDate(endMs!)}</Caption>
                </StatusCell>,
            )
        } else {
            cells.push(
                <StatusCell key="timeline" id="ring-schedule" icon={CalendarClock} label="Timeline" info={info}>
                    <Headline tone="text-fg-muted">No due date</Headline>
                    <Caption>Set one in Settings to see the time left</Caption>
                </StatusCell>,
            )
        }
    }

    if (show('engagement.delivery_status')) {
        const segments = STAGE_ORDER.map((s) => ({ label: STAGE_META[s].label, hex: STAGE_META[s].hex, value: r.deliverables.filter((d) => d.stage === s).length }))
        const pace = hasRange && total > 0 && show('engagement.pace') ? paceStatus(r.deliveredPct, r.timePct) : null
        cells.push(
            <StatusCell key="status" id="ring-status" icon={FolderPlus} label="Progress" info="Deliverables approved, and where the rest stand: To Do → In Progress → In Review → Approved. Pace compares the share delivered with the share of time used.">
                <Headline tone={total === 0 ? 'text-fg-muted' : undefined}>{total > 0 ? `${approved} of ${total} approved` : 'No deliverables'}</Headline>
                {total > 0 && <SegmentedBar segments={segments} />}
                {pace ? (
                    <Caption className={cn('font-medium', pace.color === 'green' ? 'text-status-done-fg' : 'text-status-waiting-fg')}>
                        {pace.text} · {r.deliveredPct}% delivered, {r.timePct}% of time used
                    </Caption>
                ) : total === 0 ? <Caption>Mark a folder as a deliverable in Files</Caption> : null}
            </StatusCell>,
        )
    }

    if (show('engagement.delivery_schedule')) {
        const byDue = (a: OverviewDeliverable, b: OverviewDeliverable) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
        const overdue = r.deliverables.filter((d) => d.isOverdue && d.dueDate).sort(byDue)
        const next = r.deliverables.filter((d) => d.stage !== 'approved' && !d.isOverdue && d.dueDate).sort(byDue)[0]
        const label = (d: OverviewDeliverable) => (d.docId ? `${d.docId} · ${d.name}` : d.name)
        const inDays = (ms: number) => {
            const n = Math.round((ms - r.nowMs) / DAY_MS)
            return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
        }
        cells.push(
            <StatusCell key="next" icon={Flag} label="Next due">
                {next ? (
                    <Headline after={inDays(new Date(next.dueDate!).getTime())}>{shortDate(new Date(next.dueDate!).getTime())}</Headline>
                ) : (
                    <Headline tone="text-fg-muted">Nothing scheduled</Headline>
                )}
                {/* A deliverable's name can run long: one line, the whole of it on hover. */}
                {next && <Caption title={next.name} className="truncate">{label(next)}</Caption>}
                {overdue.length > 0 ? (
                    <Caption className="font-medium text-danger" title={overdue.map(label).join('\n')}>
                        {overdue.length} overdue · since {shortDate(new Date(overdue[0].dueDate!).getTime())}
                    </Caption>
                ) : total > 0 ? <Caption>Nothing overdue</Caption> : null}
            </StatusCell>,
        )
    }

    if (raid) cells.push(<React.Fragment key="raid">{raid}</React.Fragment>)

    return (
        <section aria-label="Where it stands" className="@container" data-demo-tour="overview-status-row">
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line @lg:grid-cols-2 @4xl:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
                {cells}
            </div>
        </section>
    )
}

// ─── 2 · Needs you ───────────────────────────────────────────────────────────

/** A row's look, shared with WaitingOnClient's rows so the two lists read as one. */
export const NEEDS_ROW_CLASS = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 first:border-t-0'
/** The row's one action: a small outlined button, or a link that looks like one. */
export const NEEDS_ACTION_CLASS = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 text-small font-medium text-fg transition-colors hover:bg-surface-hover'

export interface NeedsItem {
    key: string
    icon: React.ReactNode
    title: React.ReactNode
    context?: React.ReactNode
    /** Right of the words, before the action: a due date, how late. */
    meta?: React.ReactNode
    action?: React.ReactNode
}

/** One thing that needs someone: what, where it stands, and the one thing to do about it. */
export function NeedsRow({ item }: { item: NeedsItem }) {
    return (
        <li className={NEEDS_ROW_CLASS}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>{item.icon}</span>
            <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-0.5">
                <span className="truncate text-ui font-medium text-fg">{item.title}</span>
                {item.context && <span className="truncate text-small text-fg-muted">{item.context}</span>}
            </div>
            {item.meta && <span className="shrink-0 text-caption text-fg-muted">{item.meta}</span>}
            {item.action}
        </li>
    )
}

/** A link styled as the row's action. A query-only href (the /tour's tabs) navigates in place. */
export function NeedsLink({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return href.startsWith('?')
        ? <Link href={href} className={NEEDS_ACTION_CLASS} {...rest}>{children}</Link>
        : <a href={href} className={NEEDS_ACTION_CLASS} {...rest}>{children}</a>
}

function NeedsGroup({ title, count, children, tour }: { title: string; count: number; children: React.ReactNode; tour?: string }) {
    return (
        <div className="flex flex-col gap-1.5" data-demo-tour={tour}>
            <p className="flex items-center gap-1.5 text-caption text-fg-muted">
                {title}
                <span className="font-normal tabular-nums">{count}</span>
            </p>
            <ul className="overflow-hidden rounded-card border border-line">{children}</ul>
        </div>
    )
}

/**
 * Needs you: one list, as on Home and in the Inbox, of what needs doing on this engagement (it was the
 * Action Center's counts, the Waiting on Reviewers list and the RAID card's rows). What's on you first,
 * then what's with someone else; everything clear folds into one line. Never in the export.
 *
 * `others` takes nodes as well as items, for WaitingOnClient's rows (they carry their own nudge).
 */
export function NeedsYou({ mine, others, othersCount, passed, loading }: {
    mine: NeedsItem[]
    others: React.ReactNode
    othersCount: number
    /** What was checked and is clear: "nothing overdue". */
    passed: string[]
    loading?: boolean
}) {
    const total = mine.length + othersCount
    return (
        <section aria-labelledby="needs-you-h" className="flex flex-col gap-3" data-no-export="" data-demo-tour="engagement-action-center">
            <OverviewSectionHeading id="needs-you-h" icon={Inbox} title="Needs you" count={loading ? undefined : total} />
            {loading ? (
                <div className="flex flex-col gap-2" aria-busy="true">
                    <div className="h-12 animate-pulse rounded-card bg-surface-muted" />
                    <div className="h-12 animate-pulse rounded-card bg-surface-muted" />
                </div>
            ) : (
                <>
                    {total === 0 && <p className="text-small text-fg-muted">Nothing needs you on this engagement right now.</p>}
                    {mine.length > 0 && (
                        <NeedsGroup title="Waiting on you" count={mine.length}>
                            {mine.map((item) => <NeedsRow key={item.key} item={item} />)}
                        </NeedsGroup>
                    )}
                    {othersCount > 0 && <NeedsGroup title="Waiting on others" count={othersCount} tour="overview-waiting-reviewer">{others}</NeedsGroup>}
                    {passed.length > 0 && (
                        <p className="flex items-start gap-1.5 px-0.5 text-small text-fg-muted">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-done-icon" aria-hidden />
                            <span>
                                <span className="font-medium">{passed.length} {passed.length === 1 ? 'check' : 'checks'} passed</span>
                                {' · '}{passed.join(', ')}
                            </span>
                        </p>
                    )}
                </>
            )}
        </section>
    )
}

// ─── 3 · Latest update ───────────────────────────────────────────────────────

/**
 * The published summary, one entry per section (`## Summary`, `## Progress`, …). Anything before the
 * first heading goes with the first section. A summary without headings (written by hand) is one section.
 */
export function splitUpdate(content: string): string[] {
    const lines = content.split('\n')
    const headings = lines.map((l, i) => (/^#{1,6}\s+/.test(l) ? i : -1)).filter((i) => i >= 0)
    if (headings.length < 2) return [content.trim()]
    const starts = [0, ...headings.slice(1)]
    return starts
        .map((start, i) => lines.slice(start, starts[i + 1] ?? lines.length).join('\n').trim())
        .filter(Boolean)
}

const moreSections = (n: number) => `Read the full update · ${n} more section${n === 1 ? '' : 's'}`

/**
 * The latest update, in a card of its own (mock: https://claude.ai/artifact/HrnCvBZYPn32HKaFBRMvU6,
 * option A). Its sections sit in two columns on a wide page, one on a narrow one, so the text uses the
 * width without running into long lines. Closed, it shows the first row: Summary and Progress side by
 * side, or Summary alone in one column. The rest is behind "Read the full update". The card's footer
 * holds that and the byline. The whole of it is in the export. The caller brings the controls (review
 * a draft, write with Brio, copy) and the byline.
 */
export function LatestUpdate({ content, meta, actions, notice, editor, empty, byline }: {
    content: string | null
    /** Beside the title: when it was published, whether the engagement has moved since. */
    meta?: React.ReactNode
    actions?: React.ReactNode
    /** A line above the text: a draft waiting for review, why Brio couldn't write. Never exported. */
    notice?: React.ReactNode
    /** Takes the text's place while the summary is edited by hand. Never exported. */
    editor?: React.ReactNode
    /** With nothing published. Never exported. */
    empty?: React.ReactNode
    byline?: React.ReactNode
}) {
    const [open, setOpen] = useState(false)
    const sections = content ? splitUpdate(content) : null
    const count = sections?.length ?? 0
    // What "Read the full update" holds back: all but the first section in one column, all but the
    // first two in two.
    const moreNarrow = count - 1
    const moreWide = Math.max(0, count - 2)
    return (
        <section aria-labelledby="latest-update-h" className="flex flex-col gap-3" data-demo-tour="engagement-ai-summary" {...(content ? {} : { 'data-no-export': '' })}>
            <OverviewSectionHeading id="latest-update-h" icon={FileText} title="Latest update" after={meta} actions={actions} />
            {notice && <div data-no-export="">{notice}</div>}
            {editor ? (
                <div data-no-export="">{editor}</div>
            ) : sections ? (
                <div className="@container overflow-hidden rounded-card border border-line bg-surface">
                    <div className={cn('grid grid-cols-1 gap-x-12 gap-y-6 px-6 py-5', count > 1 && '@4xl:grid-cols-2')}>
                        {sections.map((section, i) => {
                            const shown = open || i === 0
                            return (
                                <div
                                    key={i}
                                    // Held back: hidden on screen (the second only in one column), still in
                                    // the export, which drops the `hidden` of anything export-only.
                                    {...(shown ? {} : { 'data-export-only': '' })}
                                    className={cn('min-w-0', count === 1 && 'max-w-3xl', !shown && (i === 1 ? 'hidden @4xl:block' : 'hidden'))}
                                >
                                    <BrioSections content={section} className="text-fg" />
                                </div>
                            )
                        })}
                    </div>
                    {(moreNarrow > 0 || byline) && (
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line px-6 py-2.5">
                            {moreNarrow > 0 && (
                                <button
                                    type="button"
                                    data-no-export=""
                                    aria-expanded={open}
                                    onClick={() => setOpen((o) => !o)}
                                    // Two sections in two columns: both are already showing.
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-control text-small font-medium text-fg-muted transition-colors hover:text-fg',
                                        moreWide === 0 && '@4xl:hidden',
                                    )}
                                >
                                    {open ? 'Show less' : (
                                        <>
                                            <span className="@4xl:hidden">{moreSections(moreNarrow)}</span>
                                            <span className="hidden @4xl:inline">{moreSections(moreWide)}</span>
                                        </>
                                    )}
                                    {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                                </button>
                            )}
                            {byline}
                        </div>
                    )}
                </div>
            ) : (
                <div data-no-export="">{empty}</div>
            )}
        </section>
    )
}

// ─── 5 · Health details ──────────────────────────────────────────────────────

/**
 * What feeds the health score, closed by default (it was open, below the deliverables). The export
 * always carries it, open.
 */
export function HealthDetails({ report }: { report: ReportInputs }) {
    const [open, setOpen] = useState(false)
    // A link to a chart in here (`#ring-pace`, from a Health entry in the RAID log) opens it first.
    const bodyRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const openIt = () => setOpen(true)
        el.addEventListener(OPEN_SECTION_EVENT, openIt)
        return () => el.removeEventListener(OPEN_SECTION_EVENT, openIt)
    }, [])
    return (
        <section aria-labelledby="health-details-h" className="flex flex-col gap-5">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-2 text-left"
            >
                <Heart className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                <h2 id="health-details-h" className="text-h3 text-fg">Health details</h2>
                <span className="min-w-0 flex-1 truncate text-small text-fg-muted" data-no-export="">Pace, planning hygiene, comment responsiveness and delivery quality</span>
                <span data-no-export="" className="text-fg-muted">
                    {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                </span>
            </button>
            <div ref={bodyRef} {...(open ? {} : { 'data-export-only': '', 'data-closed-section': '', style: { display: 'none' } })}>
                <OverviewDetails report={report} />
            </div>
        </section>
    )
}
