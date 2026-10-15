import Link from "next/link"
import { format } from "date-fns"
import { ArrowRight, AtSign, CalendarClock, CheckCircle2, FileCheck2, Inbox, Sparkles, Upload, Briefcase, Users, Clock } from "lucide-react"
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

function ContinueSection({ recents }: { recents: RecentVisit[] }) {
    if (recents.length === 0) return null
    const [latest, ...rest] = recents
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-h3 text-fg">Continue where you left off</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                    href={latest.path}
                    className="group flex flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-surface-hover sm:col-span-2 lg:col-span-1 lg:row-span-2"
                >
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-caption text-fg-muted">
                            {latest.entityType === "engagement" ? <Briefcase className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                            {latest.context ?? (latest.entityType === "client" ? "Client" : "Engagement")}
                        </span>
                        <span className="text-h2 text-fg">{latest.title}</span>
                    </div>
                    <span className="flex items-center justify-between text-small text-fg-muted">
                        <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <RelativeTime iso={latest.visitedAt} />
                        </span>
                        <span className="flex items-center gap-1 font-medium text-action group-hover:underline">
                            Continue <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                    </span>
                </Link>
                {rest.map((r) => (
                    <Link
                        key={r.id}
                        href={r.path}
                        className="flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                        <span className="truncate text-ui font-medium text-fg">{r.title}</span>
                        <span className="flex items-center gap-1.5 truncate text-small text-fg-muted">
                            {r.context && <span className="truncate">{r.context}</span>}
                            {r.context && <span aria-hidden>·</span>}
                            <RelativeTime iso={r.visitedAt} className="shrink-0" />
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

    const [recents, reminders] = await Promise.all([
        getRecentVisits(user.id, firm.id, 5),
        getUserReminders().catch(() => []),
    ])
    const work = await getMyWork({ userId: user.id, firmId: firm.id, groupSlug, firmSlug, reminders })

    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string }
    const firstName = (meta.full_name || meta.name || "").trim().split(/\s+/)[0] || null

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
            <PageHeading
                title={<Greeting firstName={firstName} />}
                description={`${firm.name} · ${format(new Date(), "EEEE, MMMM d")}`}
                className="pb-0"
            />

            <ContinueSection recents={recents} />

            <div className="grid gap-6 lg:grid-cols-2">
                <NeedsYouSection items={work.needsYou} />
                <DueSoonSection items={work.dueSoon} />
            </div>

            <MyEngagementsList engagements={work.engagements} />
        </div>
    )
}
