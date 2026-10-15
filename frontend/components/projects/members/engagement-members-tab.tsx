'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Folder, UserPlus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyPanel } from '@/components/ui/empty-panel'
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

    const total = members.length + invitations.length

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* Toolbar: count and refresh on the left, the one primary action on the right. */}
            <div className="flex h-10 shrink-0 items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-small text-fg-muted">
                    <span className="tabular-nums">{isLoading ? 'Loading…' : `${total} ${total === 1 ? 'person' : 'people'}`}</span>
                    <button
                        type="button"
                        onClick={refreshData}
                        disabled={isLoading}
                        title="Refresh members"
                        aria-label="Refresh members"
                        className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted disabled:opacity-40"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                {canManage && clientConnectorId && (
                    <Button size="sm" onClick={() => setIsInviteModalOpen(true)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Invite
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col" aria-hidden>
                        <div className="h-8 border-b border-line" />
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex h-9 items-center gap-2 border-b border-line px-1">
                                <div className="h-5 w-5 animate-pulse rounded-full bg-surface-muted" />
                                <div className="h-3 w-40 animate-pulse rounded bg-surface-muted" />
                                <div className="ml-auto h-3 w-20 animate-pulse rounded bg-surface-muted" />
                            </div>
                        ))}
                    </div>
                ) : !clientConnectorId ? (
                    <EmptyPanel
                        icon={<Folder />}
                        title="Drive not connected"
                        description={canManage
                            ? 'This client isn\'t linked to a Drive connector yet. Link it under Firm settings → Document storage before inviting members.'
                            : 'This client isn\'t linked to a Drive connector yet. Ask your firm administrator to set up Document storage.'}
                        action={canManage && orgSlug ? (
                            <a href={firmSettingsPath(groupSlug, orgSlug, 'storage')} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                                Go to Document storage
                            </a>
                        ) : undefined}
                    />
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
