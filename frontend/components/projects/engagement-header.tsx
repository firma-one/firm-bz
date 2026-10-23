"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Briefcase, CalendarDays, Flag, Users } from "lucide-react"
import { ClientIcon } from "@/components/ui/client-icon"
import { updateProject, type LwCrmEngagementStatus } from "@/lib/actions/project"
import { DateProperty, PersonAvatar, StatusProperty, type PersonOption } from "@/components/ui/property-cells"
import { Tag } from "@/components/ui/tag"
import { Hint } from "@/components/ui/tooltip"
import { HeaderProp as Prop } from "@/components/ui/header-prop"
import { useToast } from "@/components/ui/toast"
import { clientPath } from "@/lib/navigation/firm-paths"

/**
 * Engagement page header (.claude/plans/ui-ux-overhaul.md, Phase 6) — Linear project-page style:
 * the title, an optional description, then one row of properties (status, lead, members, start,
 * due, client) that leads edit in place.
 *
 * Status can be moved between Planned, Active and Paused here. Completing or reopening stays in
 * Settings, because closing an engagement revokes external access and removes members.
 */

const INLINE_STATUSES: LwCrmEngagementStatus[] = ["PLANNED", "ACTIVE", "PAUSED"]

type Member = { userId: string; name: string; role: string; avatarUrl: string | null; isAgent: boolean }

/** Last member list per engagement, so a revisit (or the page's loading state) shows people at once. */
const membersCache = new Map<string, Member[]>()

export function EngagementHeader({
    projectId,
    groupSlug,
    orgSlug,
    clientSlug,
    clientName,
    name,
    description,
    status,
    kickoffDate,
    dueDate,
    canManage,
    showPeople,
    membersHref,
    personaDisplayName,
    fetchPeople = true,
    clientHref,
}: {
    projectId: string
    groupSlug: string
    orgSlug: string
    clientSlug: string
    clientName?: string
    name: string
    description?: string
    status: LwCrmEngagementStatus
    kickoffDate: string | null
    dueDate: string | null
    /** project:can_manage — edits status and dates. */
    canManage: boolean
    /** Internal members see the lead and member list; external guests don't. */
    showPeople: boolean
    membersHref: string
    personaDisplayName?: string | null
    /** False in the page's loading state: show the cached people only, don't fetch them again. */
    fetchPeople?: boolean
    /** Where the Client property links; defaults to the client's firm page. The public demo passes its own. */
    clientHref?: string
}) {
    const router = useRouter()
    const { addToast } = useToast()
    const [members, setMembers] = useState<Member[] | null>(() => membersCache.get(projectId) ?? null)

    useEffect(() => {
        if (!showPeople || !fetchPeople) return
        let cancelled = false
        fetch(`/api/projects/${projectId}/members`)
            .then((r) => (r.ok ? r.json() : { members: [] }))
            .then((d) => {
                const list = ((d.members ?? []) as Member[]).filter((m) => !m.isAgent)
                membersCache.set(projectId, list)
                if (!cancelled) setMembers(list)
            })
            .catch(() => { if (!cancelled) setMembers([]) })
        return () => { cancelled = true }
    }, [projectId, showPeople, fetchPeople])

    async function save(data: Parameters<typeof updateProject>[1], what: string) {
        try {
            await updateProject(projectId, data, orgSlug, clientSlug)
            router.refresh()
        } catch (e) {
            addToast({ type: "error", title: `Couldn't update ${what}`, message: e instanceof Error ? e.message : undefined })
            throw e
        }
    }

    const leads: PersonOption[] = (members ?? []).filter((m) => m.role === "eng_admin").map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))
    const everyone: PersonOption[] = (members ?? []).map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))
    const isCompleted = status === "COMPLETED"

    return (
        <header className="flex flex-col gap-2 pb-3" data-demo-tour="engagement-header">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex shrink-0 items-center text-fg-muted [&_svg]:h-7 [&_svg]:w-7" aria-hidden>
                        <Briefcase />
                    </span>
                    {/* One line, cut short when a pane narrows the page: wrapping to two lines shifted everything below. */}
                    <Hint label={name || "Engagement"} side="bottom">
                        <h1 className="min-w-0 truncate text-h1 text-fg">{name || "Engagement"}</h1>
                    </Hint>
                </div>
                {personaDisplayName && (
                    <Hint label="Your role on this engagement">
                        <span className="mt-2 inline-flex">
                            <Tag color="gray">You · {personaDisplayName}</Tag>
                        </span>
                    </Hint>
                )}
            </div>
            {description && <p className="max-w-3xl text-ui text-fg-muted line-clamp-2">{description}</p>}

            <div className="-ml-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
                <Prop label="Status">
                    <StatusProperty
                        kind="engagement"
                        value={status}
                        options={INLINE_STATUSES}
                        disabled={!canManage || isCompleted}
                        onChange={(next) => save({ status: next as LwCrmEngagementStatus }, "status")}
                    />
                </Prop>

                {showPeople && (
                    <Prop label={leads.length > 1 ? "Leads" : "Lead"}>
                        <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-small text-fg">
                            {members === null ? (
                                <span className="text-fg-subtle">…</span>
                            ) : leads.length === 0 ? (
                                <span className="text-fg-subtle">No lead</span>
                            ) : (
                                <>
                                    <span className="flex -space-x-1">
                                        {leads.slice(0, 3).map((l) => <PersonAvatar key={l.id} person={l} />)}
                                    </span>
                                    <span className="max-w-[10rem] truncate">{leads.length === 1 ? leads[0].name : `${leads.length} leads`}</span>
                                </>
                            )}
                        </span>
                    </Prop>
                )}

                {showPeople && members !== null && everyone.length > 0 && (
                    <Prop label="Members">
                        <Link href={membersHref} className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
                            <Users className="h-3.5 w-3.5" />
                            <span className="flex -space-x-1">
                                {everyone.slice(0, 4).map((p) => <PersonAvatar key={p.id} person={p} size={18} />)}
                            </span>
                            <span className="tabular-nums">{everyone.length}</span>
                        </Link>
                    </Prop>
                )}

                <Prop label="Start" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                    <DateProperty
                        value={kickoffDate}
                        placeholder="Start"
                        disabled={!canManage || isCompleted}
                        onChange={(next) => save({ kickoffDate: next }, "start date")}
                    />
                </Prop>

                <Prop label="Due" icon={<Flag className="h-3.5 w-3.5" />}>
                    <DateProperty
                        value={dueDate}
                        placeholder="Due"
                        highlightOverdue={!isCompleted}
                        disabled={!canManage || isCompleted}
                        onChange={(next) => save({ dueDate: next }, "due date")}
                    />
                </Prop>

                {clientName && (
                    <Prop label="Client">
                        <Link
                            href={clientHref ?? clientPath(groupSlug, orgSlug, clientSlug)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                        >
                            <ClientIcon className="h-3.5 w-3.5" />
                            {clientName}
                        </Link>
                    </Prop>
                )}
            </div>
        </header>
    )
}
