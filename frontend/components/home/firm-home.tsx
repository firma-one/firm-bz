import Link from "next/link"
import { format } from "date-fns"
import { ArrowRight, AtSign, Building2, CalendarClock, CheckCircle2, FileCheck2, Inbox, Sparkles, Upload, Briefcase, Users, Clock } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { getRecentVisits, type RecentVisit } from "@/lib/recents"
import { getMyWork, type DueItem, type NeedsYouItem } from "@/lib/home/my-work"
import { getUserReminders } from "@/lib/actions/user-reminders"
import { PageHeading } from "@/components/ui/page-heading"
import { ListGroup, ListRow } from "@/components/ui/list-row"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { StatusPill, Tag } from "@/components/ui/tag"
import { Greeting, MyEngagementsList, RelativeTime } from "./home-client"
import { AgendaWeek, type AgendaDueItem, type AgendaEvent } from "./agenda-week"
import { getFirmCalendarData } from "@/lib/actions/calendar"
import { getShellSidebarData } from "@/lib/actions/shell"
import { HomeBookmarks } from "./home-bookmarks"
import { firmTabPath } from "@/lib/navigation/firm-paths"

/**
 * New UI Firm Home (.claude/plans/ui-ux-overhaul.md, Phase 3) — what the user lands on.
 * Rendered by the firm page in place of the legacy clients/overview view when the shell is v2 and
 * no `?tab=` is set. Lives inside the firm layout, so the subscription and maintenance gates apply.
 */

const NEEDS_ICON: Record<NeedsYouItem["kind"], React.ReactNode> = {
    deliverable_review: <FileCheck2 />,
    intake: <Upload />,
    ai_summary: <Sparkles />,
    reminder: <AtSign />,
}

/** How many recents to show: only full rows, so the cards line up — 1–3 in one row, else 6 in two. */
function continueCount(available: number): number {
    if (available <= 3) return available
    return available >= 6 ? 6 : 3
}

const CONTINUE_COLS: Record<number, string> = {
    1: "sm:grid-cols-1 sm:max-w-sm",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    6: "sm:grid-cols-2 lg:grid-cols-3",
}

/**
 * Notion's "Jump back in": identical cards in an even grid. The latest visit used to be a large
 * featured card beside small ones, which left the row lopsided whenever there were only a few.
 */
