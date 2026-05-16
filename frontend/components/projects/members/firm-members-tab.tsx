'use client'

import { useState, useEffect } from 'react'
import { getFirmMembers, resendFirmInvitation, revokeFirmInvitation } from '@/lib/actions/firm-members'
import { FirmInviteModal } from './firm-invite-modal'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mail, Clock, MoreHorizontal, SquarePlus, Trash2, RefreshCw } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatFullDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { logger } from '@/lib/logger'

interface FirmMembersTabProps {
    firmId: string
    orgSlug: string
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

export function FirmMembersTab({ firmId, orgSlug, canManage = false }: FirmMembersTabProps) {
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
            const data = await getFirmMembers(firmId)
            setMembers([...data.members].sort((a, b) => {
                if (a.role === b.role) return 0
                return a.role === 'firm_admin' ? -1 : 1
            }))
            setInvitations(data.invitations)
        } catch (error) {
            logger.error('Failed to fetch firm members', error instanceof Error ? error : new Error(String(error)), 'FirmMembersTab', { firmId })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        refreshData()
    }, [firmId, orgSlug])

    const handleResendInvite = async (id: string) => {
        setActionLoading(id)
        try {
            await resendFirmInvitation(id)
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
            await revokeFirmInvitation(id)
            addToast({ type: 'success', title: 'Invitation Cancelled', message: 'The invitation has been revoked.' })
            refreshData()
        } catch (e) {
            addToast({ type: 'error', title: 'Error', message: 'Failed to revoke invitation.' })
        } finally {
            setActionLoading(null)
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            Firm Members
                            {!isLoading && (members.length > 0 || invitations.length > 0) && (
                                <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                    {members.length + invitations.length}
                                </span>
                            )}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Firm administrators can manage settings and members.</p>
                    </div>
                </div>
                {canManage && (
                    <Button
                        variant="blackCta"
                        onClick={() => setIsInviteModalOpen(true)}
                        className="gap-2"
                    >
                        <SquarePlus className="h-4 w-4" />
                        Invite
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-200" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-32 rounded bg-slate-200" />
                                    <div className="h-3 w-48 rounded bg-slate-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-200/80 bg-white overflow-hidden">
                        <div className="divide-y divide-slate-100">
                            {members.map((member) => {
                                const roleLabel = member.role === 'firm_admin' ? 'Firm Administrator' : 'Firm Member'
                                const roleBadgeClass = member.role === 'firm_admin'
                                    ? 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
                                return (
                                    <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80">
                                        <Avatar className="h-8 w-8 shrink-0 border border-slate-200/80">
                                            <AvatarImage src={member.user?.avatarUrl} />
                                            <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
                                                {getInitials(member.user?.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-slate-900 truncate">{member.user?.name}</p>
                                            <p className="text-[11px] text-slate-500 truncate">{member.user?.email}</p>
                                        </div>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${roleBadgeClass}`}>
                                            {roleLabel}
                                        </span>
                                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                    </div>
                                )
                            })}
                            {invitations.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80">
                                    <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center">
                                        <Mail className="h-4 w-4 text-slate-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-900 truncate">{inv.email}</p>
                                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Pending
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200">
                                        Firm Administrator
                                    </span>
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
                                No members yet. {canManage && 'Use Invite to add a Firm Administrator.'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <FirmInviteModal
                firmId={firmId}
                open={isInviteModalOpen}
                onOpenChange={setIsInviteModalOpen}
                onSuccess={refreshData}
            />

            <Dialog open={inviteToRevokeId !== null} onOpenChange={(open) => !open && setInviteToRevokeId(null)}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Cancel invitation?</DialogTitle>
                        <DialogDescription className="text-slate-600">
                            This invitation will be revoked. You can send a new invite later if needed.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => setInviteToRevokeId(null)}>
                            Keep invitation
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void executeRevokeInvite()}>
                            Cancel invitation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
