'use client'

import { useState, useEffect } from 'react'
import { getFirmMembers, resendFirmInvitation, revokeFirmInvitation, removeFirmMember } from '@/lib/actions/firm-members'
import { FirmInviteModal } from './firm-invite-modal'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mail, Clock, MoreHorizontal, SquarePlus, Trash2, RefreshCw, UserMinus, AlertTriangle } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
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


export function FirmMembersTab({ firmId, orgSlug, canManage = false }: FirmMembersTabProps) {
    const [members, setMembers] = useState<any[]>([])
    const [invitations, setInvitations] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [inviteToRevokeId, setInviteToRevokeId] = useState<string | null>(null)
    const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string; email: string; ownsConnector: boolean } | null>(null)
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

    const executeRemoveMember = async () => {
        if (!memberToRemove) return
        const { id } = memberToRemove
        setMemberToRemove(null)
        setActionLoading(id)
        try {
            await removeFirmMember(firmId, id)
            addToast({ type: 'success', title: 'Member Removed', message: 'The firm member has been removed.' })
            refreshData()
        } catch (e) {
            addToast({ type: 'error', title: 'Error', message: 'Failed to remove member.' })
        } finally {
            setActionLoading(null)
        }
    }

    const adminCount = members.filter(m => m.role === 'firm_admin').length

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
                            Firm Members
                            {!isLoading && (members.length > 0 || invitations.length > 0) && (
                                <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                    {members.length + invitations.length}
                                </span>
                            )}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Firm administrators can manage settings and members.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={refreshData}
                        disabled={isLoading}
                        className="h-7 w-7 text-slate-400 hover:text-slate-600"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    {canManage && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsInviteModalOpen(true)}
                            className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
                        >
                            <SquarePlus className="h-4 w-4" />
                            Invite
                        </Button>
                    )}
                </div>
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
                            {members.map((member) => {
                                const roleLabel = member.role === 'firm_admin' ? 'Firm Administrator' : 'Firm Member'
                                const roleBadgeClass = member.role === 'firm_admin'
                                    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                                    : 'bg-[#f3f4f6] text-[#45474c] ring-1 ring-inset ring-[#e5e7eb]'
                                return (
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
                                        <div className="w-36 flex justify-end shrink-0">
                                            <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium ${roleBadgeClass}`}>
                                                {roleLabel}
                                            </span>
                                        </div>
                                        <div className="w-24 flex justify-end shrink-0">
                                            {member.createdAt && <RelativeDateTime date={member.createdAt} textClassName="text-[11px] text-slate-400" iconClassName="h-3 w-3 text-slate-400" tooltipSide="left" />}
                                        </div>
                                        {canManage && member.role === 'firm_admin' && adminCount > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-rose-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
                                                disabled={actionLoading === member.id}
                                                onClick={() => setMemberToRemove({ id: member.id, name: member.user?.name ?? member.user?.email ?? 'this member', email: member.user?.email ?? '', ownsConnector: !!member.ownsConnector })}
                                            >
                                                <UserMinus className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        {canManage && (member.role !== 'firm_admin' || adminCount <= 1) && (
                                            <div className="w-7 shrink-0" />
                                        )}
                                    </div>
                                )
                            })}
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
                                    <div className="w-36 flex justify-end shrink-0">
                                        <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
                                            Firm Administrator
                                        </span>
                                    </div>
                                    <div className="w-24 flex justify-end shrink-0">
                                        {inv.createdAt && <RelativeDateTime date={inv.createdAt} textClassName="text-[11px] text-slate-400" iconClassName="h-3 w-3 text-slate-400" tooltipSide="left" />}
                                    </div>
                                    <div className="w-7 flex justify-end shrink-0">
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

            {/* Connector-owner warning — removal blocked */}
            <ConfirmDialog
                open={memberToRemove !== null && memberToRemove.ownsConnector}
                onOpenChange={(open) => !open && setMemberToRemove(null)}
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                iconVariant="amber"
                title="Cannot remove this member"
                subtitle="This administrator owns the Drive Connector."
                description={
                    <span>
                        <strong>{memberToRemove?.name}</strong>{memberToRemove?.email ? ` (${memberToRemove.email})` : ''} is the owner of this firm's Storage Drive Connector. Removing them would disconnect document storage for all clients and engagements.
                        <br /><br />
                        To remove this member, first transfer the Storage Connector to another Firm Administrator in <a href={`/d/f/${orgSlug}?tab=settings&section=storage`} className="text-primary underline underline-offset-2">Firm Settings → Data Storage</a> — then come back and remove them.
                    </span>
                }
                extra={
                    <p className="text-[12px] text-slate-500 mt-1">
                        Not sure how? <a href="/support" className="text-primary underline underline-offset-2">Contact Support</a> and we'll help you through it.
                    </p>
                }
                cancelLabel="Got it"
                hideConfirm
                onCancel={() => setMemberToRemove(null)}
                onConfirm={() => setMemberToRemove(null)}
            />

            {/* Normal removal confirmation */}
            <ConfirmDialog
                open={memberToRemove !== null && !memberToRemove?.ownsConnector}
                onOpenChange={(open) => !open && setMemberToRemove(null)}
                icon={<UserMinus className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Revoke Firm Administrator"
                subtitle={`${memberToRemove?.name}'s admin role will be revoked.`}
                description={
                    <span>
                        <strong>{memberToRemove?.name}</strong>{memberToRemove?.email ? ` (${memberToRemove.email})` : ''} will lose their Firm Administrator role and can no longer manage this firm, its clients, or engagements. Any existing engagement-level access remains unchanged.
                    </span>
                }
                cancelLabel="Cancel"
                confirmLabel="Confirm"
                confirmVariant="red"
                onCancel={() => setMemberToRemove(null)}
                onConfirm={() => void executeRemoveMember()}
                loading={actionLoading !== null}
            />
        </div>
    )
}
