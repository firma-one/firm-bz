'use client'

import React from 'react'
import { Briefcase, Clock, Cog, Copy, Check } from 'lucide-react'
import { HierarchyClient } from '@/lib/actions/hierarchy'
import { type ProjectMemberSummary } from '@/lib/actions/members'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
    ProfileBubbleWithPopup,
    type ProfileBubblePopupUser,
} from '@/components/ui/profile-bubble-popup'

interface ProjectListProps {
    projects: HierarchyClient['engagements']
    orgSlug: string
    clientSlug: string
    clientStatus?: string | null
    viewMode?: 'grid' | 'list'
    isOrgInternal?: boolean
    memberSummaries?: Record<string, ProjectMemberSummary>
    isRefreshing?: boolean
}

function engagementStatusLabel(status: string | null | undefined): string {
    switch (status) {
        case 'PLANNED':
            return 'Planned'
        case 'ACTIVE':
            return 'Active'
        case 'COMPLETED':
            return 'Completed'
        case 'PAUSED':
            return 'Paused'
        default:
            return 'Active'
    }
}

function engagementStatusBadgeClass(status: string | null | undefined): string {
    switch (status) {
        case 'PLANNED':
            return 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60'
        case 'ACTIVE':
            return 'bg-primary/10 text-primary ring-1 ring-primary/25'
        case 'COMPLETED':
            return 'bg-[#f3f4f6] text-[#45474c] ring-1 ring-[#e5e7eb]'
        case 'PAUSED':
            return 'bg-fuchsia-50 text-fuchsia-500 ring-1 ring-fuchsia-200'
        default:
            return 'bg-primary/10 text-primary ring-1 ring-primary/25'
    }
}

function MemberBubbleStack({
    users,
    onClickLink,
    size = 'default',
}: {
    users: ProfileBubblePopupUser[]
    onClickLink: (e: React.MouseEvent) => void
    size?: 'default' | 'lg'
}) {
    const sizeClass = size === 'lg' ? 'w-10 h-10 text-xs' : 'w-6 h-6 text-[10px]'
    if (users.length === 0) return null
    return (
        <div className="flex -space-x-1.5" onClick={onClickLink}>
            {users.slice(0, 4).map((u, i) => (
                <div key={i} onClick={(e) => e.preventDefault()}>
                    <ProfileBubbleWithPopup
                        name={u.name}
                        email={u.email}
                        avatarUrl={u.avatarUrl}
                        personaName={u.personaName}
                        size={size}
                    />
                </div>
            ))}
            {users.length > 4 && (
                <div className={`rounded border border-[#e5e7eb] bg-white ${sizeClass} flex items-center justify-center font-medium text-slate-600 shrink-0 p-0.5`}>
                    +{users.length - 4}
                </div>
            )}
        </div>
    )
}

function LeadAvatar({ user }: { user: ProfileBubblePopupUser }) {
    const [copied, setCopied] = React.useState(false)
    const initials = user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.writeText(user.email)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <div className="h-5 w-5 rounded border border-[#e5e7eb] bg-[#f3f4f6] flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-slate-600 cursor-default text-[9px]">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                        initials
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-white border border-slate-200 text-slate-700 text-xs p-3 shadow-lg max-w-[320px]">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded border border-[#e5e7eb] bg-[#f3f4f6] flex items-center justify-center font-bold text-slate-600 flex-shrink-0 overflow-hidden">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                initials
                            )}
                        </div>
                        <span className="font-medium text-slate-900">{user.name}</span>
                    </div>
                    {user.email && (
                        <div className="flex items-center gap-2">
                            <span className="truncate max-w-[240px] text-slate-600">{user.email}</span>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                                title="Copy email"
                            >
                                {copied ? (
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </button>
                        </div>
                    )}
                    {user.personaName && (
                        <div className="flex items-center gap-2">
                            <span className="inline-block px-2 py-1 rounded bg-[#f3f4f6] text-[#45474c] text-[11px] font-medium">
                                {user.personaName}
                            </span>
                        </div>
                    )}
                </div>
            </TooltipContent>
        </Tooltip>
    )
}

