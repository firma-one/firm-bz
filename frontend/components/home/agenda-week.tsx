"use client"

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"
import Link from "next/link"
import { addDays, format, isSameDay, startOfDay } from "date-fns"
import { AlertCircle, ArrowRight, Bell, Briefcase, CalendarDays, FileText, Layers } from "lucide-react"
import type { CalendarEventType } from "@/lib/actions/calendar"
import { getEngagementTagColor } from "@/lib/calendar/engagement-color"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { ShimmerBar } from "@/components/ui/shimmer"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type AgendaEventType = CalendarEventType | "reminder"

/** The app's tooltip, not the browser's: the full title, then where it belongs, muted. */
function ChipTooltip({ title, detail, children }: { title: ReactNode; detail?: ReactNode; children: ReactElement }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                {detail && <span className="text-fg-muted">{detail}</span>}
            </TooltipContent>
        </Tooltip>
    )
}

/**
 * One chip on the agenda: a firm calendar event (same data and access rules as the calendar page),
 * or one of the viewer's own dated reminders, which the calendar doesn't show.
 */
export type AgendaEvent = {
    id: string
    type: AgendaEventType
    title: string
    /** ISO timestamp; bucketed into days in the viewer's timezone, like the calendar page. */
    date: string
    href: string
    /** Colors the chip like the calendar does; reminders have none and stay gray. */
    engagementId: string | null
    clientName: string
}

/** Something of the viewer's that is due: an assigned deliverable, an engagement they lead, a reminder. */
export type AgendaDueItem = {
    id: string
    kind: "deliverable" | "engagement" | "reminder"
    title: string
    context: string
    href: string
    date: string
}

const TYPE_ICON: Record<AgendaEventType, typeof Briefcase> = {
    kickoff: Briefcase,
    due: Briefcase,
    followUp: Briefcase,
    deliverable: Layers,
    document: FileText,
    reminder: Bell,
}

const DUE_KIND_ICON: Record<AgendaDueItem["kind"], typeof Briefcase> = {
    deliverable: Layers,
    engagement: Briefcase,
    reminder: Bell,
}

/** Same stacking as the calendar's month view: documents, then deliverables, then engagements. */
const TYPE_ORDER: Record<AgendaEventType, number> = { document: 0, deliverable: 1, kickoff: 2, due: 2, followUp: 2, reminder: 3 }

/** Overdue chips shown before "+N more". */
const OVERDUE_SHOWN = 6

const PER_DAY = 3
const DAYS = 7

/**
 * Home's agenda (.claude/plans/ui-ux-overhaul.md, Phase 6). An Overdue row of the viewer's own
 * past-due work, then today and the next six days as day columns, each with its first few events
 * as tag-colored chips — the calendar's colors, so an engagement looks the same in both. On phones
 * the week collapses to the days that have something.
 *
 * `dueItems` is the viewer's due work (what Home's "Due soon" listed): anything before today is
 * Overdue, and upcoming reminders join the week. Upcoming deliverables and engagements are already
 * calendar events, so they are not added twice.
 */
