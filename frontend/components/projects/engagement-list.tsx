'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Briefcase, CalendarDays, Clock3, Flag, Shield, Type, UserRound, CircleDot } from 'lucide-react'
import type { HierarchyClient } from '@/lib/actions/hierarchy'
import type { ProjectMemberSummary } from '@/lib/actions/members'
import { engagementPath } from '@/lib/navigation/firm-paths'
import {
    NotionTable,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { Tag } from '@/components/ui/tag'
import { StatusPill } from '@/components/ui/status-pill'
import { PersonAvatar } from '@/components/ui/property-cells'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'

interface ProjectListProps {
    projects: HierarchyClient['engagements']
    groupSlug: string
    orgSlug: string
    clientSlug: string
    clientStatus?: string | null
    isRefreshing?: boolean
    /** Per-engagement people, from getProjectMemberSummaries — fills the Lead column. */
    memberSummaries?: Record<string, ProjectMemberSummary>
    /** Where an engagement opens; defaults to its firm page. The public demo passes its own. */
    hrefFor?: (project: HierarchyClient['engagements'][number]) => string
}

/** The current user's role on the engagement, as a short label. */
const ROLE_LABEL: Record<string, string> = {
    eng_admin: 'Lead',
    eng_member: 'Contributor',
    eng_ext_collaborator: 'Contributor · Limited',
    eng_viewer: 'Reviewer',
}

function day(value: string | null): string | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : format(d, 'MMM d, yyyy')
}

function isOverdue(due: string | null, status: string): boolean {
    if (!due || status === 'COMPLETED') return false
    const d = new Date(due)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return !Number.isNaN(d.getTime()) && d < today
}

/**
 * A client's engagements as a Notion table (.claude/plans/ui-ux-overhaul.md, Phase 6): one row
 * each — name, status, lead, dates, your role, last update. The whole row opens the engagement.
 */
export function ProjectList({ projects, groupSlug, orgSlug, clientSlug, clientStatus, isRefreshing = false, memberSummaries, hrefFor }: ProjectListProps) {
    const router = useRouter()

    if (projects.length === 0 && !isRefreshing) {
        return (
            <EmptyPanel
                icon={<Briefcase />}
                title="No engagements yet"
                description={
                    clientStatus === 'PROSPECT'
                        ? 'This client is still a prospect. Engagements you add show up here.'
                        : 'Engagements for this client show up here.'
                }
            />
        )
    }

    return (
        <NotionTable>
            <NotionTableHeader>
                <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                <NotionTableHead icon={<CircleDot />}>Status</NotionTableHead>
                <NotionTableHead icon={<UserRound />} className="hidden md:table-cell">Lead</NotionTableHead>
                <NotionTableHead icon={<CalendarDays />} className="hidden lg:table-cell">Start</NotionTableHead>
                <NotionTableHead icon={<Flag />}>Due</NotionTableHead>
                <NotionTableHead icon={<Shield />} className="hidden lg:table-cell">Your role</NotionTableHead>
                <NotionTableHead icon={<Clock3 />} className="hidden md:table-cell">Updated</NotionTableHead>
            </NotionTableHeader>
            <NotionTableBody>
                {isRefreshing && (
                    <tr className="h-9 border-b border-line" aria-hidden>
                        <td className="px-2 first:pl-1" colSpan={7}>
                            <span className="flex items-center gap-2">
                                <ShimmerBlock />
                                <ShimmerBar className="w-48" />
                            </span>
                        </td>
                    </tr>
                )}
                {projects.map((project) => {
                    const href = hrefFor ? hrefFor(project) : engagementPath(groupSlug, orgSlug, clientSlug, project.slug)
                    const myRole = project.members.find((m) => m.role)?.role
                    const leads = memberSummaries?.[project.id]?.projectLeads ?? []
                    const start = day(project.kickoffDate)
                    const due = day(project.dueDate)
                    const overdue = isOverdue(project.dueDate, project.status)
                    return (
                        <NotionTableRow key={project.id} onClick={() => router.push(href)}>
                            <NotionTableCell className="max-w-0 w-[40%]">
                                <Link
                                    href={href}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex min-w-0 items-center gap-2 text-fg"
                                    title={project.description || project.name}
                                >
                                    <Briefcase className="h-4 w-4 shrink-0 text-fg-subtle" />
                                    <span className="truncate font-medium">{project.name}</span>
                                </Link>
                            </NotionTableCell>
                            <NotionTableCell>
                                <StatusPill kind="engagement" status={project.status} />
                            </NotionTableCell>
                            <NotionTableCell className="hidden md:table-cell">
                                {leads.length === 0 ? (
                                    <span className="text-fg-subtle">—</span>
                                ) : (
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <PersonAvatar person={leads[0]} size={18} />
                                        <span className="truncate text-small">{leads.length === 1 ? leads[0].name : `${leads[0].name} +${leads.length - 1}`}</span>
                                    </span>
                                )}
                            </NotionTableCell>
                            <NotionTableCell className="hidden whitespace-nowrap text-small tabular-nums text-fg-muted lg:table-cell">
                                {start ?? <span className="text-fg-subtle">—</span>}
                            </NotionTableCell>
                            <NotionTableCell className={`whitespace-nowrap text-small tabular-nums ${overdue ? 'text-danger' : 'text-fg-muted'}`}>
                                {due ?? <span className="text-fg-subtle">—</span>}
                            </NotionTableCell>
                            <NotionTableCell className="hidden lg:table-cell">
                                {myRole ? <Tag color="gray">{ROLE_LABEL[myRole] ?? 'Member'}</Tag> : <span className="text-fg-subtle">—</span>}
                            </NotionTableCell>
                            <NotionTableCell className="hidden whitespace-nowrap text-small text-fg-subtle md:table-cell">
                                <time dateTime={new Date(project.updatedAt).toISOString()} suppressHydrationWarning>
                                    {formatDistanceToNowStrict(new Date(project.updatedAt), { addSuffix: true })}
                                </time>
                            </NotionTableCell>
                        </NotionTableRow>
                    )
                })}
            </NotionTableBody>
        </NotionTable>
    )
}
