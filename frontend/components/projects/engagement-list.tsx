'use client'

import React from 'react'
import { Briefcase, CalendarClock, AlertTriangle } from 'lucide-react'
import { HierarchyClient } from '@/lib/actions/hierarchy'
import Link from 'next/link'

import { TooltipProvider } from '@/components/ui/tooltip'
import { formatFullDate } from '@/lib/utils'
import { engagementPath } from '@/lib/navigation/firm-paths'

interface ProjectListProps {
    projects: HierarchyClient['engagements']
    groupSlug: string
    orgSlug: string
    clientSlug: string
    clientStatus?: string | null
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

/** Current user's role for this engagement — eng_admin | eng_member |
 * eng_ext_collaborator | eng_viewer (EngagementMember.role), split into a role-category
 * label for the main pill and an optional access-level qualifier (Contributor roles only). */
function engagementRoleParts(role: string | undefined): { label: string; qualifier: string | null } {
    switch (role) {
        case 'eng_admin':
            return { label: 'Engagement Owner', qualifier: null }
        case 'eng_member':
            return { label: 'Contributor', qualifier: 'Full Access' }
        case 'eng_ext_collaborator':
            return { label: 'Contributor', qualifier: 'Limited Access' }
        case 'eng_viewer':
            return { label: 'Engagement Reviewer', qualifier: null }
        default:
            return { label: 'Engagement Member', qualifier: null }
    }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#9a9ba0]">{children}</p>
}

function DateField({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="min-w-0">
            <FieldLabel>{label}</FieldLabel>
            {value ? (
                <p className="text-xs font-medium text-[#1b1b1d] truncate">{formatFullDate(value)}</p>
            ) : (
                <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> Not Set
                </p>
            )}
        </div>
    )
}

function StatusField({ status }: { status: string | null | undefined }) {
    return (
        <div className="min-w-0">
            <FieldLabel>Status</FieldLabel>
            <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded-sm text-[11px] font-medium ${engagementStatusBadgeClass(status)}`}>
                {engagementStatusLabel(status)}
            </span>
        </div>
    )
}

export function ProjectList({ projects, groupSlug, orgSlug, clientSlug, clientStatus, isRefreshing = false }: ProjectListProps) {

    const isProspect = clientStatus === 'PROSPECT'
    if (projects.length === 0 && !isRefreshing) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded bg-slate-50/50">
                <div className="h-12 w-12 bg-[#f3f4f6] rounded flex items-center justify-center mb-4 text-[#45474c]">
                    <Briefcase className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No engagements found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                    This client workspace doesn't have any active engagements yet.
                </p>
                {/* TODO: Add 'Create Engagement' button here if user has permission */}
            </div>
        )
    }

    return (
        <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isRefreshing && (
                    <div className="relative bg-white border border-[#e5e7eb] rounded p-5 flex flex-col h-56 animate-pulse">
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
                    const myRole = project.members.find((m) => m.role)?.role
                    return (
                        <Link
                            key={project.id}
                            href={engagementPath(groupSlug, orgSlug, clientSlug, project.slug)}
                            className={`group relative bg-white rounded p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col h-56 ${isProspect ? 'border border-dashed border-amber-300 hover:border-amber-400' : 'border border-[#e5e7eb] hover:border-primary/50'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 bg-[#f3f4f6] text-[#45474c] rounded flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0">
                                    <Briefcase className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-black transition-colors">
                                        {project.name}
                                    </h3>
                                    <p className="text-xs text-slate-500 line-clamp-2">
                                        {project.description || "No description provided."}
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 flex items-center border-t border-[#e5e7eb]">
                                <div className="grid grid-cols-3 gap-3 w-full">
                                    <DateField label="Kickoff Date" value={project.kickoffDate} />
                                    <DateField label="Due Date" value={project.dueDate} />
                                    <StatusField status={project.status} />
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[#e5e7eb]">
                                {(() => {
                                    const { label, qualifier } = engagementRoleParts(myRole)
                                    return (
                                        <p className="text-[11px] text-[#45474c]/70 leading-snug flex items-center flex-wrap gap-1">
                                            You are an
                                            <span className="inline-flex items-center font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm text-primary bg-primary/10">
                                                {label}
                                            </span>
                                            {qualifier && (
                                                <span className="inline-flex items-center font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm text-[#45474c] bg-[#f3f4f6]">
                                                    {qualifier}
                                                </span>
                                            )}
                                        </p>
                                    )
                                })()}
                            </div>
                        </Link>
                    )
                })}
            </div>
        </TooltipProvider>
    )
}
