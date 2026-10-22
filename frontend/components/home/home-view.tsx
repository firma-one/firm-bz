import Link from "next/link"
import { format } from "date-fns"
import { ArrowRight, AtSign, Bell, Clock, History, Home, Inbox, Briefcase, MessageSquare, Users } from "lucide-react"
import type { RecentVisit } from "@/lib/recents"
import type { MyWork, NeedsYouItem } from "@/lib/home/my-work"
import type { HomeFirm, UnavailableFirm } from "@/lib/home/home-firms"
import type { HomeBookmark } from "@/lib/home/bookmarks"
import type { CalendarEvent } from "@/lib/calendar/calendar-data"
import { firmTabPath } from "@/lib/navigation/firm-paths"
import { PageHeading } from "@/components/ui/page-heading"
import { ListRow } from "@/components/ui/list-row"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { interactiveCardClass } from "@/components/ui/interactive-card"
import { StatusIcon } from "@/components/ui/status-icon"
import { Greeting, MyEngagementsList, RelativeTime } from "./home-client"
import { AgendaWeek, type AgendaDueItem, type AgendaEvent } from "./agenda-week"
import { HomeBookmarks } from "./home-bookmarks"
import { LandingArrival } from "@/components/app/landing-arrival"
import { FirmFilter, UnavailableFirmsNote } from "./firm-filter"
import { HomeEmptyLine, HomeSection } from "./home-section"

/**
 * The cross-firm Home at `/d/u/home` (.claude/plans/cross-firm-home-inbox.md): Needs you, Continue,
 * Agenda, My engagements and Bookmarks across every firm the viewer may open, or one firm when
 * filtered. With more than one firm on screen, every row names its firm. Pure rendering: the page
 * loads the data, already limited to what the viewer may see.
 *
 * Every section has the same heading (HomeSection) and sits 40px from the next; an empty one is a
 * single quiet line. Needs you always comes first, so the page keeps its order whatever the day
 * holds (.claude/plans/app-design-refinements.md, section 13).
 */

/**
 * A deliverable to review and an upload to approve are both waiting on you, so they lead with the
 * status language's "Waiting" icon, named for screen readers; changes requested are its "Problem";
 * a client comment is a speech bubble, a mention keeps its @, any other reminder its bell.
 */
