'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Folder } from 'lucide-react'
import { getProjectMembers } from '@/lib/actions/members'
import { getProjectPersonas } from '@/lib/actions/personas'
import { MemberList } from './member-list'
import { InviteMemberModal } from './invite-member-modal'
import { logger } from '@/lib/logger'
import { PersonaUiRole } from '@/lib/persona-ui-groups'
import { firmSettingsPath } from '@/lib/navigation/firm-paths'

interface EngagementMembersTabProps {
    projectId: string
    groupSlug: string
    orgSlug: string
    canManage?: boolean
    clientConnectorId?: string | null
}

export function EngagementMembersTab({ projectId, groupSlug, orgSlug, canManage = false, clientConnectorId }: EngagementMembersTabProps) {
    const [members, setMembers] = useState<any[]>([])
    const [invitations, setInvitations] = useState<any[]>([])
    const [personas, setPersonas] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [preselectedUiRole, setPreselectedUiRole] = useState<PersonaUiRole | null>(null)

    const refreshData = async () => {
        setIsLoading(true)
        try {
            const [membersData, personasData] = await Promise.all([
                getProjectMembers(projectId),
                getProjectPersonas()
            ])
            setMembers(membersData.members)
            setInvitations(membersData.invitations)
            setPersonas(personasData)
        } catch (error) {
            logger.error("Failed to fetch members data", error instanceof Error ? error : new Error(String(error)), 'ProjectMembers', { projectId })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        refreshData()
    }, [projectId, orgSlug])

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#f3f4f6] text-[#45474c]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            Engagement Members
                            {!isLoading && (members.length > 0 || invitations.length > 0) && (
                                <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                    {members.length + invitations.length}
                                </span>
                            )}
                            <button
                                onClick={refreshData}
                                disabled={isLoading}
                                title="Refresh members"
                                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Manage access and roles for this project.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded border border-[#e5e7eb] bg-white p-4 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded bg-slate-200" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-20 rounded bg-slate-200" />
                                        <div className="h-3 w-24 rounded bg-slate-100" />
                                    </div>
                                </div>
                                <div className="mt-4 space-y-2">
                                    <div className="h-3 w-full rounded bg-slate-100" />
                                    <div className="h-3 w-full rounded bg-slate-100" />
                                    <div className="h-3 w-3/4 rounded bg-slate-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !clientConnectorId ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <Folder className="h-8 w-8 text-slate-300" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900 mb-1">Drive not connected</h3>
                        <p className="text-sm text-slate-500 max-w-[280px] mx-auto mb-3">
                            {canManage
                                ? 'This client is not linked to a Drive connector. Go to Firm Settings → Document Storage to link this client before inviting members.'
                                : 'This client is not linked to a Drive connector. Contact your firm administrator to set up Document Storage.'}
                        </p>
                        {canManage && orgSlug && (
                            <a
                                href={firmSettingsPath(groupSlug, orgSlug, 'storage')}
                                className="inline-flex items-center gap-1.5 h-8 px-4 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all"
                            >
                                Go to Document Storage
                            </a>
                        )}
                    </div>
                ) : (
                    <MemberList
                        members={members}
                        invitations={invitations}
                        personas={personas}
                        onRefresh={refreshData}
                        canManage={canManage}
                        onInviteWithRole={(uiRole) => {
                            setPreselectedUiRole(uiRole)
                            setIsInviteModalOpen(true)
                        }}
                    />
                )}
            </div>

            <InviteMemberModal
                projectId={projectId}
                open={isInviteModalOpen}
                onOpenChange={(open) => {
                    setIsInviteModalOpen(open)
                    if (!open) {
                        setPreselectedUiRole(null)
                    }
                }}
                personas={personas}
                preselectedUiRole={preselectedUiRole}
                onSuccess={refreshData}
            />
        </div>
    )
}