function ContinueSection({ recents }: { recents: RecentVisit[] }) {
    const shown = recents.slice(0, continueCount(recents.length))
    if (shown.length === 0) return null
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-h3 text-fg">Continue where you left off</h2>
            <div className={`grid auto-rows-fr gap-3 ${CONTINUE_COLS[shown.length] ?? CONTINUE_COLS[6]}`}>
                {shown.map((r, i) => (
                    <Link
                        key={r.id}
                        href={r.path}
                        className="group flex h-full min-w-0 flex-col justify-between gap-4 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-hover"
                    >
                        <div className="flex min-w-0 flex-col gap-1">
                            <span className="flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
                                {r.entityType === "engagement" ? <Briefcase className="h-3.5 w-3.5 shrink-0" /> : <Users className="h-3.5 w-3.5 shrink-0" />}
                                <span className="truncate">{r.context ?? (r.entityType === "client" ? "Client" : "Engagement")}</span>
                            </span>
                            <span className="line-clamp-2 text-ui font-medium text-fg">{r.title}</span>
                        </div>
                        <span className="flex items-center justify-between gap-2 text-small text-fg-muted">
                            <span className="flex min-w-0 items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <RelativeTime iso={r.visitedAt} className="truncate" />
                            </span>
                            <span
                                className={`flex shrink-0 items-center gap-1 font-medium text-action transition-opacity ${
                                    i === 0 ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                                }`}
                            >
                                Continue <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    )
}

function NeedsYouSection({ items }: { items: NeedsYouItem[] }) {
    return (
        <ListGroup title="Needs you" count={items.length} icon={<Inbox className="h-3.5 w-3.5 text-fg-muted" />}>
            {items.length === 0 ? (
                <EmptyPanel compact icon={<CheckCircle2 />} title="You're all caught up" description="Approvals, uploads to review and mentions show up here." />
            ) : (
                items.map((item) => (
                    <ListRow
                        key={item.id}
                        href={item.href}
                        leading={NEEDS_ICON[item.kind]}
                        title={item.title}
                        meta={item.context}
                        trailing={
                            <>
                                {item.at && <RelativeTime iso={item.at} className="hidden md:inline" />}
                                <span className="rounded-control border border-line px-1.5 py-0.5 text-caption text-fg group-hover:border-line-strong group-hover:text-fg">
                                    {item.actionLabel}
                                </span>
                            </>
                        }
                    />
                ))
            )}
        </ListGroup>
    )
}

/**
 * No longer rendered: its items now feed the Agenda card (overdue ones as its Overdue row,
 * reminders into the week). Kept until Deepak signs off on the merge, then delete.
 */
function DueSoonSection({ items }: { items: DueItem[] }) {
    return (
        <ListGroup title="Due soon" count={items.length} icon={<CalendarClock className="h-3.5 w-3.5 text-fg-muted" />}>
            {items.length === 0 ? (
                <EmptyPanel compact icon={<CalendarClock />} title="Nothing due in the next two weeks" />
            ) : (
                items.map((item) => (
                    <ListRow
                        key={item.id}
                        href={item.href}
                        leading={item.kind === "engagement" ? <Briefcase /> : item.kind === "deliverable" ? <FileCheck2 /> : <CalendarClock />}
                        title={item.title}
                        meta={item.context}
                        trailing={
                            <>
                                {item.kind === "deliverable" && item.status && (
                                    <span className="hidden sm:inline-flex">
                                        <StatusPill kind="deliverable" status={item.status} />
                                    </span>
                                )}
                                {item.overdue ? (
                                    <Tag color="red">Overdue · {format(new Date(item.dueDate), "MMM d")}</Tag>
                                ) : (
                                    <span className="tabular-nums">{format(new Date(item.dueDate), "MMM d")}</span>
                                )}
                            </>
                        }
                    />
                ))
            )}
        </ListGroup>
    )
}

export async function FirmHome({ groupSlug, firmSlug }: { groupSlug: string; firmSlug: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const firm = await prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true, name: true } })
    if (!firm) return null

    const [recents, reminders, calendar, shell] = await Promise.all([
        getRecentVisits(user.id, firm.id, 6),
        getUserReminders().catch(() => []),
        // The calendar page's own data, so the agenda shows exactly what the user may see there.
        getFirmCalendarData(firmSlug).catch(() => null),
        // Bookmarks, filtered exactly as the sidebar filters engagements.
        getShellSidebarData(firmSlug),
    ])
    const work = await getMyWork({ userId: user.id, firms: [{ id: firm.id, name: firm.name, slug: firmSlug, groupSlug }], reminders })

    // Only the agenda's week travels to the client; the margins cover any viewer timezone.
    const calendarHref = firmTabPath(groupSlug, firmSlug, "calendar")
    const windowStart = Date.now() - 36 * 3600_000
    const windowEnd = Date.now() + 8 * 86400_000
    const agendaEvents: AgendaEvent[] = (calendar?.events ?? [])
        .filter((e) => {
            const t = Date.parse(e.date)
            return t >= windowStart && t <= windowEnd
        })
        .map((e) => ({
            id: e.id,
            type: e.type,
            title: e.title,
            date: e.date,
            href: e.ctaUrl ?? calendarHref,
            engagementId: e.engagementId,
            clientName: e.clientName,
        }))

    // The viewer's own due work for the agenda: overdue items fill its Overdue row.
    const dueItems: AgendaDueItem[] = work.dueSoon.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        context: d.context,
        href: d.href,
        date: d.dueDate,
    }))

    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string }
    const firstName = (meta.full_name || meta.name || "").trim().split(/\s+/)[0] || null

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
            <PageHeading
                icon={<Building2 />}
                title={<Greeting firstName={firstName} />}
                description={`${firm.name} · ${format(new Date(), "EEEE, MMMM d")}`}
                className="pb-0"
            />

            <ContinueSection recents={recents} />

            <AgendaWeek events={agendaEvents} dueItems={dueItems} calendarHref={calendarHref} />

            <NeedsYouSection items={work.needsYou} />

            <MyEngagementsList engagements={work.engagements} />

            <HomeBookmarks bookmarks={shell?.favorites ?? []} />
        </div>
    )
}