function needsIcon(item: NeedsYouItem): React.ReactNode {
    switch (item.kind) {
        case "deliverable_review": return <StatusIcon stage="waiting" label="In review" />
        case "intake": return <StatusIcon stage="waiting" label="Upload to review" />
        case "changes_requested": return <StatusIcon stage="problem" label="Changes requested" />
        case "client_comment": return <MessageSquare aria-label="Client comment" />
        case "reminder": return /comment/i.test(item.context) ? <AtSign /> : <Bell />
    }
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

type Label = (firmId: string | null | undefined, context: string) => string

function ContinueSection({ recents, label }: { recents: RecentVisit[]; label: Label }) {
    const shown = recents.slice(0, continueCount(recents.length))
    if (shown.length === 0) return null
    return (
        <HomeSection icon={<History />} title="Continue where you left off">
            <div className={`grid auto-rows-fr gap-3 ${CONTINUE_COLS[shown.length] ?? CONTINUE_COLS[6]}`}>
                {shown.map((r, i) => (
                    <Link
                        key={r.id}
                        href={r.path}
                        className={`group flex h-full min-w-0 flex-col justify-between gap-4 p-3.5 ${interactiveCardClass()}`}
                    >
                        <div className="flex min-w-0 flex-col gap-1">
                            <span className="flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
                                {r.entityType === "engagement" ? <Briefcase className="h-3.5 w-3.5 shrink-0" /> : <Users className="h-3.5 w-3.5 shrink-0" />}
                                <span className="truncate">{label(r.firmId, r.context ?? (r.entityType === "client" ? "Client" : "Engagement"))}</span>
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
        </HomeSection>
    )
}

function NeedsYouSection({ items, label }: { items: NeedsYouItem[]; label: Label }) {
    return (
        <HomeSection icon={<Inbox />} title="Needs you" count={items.length}>
            {items.length === 0 ? (
                <HomeEmptyLine>All caught up. Approvals, client comments, changes requested and mentions show up here.</HomeEmptyLine>
            ) : (
                <div className="flex flex-col">
                {items.map((item) => (
                    <ListRow
                        key={item.id}
                        href={item.href}
                        leading={needsIcon(item)}
                        title={item.title}
                        meta={label(item.firmId, item.context)}
                        trailing={
                            <>
                                {item.at && <RelativeTime iso={item.at} className="hidden md:inline" />}
                                <span className="rounded-control border border-line px-1.5 py-0.5 text-caption text-fg group-hover:border-line-strong group-hover:text-fg">
                                    {item.actionLabel}
                                </span>
                            </>
                        }
                    />
                ))}
                </div>
            )}
        </HomeSection>
    )
}

export function HomeView({
    firstName,
    firms,
    selectedFirm,
    unavailable,
    recents,
    calendarEvents,
    work,
    bookmarks,
    calendarHref: calendarHrefOverride,
    readOnly = false,
}: {
    firstName: string | null
    /** Every firm the viewer may open — the filter's options. */
    firms: HomeFirm[]
    /** The firm the view is filtered to, if any; the data below is already limited to it. */
    selectedFirm: HomeFirm | null
    unavailable: UnavailableFirm[]
    recents: RecentVisit[]
    calendarEvents: CalendarEvent[]
    work: MyWork
    bookmarks: HomeBookmark[]
    /** Where "Open calendar" goes, when it isn't the one firm's calendar page (the public demo). */
    calendarHref?: string
    /** No write actions: bookmarks can't be removed (the public demo). */
    readOnly?: boolean
}) {
    const shownFirms = selectedFirm ? [selectedFirm] : firms
    const multiFirm = shownFirms.length > 1
    const firmName = new Map(firms.map((f) => [f.id, f.name]))
    // "FirmaOne · DataSentry" — only when rows from several firms share the page.
    const label: Label = (firmId, context) => {
        const name = multiFirm && firmId ? firmName.get(firmId) : null
        return name ? `${name} · ${context}` : context
    }

    const agendaEvents: AgendaEvent[] = calendarEvents.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        date: e.date,
        href: e.ctaUrl ?? "#",
        engagementId: e.engagementId,
        clientName: label(e.firmId, e.clientName),
    }))
    const dueItems: AgendaDueItem[] = work.dueSoon.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        context: label(d.firmId, d.context),
        href: d.href,
        date: d.dueDate,
        status: d.status,
    }))
    // One firm on screen has one calendar to open; a cross-firm week has none.
    const calendarHref =
        calendarHrefOverride ?? (shownFirms.length === 1 ? firmTabPath(shownFirms[0].groupSlug, shownFirms[0].slug, "calendar") : undefined)

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pb-10">
            {/* Sign-in lands here with ?landed=returning: the loader's last beat, then "Welcome back". */}
            <LandingArrival firstName={firstName} />
            <PageHeading
                icon={<Home />}
                title={<Greeting firstName={firstName} />}
                description={selectedFirm ? `${selectedFirm.name} · ${format(new Date(), "EEEE, MMMM d")}` : format(new Date(), "EEEE, MMMM d")}
                actions={<FirmFilter firms={firms.map((f) => ({ slug: f.slug, name: f.name }))} selected={selectedFirm?.slug ?? null} />}
                className="pb-0"
            >
                <UnavailableFirmsNote firms={unavailable} />
            </PageHeading>

            {firms.length === 0 ? (
                <EmptyPanel
                    icon={<Home />}
                    title="Nothing here yet"
                    description="Once you're in a firm you can open, your recent work, agenda and engagements show up here."
                />
            ) : (
                <>
                    {/* First, always: what is waiting on you. The order never changes with the day's state. */}
                    <NeedsYouSection items={work.needsYou} label={label} />

                    <ContinueSection recents={recents} label={label} />

                    <AgendaWeek events={agendaEvents} dueItems={dueItems} calendarHref={calendarHref} />

                    <MyEngagementsList
                        engagements={work.engagements}
                        firmNames={multiFirm ? Object.fromEntries(firmName) : undefined}
                    />

                    <HomeBookmarks bookmarks={bookmarks.map((b) => ({ ...b, context: label(b.firmId, b.context) }))} readOnly={readOnly} />
                </>
            )}
        </div>
    )
}