export function AgendaWeek({
    events,
    dueItems = [],
    calendarHref,
}: {
    events: AgendaEvent[]
    dueItems?: AgendaDueItem[]
    /** The firm calendar to open. Omitted on a cross-firm week, which has no single calendar. */
    calendarHref?: string
}) {
    // Days are the viewer's, not the server's (UTC): resolve them after mount.
    const [today, setToday] = useState<Date | null>(null)
    useEffect(() => setToday(startOfDay(new Date())), [])
    const [showAllOverdue, setShowAllOverdue] = useState(false)

    const overdue = useMemo(() => {
        if (!today) return []
        return dueItems
            .filter((d) => Date.parse(d.date) < today.getTime())
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    }, [dueItems, today])

    const weekEvents = useMemo<AgendaEvent[]>(() => {
        if (!today) return events
        const reminders = dueItems
            .filter((d) => d.kind === "reminder" && Date.parse(d.date) >= today.getTime())
            .map((d) => ({ id: d.id, type: "reminder" as const, title: d.title, date: d.date, href: d.href, engagementId: null, clientName: d.context }))
        return [...events, ...reminders]
    }, [events, dueItems, today])

    const days = useMemo(() => {
        if (!today) return []
        const sorted = [...weekEvents].sort(
            (a, b) => Date.parse(a.date) - Date.parse(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
        )
        return Array.from({ length: DAYS }, (_, i) => {
            const day = addDays(today, i)
            return { day, items: sorted.filter((e) => isSameDay(new Date(e.date), day)) }
        })
    }, [weekEvents, today])

    const total = days.reduce((n, d) => n + d.items.length, 0)
    const shownOverdue = showAllOverdue ? overdue : overdue.slice(0, OVERDUE_SHOWN)

    return (
        <TooltipProvider delayDuration={300}>
        <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3 text-fg">Agenda</h2>
                {calendarHref && (
                    <Link href={calendarHref} className="flex items-center gap-1 text-small text-fg-muted transition-colors hover:text-fg">
                        Open calendar <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>

            {!today ? (
                <div className="flex h-32 flex-col justify-center gap-2 rounded-card border border-line px-3" aria-hidden>
                    <ShimmerBar className="w-1/3" />
                    <ShimmerBar className="w-1/2" />
                </div>
            ) : total === 0 && overdue.length === 0 ? (
                <div className="rounded-card border border-line">
                    <EmptyPanel compact icon={<CalendarDays />} title="Nothing overdue or on the calendar this week" description="Kickoffs, due dates, follow-ups and your reminders show up here." />
                </div>
            ) : (
                <div className="overflow-hidden rounded-card border border-line">
                {overdue.length > 0 && (
                    <div className={cn("flex flex-wrap items-center gap-1.5 px-3 py-2", total > 0 && "border-b border-line")}>
                        <span className="mr-1 flex items-center gap-1.5 text-small font-medium text-danger">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Overdue
                            <span className="font-normal tabular-nums">{overdue.length}</span>
                        </span>
                        {shownOverdue.map((d) => {
                            const Icon = DUE_KIND_ICON[d.kind]
                            return (
                                <ChipTooltip key={d.id} title={d.title} detail={`${d.context} · due ${format(new Date(d.date), "MMM d")}`}>
                                    <Link
                                        href={d.href}
                                        className="flex min-w-0 max-w-[18rem] items-center gap-1 rounded bg-tag-red-bg px-1.5 py-0.5 text-caption font-medium text-tag-red-fg transition-[filter] hover:brightness-95"
                                    >
                                        <Icon className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{d.title}</span>
                                        <span className="shrink-0 font-normal tabular-nums opacity-80">· {format(new Date(d.date), "MMM d")}</span>
                                    </Link>
                                </ChipTooltip>
                            )
                        })}
                        {overdue.length > OVERDUE_SHOWN && (
                            <button
                                type="button"
                                onClick={() => setShowAllOverdue((v) => !v)}
                                className="rounded-control px-1.5 py-0.5 text-caption text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                            >
                                {showAllOverdue ? "Show less" : `+${overdue.length - OVERDUE_SHOWN} more`}
                            </button>
                        )}
                    </div>
                )}
                {total > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-7 md:divide-x md:divide-line">
                    {days.map(({ day, items }, i) => {
                        const isToday = i === 0
                        return (
                            <div
                                key={day.toISOString()}
                                className={cn(
                                    "flex min-w-0 flex-col gap-1 border-b border-line p-2 last:border-b-0 md:min-h-[7.5rem] md:border-b-0",
                                    items.length === 0 && "hidden md:flex"
                                )}
                            >
                                <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
                                    <span className={cn("text-caption", isToday ? "font-medium text-action" : "text-fg-muted")}>
                                        {isToday ? "Today" : format(day, "EEE")}
                                    </span>
                                    <span
                                        className={cn(
                                            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-small tabular-nums",
                                            isToday ? "bg-action font-semibold text-action-fg" : "text-fg"
                                        )}
                                    >
                                        {format(day, "d")}
                                    </span>
                                </div>
                                {items.slice(0, PER_DAY).map((e) => {
                                    const Icon = TYPE_ICON[e.type] ?? Briefcase
                                    const color = e.engagementId ? getEngagementTagColor(e.engagementId) : "gray"
                                    return (
                                        <ChipTooltip key={e.id} title={e.title} detail={e.clientName}>
                                            <Link
                                                href={e.href}
                                                className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-caption font-medium transition-[filter] hover:brightness-95"
                                                style={{ backgroundColor: `var(--ui-tag-${color}-bg)`, color: `var(--ui-tag-${color}-fg)` }}
                                            >
                                                <Icon className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{e.title}</span>
                                            </Link>
                                        </ChipTooltip>
                                    )
                                })}
                                {items.length > PER_DAY &&
                                    (calendarHref ? (
                                        <Link href={calendarHref} className="px-1.5 text-caption text-fg-muted transition-colors hover:text-fg">
                                            +{items.length - PER_DAY} more
                                        </Link>
                                    ) : (
                                        <ChipTooltip
                                            title={`${items.length - PER_DAY} more`}
                                            detail={items.slice(PER_DAY).map((e) => <span key={e.id} className="block">{e.title}</span>)}
                                        >
                                            <span tabIndex={0} className="self-start rounded-control px-1.5 text-caption text-fg-muted outline-none focus-visible:ring-2 focus-visible:ring-action/30">
                                                +{items.length - PER_DAY} more
                                            </span>
                                        </ChipTooltip>
                                    ))}
                            </div>
                        )
                    })}
                </div>
                )}
                </div>
            )}
        </section>
        </TooltipProvider>
    )
}