export function ProjectList({ projects, orgSlug, clientSlug, clientStatus, viewMode = 'grid', isOrgInternal, memberSummaries = {}, isRefreshing = false }: ProjectListProps) {
    const router = useRouter()
    const isProspect = clientStatus === 'PROSPECT'
    if (projects.length === 0 && !isRefreshing) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded bg-slate-50/50">
                <div className="h-12 w-12 bg-[#f3f4f6] rounded flex items-center justify-center mb-4 text-[#45474c]">
                    <Briefcase className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No projects found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                    This client workspace doesn't have any active projects yet.
                </p>
                {/* TODO: Add 'Create Engagement' button here if user has permission */}
            </div>
        )
    }

    const showBubbles = isOrgInternal && Object.keys(memberSummaries).length > 0

    if (viewMode === 'list') {
        return (
            <TooltipProvider>
                <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-white border-b border-[#e5e7eb]">
                                <th className="px-4 py-3 font-medium text-slate-500">Project</th>
                                <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                                <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                                <th className="px-4 py-3 font-medium text-slate-500">Collaborators</th>
                                <th className="px-4 py-3 font-medium text-slate-500 text-right">Last Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e7eb]">
                            {isRefreshing && (
                                <tr className="animate-pulse">
                                    <td className="px-4 py-3"><div className="h-4 w-40 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-100 rounded-sm" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-32 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-100 rounded ml-auto" /></td>
                                </tr>
                            )}
                            {projects.map((project) => {
                                const summary = showBubbles ? memberSummaries[project.id] : null
                                const hasLeads = summary && summary.projectLeads.length > 0
                                const hasTeam = summary && summary.teamMembers.length > 0
                                const hasExternal = summary && summary.external.length > 0
                                const hasAny = hasLeads || hasTeam || hasExternal
                                return (
                                    <tr key={project.id} className="group hover:bg-[#f3f4f6] transition-colors">
                                        <td className="px-4 py-3">
                                            <Link href={`/d/f/${orgSlug}/c/${clientSlug}/e/${project.slug}/${isOrgInternal ? 'analytics' : 'files'}`} className="flex items-center gap-3">
                                                <div className="h-8 w-8 bg-[#f3f4f6] text-[#45474c] rounded flex items-center justify-center">
                                                    <Briefcase className="h-4 w-4" />
                                                </div>
                                                <span className="font-medium text-slate-900 group-hover:text-black transition-colors">{project.name}</span>
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`px-2 py-1 rounded-sm text-xs font-medium ${engagementStatusBadgeClass(project.status)}`}>
                                                    {engagementStatusLabel(project.status)}
                                                </span>
                                                {isProspect && (
                                                    <span className="px-2 py-1 rounded-sm text-xs font-medium bg-fuchsia-50 text-fuchsia-500 ring-1 ring-fuchsia-200">
                                                        Prospect
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                                            {project.description || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {showBubbles ? (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-slate-500">
                                                    {hasLeads && (
                                                        <div className="flex items-center gap-1.5">
                                                            <MemberBubbleStack
                                                                users={summary!.projectLeads}
                                                                onClickLink={(e) => e.preventDefault()}
                                                                size="default"
                                                            />
                                                        </div>
                                                    )}
                                                    {hasLeads && (hasTeam || hasExternal) && (
                                                        <span className="text-slate-300 font-light" aria-hidden>|</span>
                                                    )}
                                                    {hasTeam && (
                                                        <div className="flex items-center gap-1.5">
                                                            <MemberBubbleStack
                                                                users={summary!.teamMembers}
                                                                onClickLink={(e) => e.preventDefault()}
                                                                size="default"
                                                            />
                                                        </div>
                                                    )}
                                                    {hasTeam && hasExternal && (
                                                        <span className="text-slate-300 font-light" aria-hidden>|</span>
                                                    )}
                                                    {hasExternal && (
                                                        <div className="flex items-center gap-1.5">
                                                            <MemberBubbleStack
                                                                users={summary!.external}
                                                                onClickLink={(e) => e.preventDefault()}
                                                                size="default"
                                                            />
                                                        </div>
                                                    )}
                                                    {!hasAny && <span className="text-slate-400">—</span>}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-400">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Clock className="h-3 w-3" />
                                                <span>{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </TooltipProvider>
        )
    }

    return (
        <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isRefreshing && (
                    <div className="relative bg-white border border-[#e5e7eb] rounded p-5 flex flex-col h-48 animate-pulse">
                        <div className="flex items-start justify-between mb-3">
                            <div className="h-10 w-10 bg-slate-100 rounded" />
                            <div className="h-5 w-14 bg-slate-100 rounded-sm" />
                        </div>
                        <div className="h-4 w-3/4 bg-slate-100 rounded mb-2" />
                        <div className="h-3 w-full bg-slate-100 rounded mb-1" />
                        <div className="h-3 w-2/3 bg-slate-100 rounded mb-auto" />
                        <div className="mt-auto pt-3 border-t border-[#e5e7eb]">
                            <div className="h-3 w-24 bg-slate-100 rounded" />
                        </div>
                    </div>
                )}
                {projects.map((project) => {
                    const summary = showBubbles ? memberSummaries[project.id] : null
                    const hasLeads = summary && summary.projectLeads.length > 0
                    const hasTeam = summary && summary.teamMembers.length > 0
                    const hasExternal = summary && summary.external.length > 0
                    return (
                        <Link
                            key={project.id}
                            href={`/d/f/${orgSlug}/c/${clientSlug}/e/${project.slug}/${isOrgInternal ? 'analytics' : 'files'}`}
                            className={`group relative bg-white rounded p-5 hover:shadow-lg transition-all duration-200 flex flex-col h-48 ${isProspect ? 'border border-dashed border-amber-300 hover:border-amber-400' : 'border border-[#e5e7eb] hover:border-primary/50'}`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="h-10 w-10 bg-[#f3f4f6] text-[#45474c] rounded flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0">
                                    <Briefcase className="h-5 w-5" />
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {showBubbles && hasLeads && (
                                        <div className="flex gap-1">
                                            {summary!.projectLeads.slice(0, 2).map((lead, idx) => (
                                                <LeadAvatar key={idx} user={lead} />
                                            ))}
                                        </div>
                                    )}
                                    {isProspect && (
                                        <span className="shrink-0 px-2 py-0.5 rounded-sm text-xs font-medium bg-fuchsia-50 text-fuchsia-500 ring-1 ring-fuchsia-200">
                                            Prospect
                                        </span>
                                    )}
                                    <span className={`shrink-0 px-2 py-0.5 rounded-sm text-xs font-medium ${engagementStatusBadgeClass(project.status)}`}>
                                        {engagementStatusLabel(project.status)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/d/f/${orgSlug}/c/${clientSlug}/e/${project.slug}/settings`) }}
                                        className="px-2 py-0.5 rounded-sm bg-[#f3f4f6] text-[#1b1b1d] ring-1 ring-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors"
                                        title="Engagement settings"
                                    >
                                        <Cog className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-sm font-semibold text-slate-900 mb-1 line-clamp-1 group-hover:text-black transition-colors">
                                {project.name}
                            </h3>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-auto">
                                {project.description || "No description provided."}
                            </p>

                            {showBubbles && (hasTeam || hasExternal) && (
                                <div className="flex items-center justify-between gap-2 mb-2 min-h-[24px]">
                                    {hasExternal ? (
                                        <MemberBubbleStack
                                            users={summary!.external}
                                            onClickLink={(e) => e.preventDefault()}
                                        />
                                    ) : (
                                        <span />
                                    )}
                                    {hasTeam ? (
                                        <MemberBubbleStack
                                            users={summary!.teamMembers}
                                            onClickLink={(e) => e.preventDefault()}
                                        />
                                    ) : (
                                        <span />
                                    )}
                                </div>
                            )}
                            <div className="mt-auto pt-3 border-t border-[#e5e7eb] flex items-center justify-between text-[11px] text-slate-400">
                                <div className="flex items-center gap-1.5" title="Last updated">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </TooltipProvider>
    )
}
