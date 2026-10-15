"use client"

import { useMemo, useState } from "react"
import { Briefcase } from "lucide-react"
import { formatDistanceToNowStrict, format } from "date-fns"
import { ListGroup, ListRow } from "@/components/ui/list-row"
import { StatusPill } from "@/components/ui/tag"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { cn } from "@/lib/utils"
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
        <time dateTime={iso} title={format(new Date(iso), "PPpp")} className={className} suppressHydrationWarning>
            {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
        </time>
    )
}

type Grouping = "client" | "status"

const STATUS_ORDER = ["ACTIVE", "PLANNED", "PAUSED", "COMPLETED"]
const STATUS_TITLES: Record<string, string> = { ACTIVE: "Active", PLANNED: "Planned", PAUSED: "Paused", COMPLETED: "Completed" }

/** Linear-style "My engagements": open by default, grouped by client or status. */
export function MyEngagementsList({ engagements }: { engagements: HomeEngagement[] }) {
    const [showAll, setShowAll] = useState(false)
    const [grouping, setGrouping] = useState<Grouping>("client")

    const visible = useMemo(
        () => (showAll ? engagements : engagements.filter((e) => e.status !== "COMPLETED")),
        [engagements, showAll]
    )

    const groups = useMemo(() => {
        const map = new Map<string, HomeEngagement[]>()
        for (const e of visible) {
            const key = grouping === "client" ? e.clientName : e.status
            map.set(key, [...(map.get(key) ?? []), e])
        }
        const entries = Array.from(map.entries())
        if (grouping === "status") entries.sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]))
        else entries.sort((a, b) => a[0].localeCompare(b[0]))
        return entries
    }, [visible, grouping])

    const toggle = (active: boolean) =>
        cn(
            "rounded-control px-2 py-0.5 text-small transition-colors",
            active ? "bg-surface-selected text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
        )

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-h3 text-fg">My engagements</h2>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0.5" role="group" aria-label="Show">
                        <button type="button" className={toggle(!showAll)} onClick={() => setShowAll(false)}>Open</button>
                        <button type="button" className={toggle(showAll)} onClick={() => setShowAll(true)}>All</button>
                    </div>
                    <div className="flex items-center gap-0.5" role="group" aria-label="Group by">
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
                        <ListGroup key={key} title={grouping === "status" ? STATUS_TITLES[key] ?? key : key} count={items.length}>
                            {items.map((e) => (
                                <ListRow
                                    key={e.id}
                                    href={e.href}
                                    title={e.name}
                                    meta={grouping === "status" ? e.clientName : undefined}
                                    trailing={
                                        <>
                                            {e.dueDate && (
                                                <span className="hidden tabular-nums sm:inline" title="Due date">
                                                    {format(new Date(e.dueDate), "MMM d")}
                                                </span>
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
