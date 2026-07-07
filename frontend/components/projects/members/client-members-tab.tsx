'use client'

import React, { useState, useEffect } from 'react'
import { getClientMembers, resendClientInvitation, revokeClientInvitation } from '@/lib/actions/client-members'
import { ClientInviteModal } from './client-invite-modal'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mail, Clock, MoreHorizontal, UserPlus, Trash2, RefreshCw } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatFullDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { logger } from '@/lib/logger'

interface ClientMembersTabProps {
    firmId: string
    clientId: string
    orgSlug: string
    clientSlug: string
    canManage?: boolean
}

function getInitials(name: string) {
    return name ? name.substring(0, 2).toUpperCase() : '??'
}

function formatDate(date: string | Date | null | undefined) {
    if (!date) return '-'
    try {
        return formatFullDate(date) || '-'
    } catch {
        return '-'
    }
}

export function ClientMembersTab({ firmId, clientId, orgSlug, clientSlug, canManage = false }: ClientMembersTabProps) {
    const [members, setMembers] = useState<any[]>([])
    const [invitations, setInvitations] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [inviteToRevokeId, setInviteToRevokeId] = useState<string | null>(null)
    const { addToast } = useToast()

    const refreshData = async () => {
        setIsLoading(true)
        try {
            const data = await getClientMembers(clientId)
            setMembers(data.members)
            setInvitations(data.invitations)
        } catch (error) {
            logger.error('Failed to fetch client members', error instanceof Error ? error : new Error(String(error)), 'ClientMembersTab', { clientId })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        refreshData()
    }, [clientId, orgSlug, clientSlug])

    const handleResendInvite = async (id: string) => {
        setActionLoading(id)
        try {
            await resendClientInvitation(id)
            addToast({ type: 'success', title: 'Invitation Sent', message: 'The invitation has been resent.' })
            refreshData()
        } catch (e) {
            addToast({ type: 'error', title: 'Failed to Send', message: 'Could not resend the invitation.' })
        } finally {
            setActionLoading(null)
        }
    }

    const executeRevokeInvite = async () => {
        if (!inviteToRevokeId) return
        const id = inviteToRevokeId
        setInviteToRevokeId(null)
        setActionLoading(id)
        try {
            await revokeClientInvitation(id)
            addToast({ type: 'success', title: 'Invitation Cancelled', message: 'The invitation has been revoked.' })
            refreshData()
        } catch (e) {
            addToast({ type: 'error', title: 'Error', message: 'Failed to revoke invitation.' })
        } finally {
            setActionLoading(null)
        }
    }

    return (
        <div className="flex flex-col h-full bg-white rounded border border-[#e5e7eb] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#f3f4f6] text-[#45474c]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            Client Members
                            {!isLoading && (members.length > 0 || invitations.length > 0) && (
                                <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                    {members.length + invitations.length}
                                </span>
                            )}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Client administrators can manage client settings and members.</p>
                    </div>
                </div>
                {canManage && (
                    <Button
                        onClick={() => setIsInviteModalOpen(true)}
                        variant="ghost"
                        size="sm"
                        className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
                    >
                        <UserPlus className="h-4 w-4" />
                        Invite
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-4">
                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded border border-[#e5e7eb] bg-white p-4 animate-pulse flex items-center gap-3">
                                <div className="h-9 w-9 rounded bg-slate-200" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-32 rounded bg-slate-200" />
                                    <div className="h-3 w-48 rounded bg-slate-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
                        <div className="divide-y divide-[#e5e7eb]">
                            {[...members].sort((a, b) => {
                                const aIsPartner = a.persona?.slug === 'client_admin' ? -1 : 1
                                const bIsPartner = b.persona?.slug === 'client_admin' ? -1 : 1
                                return aIsPartner - bIsPartner
                            }).map((member) => (
                                <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f3f4f6] transition-colors">
                                    <Avatar className="h-8 w-8 shrink-0 border border-[#e5e7eb]">
                                        <AvatarImage src={member.user?.avatarUrl} />
                                        <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
                                            {getInitials(member.user?.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-900 truncate">{member.user?.name}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{member.user?.email}</p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                                        member.persona?.slug === 'client_admin'
                                            ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                                            : 'bg-[#f3f4f6] text-[#45474c] ring-1 ring-inset ring-[#e5e7eb]'
                                    }`}>
                                        {member.persona?.slug === 'client_admin' ? 'Client Partner' : 'Firm Member'}
                                    </span>
                                </div>
                            ))}
                            {invitations.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f3f4f6] transition-colors">
                                    <div className="h-8 w-8 shrink-0 rounded bg-[#f3f4f6] flex items-center justify-center">
                                        <Mail className="h-4 w-4 text-slate-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-900 truncate">{inv.email}</p>
                                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Pending
                                        </p>
                                    </div>
                                    {canManage && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 shrink-0">
                                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-[140px]">
                                                <DropdownMenuItem
                                                    onClick={() => handleResendInvite(inv.id)}
                                                    disabled={actionLoading === inv.id}
                                                >
                                                    <RefreshCw className="h-4 w-4 mr-2" />
                                                    Resend
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-red-600 focus:text-red-600"
                                                    onClick={() => setInviteToRevokeId(inv.id)}
                                                    disabled={actionLoading === inv.id}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Cancel invite
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            ))}
                        </div>
                        {members.length === 0 && invitations.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                No members yet. {canManage && 'Use Invite to add a Client Administrator.'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ClientInviteModal
                firmId={firmId}
                clientId={clientId}
                open={isInviteModalOpen}
                onOpenChange={setIsInviteModalOpen}
                onSuccess={refreshData}
            />

            <ConfirmDialog
                open={inviteToRevokeId !== null}
                onOpenChange={(open) => !open && setInviteToRevokeId(null)}
                icon={<Mail className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Cancel invitation"
                subtitle="The invitation will be revoked."
                description="This invitation will be revoked. You can send a new invite later if needed."
                cancelLabel="Keep invitation"
                confirmLabel="Cancel invitation"
                confirmVariant="red"
                onCancel={() => setInviteToRevokeId(null)}
                onConfirm={() => void executeRevokeInvite()}
            />
        </div>
    )
}
