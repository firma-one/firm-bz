"use client"

import { useMemo, useState } from "react"
import { Briefcase, Building2, Users } from "lucide-react"
import { formatDistanceToNowStrict, format } from "date-fns"
import { ListGroup, ListRow } from "@/components/ui/list-row"
import { StatusPill } from "@/components/ui/tag"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { cn } from "@/lib/utils"
import { Hint } from "@/components/ui/tooltip"
import type { HomeEngagement } from "@/lib/home/my-work"

/** Greets in the viewer's own timezone — the server renders in UTC. */
export function Greeting({ firstName }: { firstName: string | null }) {
    const [text] = useState(() => {
        const h = new Date().getHours()
        const part = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
        return firstName ? `${part}, ${firstName}` : part
    })
    return <span suppressHydrationWarning>{text}</span>
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
    return (
        <Hint label={format(new Date(iso), "PPpp")}>
            <time dateTime={iso} className={className} suppressHydrationWarning>
                {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
            </time>
        </Hint>
    )
}

type Grouping = "firm" | "client" | "status"

/*
 * The app's icons for the three levels, as in the breadcrumbs, the sidebar and ⌘K: Building2 for a
 * firm, Users for a client, Briefcase for an engagement.
 */
const GROUP_ICON_CLASS = "h-3.5 w-3.5 shrink-0 text-fg-subtle"

/** A row's client, and its firm when the list spans several, each with its icon. */
function ClientAndFirm({ client, firm }: { client: string; firm?: string }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1">
                <Users className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{client}</span>
            </span>
            {firm && (
                <span className="inline-flex min-w-0 items-center gap-1">
                    <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{firm}</span>
                </span>
            )}
        </span>
    )
}

const STATUS_ORDER = ["ACTIVE", "PLANNED", "PAUSED", "COMPLETED"]
const STATUS_TITLES: Record<string, string> = { ACTIVE: "Active", PLANNED: "Planned", PAUSED: "Paused", COMPLETED: "Completed" }

/**
 * Linear-style "My engagements": open by default, grouped by client or status — and, on the
 * cross-firm Home for someone in several firms, by firm (the default there).
 */
export function MyEngagementsList({
    engagements,
    firmNames,
}: {
    engagements: HomeEngagement[]
    /** Firm id → name. Given only when the list spans several firms; adds "By firm". */
    firmNames?: Record<string, string>
}) {
    const multiFirm = Boolean(firmNames)
    const [showAll, setShowAll] = useState(false)
    const [grouping, setGrouping] = useState<Grouping>(multiFirm ? "firm" : "client")
    const firmOf = (e: HomeEngagement) => firmNames?.[e.firmId] ?? ""

    const visible = useMemo(
        () => (showAll ? engagements : engagements.filter((e) => e.status !== "COMPLETED")),
        [engagements, showAll]
    )

    const groups = useMemo(() => {
        const map = new Map<string, HomeEngagement[]>()
        for (const e of visible) {
            // Client names can repeat across firms, so a multi-firm client group names its firm too.
            const firm = firmNames?.[e.firmId] ?? ""
            const key =
                grouping === "firm" ? firm
                : grouping === "client" ? (firmNames ? `${e.clientName} · ${firm}` : e.clientName)
                : e.status
            map.set(key, [...(map.get(key) ?? []), e])
        }
        const entries = Array.from(map.entries())
        if (grouping === "status") entries.sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]))
        else entries.sort((a, b) => a[0].localeCompare(b[0]))
        return entries
    }, [visible, grouping, firmNames])

    const toggle = (active: boolean) =>
        cn(
            "rounded-control px-2 py-0.5 text-small transition-colors",
            active ? "bg-surface-selected text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
        )

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-h3 text-fg">
                    <Briefcase className="h-5 w-5 text-fg-muted" aria-hidden />
                    My engagements
                </h2>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0.5" role="group" aria-label="Show">
                        <button type="button" className={toggle(!showAll)} onClick={() => setShowAll(false)}>Open</button>
                        <button type="button" className={toggle(showAll)} onClick={() => setShowAll(true)}>All</button>
                    </div>
                    <div className="flex items-center gap-0.5" role="group" aria-label="Group by">
                        {multiFirm && (
                            <button type="button" className={toggle(grouping === "firm")} onClick={() => setGrouping("firm")}>By firm</button>
                        )}
                        <button type="button" className={toggle(grouping === "client")} onClick={() => setGrouping("client")}>By client</button>
                        <button type="button" className={toggle(grouping === "status")} onClick={() => setGrouping("status")}>By status</button>
                    </div>
                </div>
            </div>

            {visible.length === 0 ? (
                <EmptyPanel
                    compact
                    icon={<Briefcase />}
                    title={showAll ? "No engagements yet" : "No open engagements"}
                    description="Engagements you're a member of show up here."
                />
            ) : (
                <div className="flex flex-col gap-3">
                    {groups.map(([key, items]) => (
                        <ListGroup
                            key={key}
                            title={grouping === "status" ? STATUS_TITLES[key] ?? key : key}
                            count={items.length}
                            icon={
                                grouping === "firm" ? <Building2 className={GROUP_ICON_CLASS} aria-hidden />
                                : grouping === "client" ? <Users className={GROUP_ICON_CLASS} aria-hidden />
                                : undefined
                            }
                        >
                            {items.map((e) => (
                                <ListRow
                                    key={e.id}
                                    href={e.href}
                                    leading={<Briefcase aria-hidden />}
                                    title={e.name}
                                    meta={
                                        grouping === "firm" ? <ClientAndFirm client={e.clientName} />
                                        : grouping === "status" ? <ClientAndFirm client={e.clientName} firm={multiFirm ? firmOf(e) : undefined} />
                                        : undefined
                                    }
                                    trailing={
                                        <>
                                            {e.dueDate && (
                                                <Hint label="Due date">
                                                    <span className="hidden tabular-nums sm:inline">
                                                        {format(new Date(e.dueDate), "MMM d")}
                                                    </span>
                                                </Hint>
                                            )}
                                            <RelativeTime iso={e.updatedAt} className="hidden w-24 text-right md:inline" />
                                            <StatusPill kind="engagement" status={e.status} />
                                        </>
                                    }
                                />
                            ))}
                        </ListGroup>
                    ))}
                </div>
            )}
        </section>
    )
}
