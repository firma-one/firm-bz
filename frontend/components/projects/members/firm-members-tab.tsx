'use client'

import { useState, useEffect } from 'react'
import { getFirmMembers, resendFirmInvitation, revokeFirmInvitation, removeFirmMember } from '@/lib/actions/firm-members'
import { FirmInviteModal } from './firm-invite-modal'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AtSign, Clock3, Mail, Plus, RefreshCw, Shield, Trash2, Type, UserMinus, Users, AlertTriangle } from 'lucide-react'
import {
    NotionTable,
    NotionTableActions,
    NotionTableActionsHead,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { PageHeading } from '@/components/ui/page-heading'
import { AccessLock } from '@/components/ui/access-lock'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { Tag } from '@/components/ui/tag'
import { StatusPill } from '@/components/ui/status-pill'
import { FRESH_CHIP_CLASS, useApprovalFeedback } from '@/lib/ui/use-approval-feedback'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { useToast } from '@/components/ui/toast'
import { Hint } from '@/components/ui/tooltip'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { logger } from '@/lib/logger'
import { firmSettingsPath } from '@/lib/navigation/firm-paths'
import { initialsOf } from '@/lib/initials'

interface FirmMembersTabProps {
    firmId: string
    groupSlug: string
    orgSlug: string
    canManage?: boolean
}

function getInitials(name: string) {
    return initialsOf(name)
}


export function FirmMembersTab({ firmId, groupSlug, orgSlug, canManage = false }: FirmMembersTabProps) {
    const [members, setMembers] = useState<any[]>([])
    const [invitations, setInvitations] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [inviteToRevokeId, setInviteToRevokeId] = useState<string | null>(null)
    const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string; email: string; ownsConnector: boolean } | null>(null)
    const { addToast } = useToast()
    const resendFeedback = useApprovalFeedback()

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

    const handleResendInvite = async (id: string, email: string) => {
        setActionLoading(id)
        try {
            await resendFirmInvitation(id)
            resendFeedback.confirm({ id, name: email, title: 'Invitation resent' })
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
    const total = members.length + invitations.length

    return (
        <div className="flex flex-col">
            <PageHeading
                className="pb-4"
                icon={<Users />}
                title={
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">Members</span>
                        {!isLoading && total > 0 && <span className="text-h3 font-normal tabular-nums text-fg-subtle">{total}</span>}
                        <AccessLock label="Firm admins only — hidden from other members" className="[&_svg]:h-3.5 [&_svg]:w-3.5" />
                    </span>
                }
                description="Firm administrators manage the firm's settings, members and every client."
                actions={
                    <>
                        <Hint label="Refresh">
                        <Button variant="ghost" size="icon" onClick={refreshData} disabled={isLoading} aria-label="Refresh members">
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        </Hint>
                        {canManage && (
                            <Button size="sm" onClick={() => setIsInviteModalOpen(true)}>
                                <Plus className="h-3.5 w-3.5" />
                                Invite
                            </Button>
                        )}
                    </>
                }
            />

            {isLoading && total === 0 ? (
                <div aria-busy="true">
                    <LoadingAnnouncement label="Loading members" />
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex h-9 items-center gap-2 border-b border-line pl-1" aria-hidden>
                            <ShimmerBlock className="h-5 w-5 rounded-full" />
                            <ShimmerBar className="w-40" />
                        </div>
                    ))}
                </div>
            ) : total === 0 ? (
                <EmptyPanel
                    icon={<Users />}
                    title="No members yet"
                    description={canManage ? 'Invite a Firm Administrator to help run the firm.' : undefined}
                />
            ) : (
                <NotionTable>
                    <NotionTableHeader>
                        <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                        <NotionTableHead icon={<AtSign />} className="hidden md:table-cell">Email</NotionTableHead>
                        <NotionTableHead icon={<Shield />}>Role</NotionTableHead>
                        <NotionTableHead icon={<Clock3 />} className="hidden sm:table-cell">Added</NotionTableHead>
                        <NotionTableActionsHead />
                    </NotionTableHeader>
                    <NotionTableBody>
                        {members.map((member) => {
                            const name = member.user?.name ?? member.user?.email ?? 'Unknown'
                            const canRemove = canManage && member.role === 'firm_admin' && adminCount > 1
                            return (
                                <NotionTableRow key={member.id}>
                                    <NotionTableCell>
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Avatar className="h-5 w-5 shrink-0">
                                                <AvatarImage src={member.user?.avatarUrl} />
                                                <AvatarFallback className="text-[9px]">{getInitials(member.user?.name)}</AvatarFallback>
                                            </Avatar>
                                            <span className="truncate" title={name}>{name}</span>
                                        </div>
                                    </NotionTableCell>
                                    <NotionTableCell className="hidden max-w-[16rem] truncate text-fg-muted md:table-cell" title={member.user?.email}>
                                        {member.user?.email}
                                    </NotionTableCell>
                                    <NotionTableCell>
                                        <Tag color={member.role === 'firm_admin' ? 'purple' : 'gray'}>
                                            {member.role === 'firm_admin' ? 'Firm admin' : 'Member'}
                                        </Tag>
                                    </NotionTableCell>
                                    <NotionTableCell className="hidden whitespace-nowrap sm:table-cell">
                                        {member.createdAt && (
                                            <RelativeDateTime date={member.createdAt} textClassName="text-small text-fg-muted" iconClassName="hidden" tooltipSide="left" />
                                        )}
                                    </NotionTableCell>
                                    <NotionTableActions>
                                        {canRemove && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 hover:text-danger"
                                                disabled={actionLoading === member.id}
                                                title="Revoke Firm Administrator"
                                                aria-label={`Revoke Firm Administrator for ${name}`}
                                                onClick={() => setMemberToRemove({ id: member.id, name, email: member.user?.email ?? '', ownsConnector: !!member.ownsConnector })}
                                            >
                                                <UserMinus className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </NotionTableActions>
                                </NotionTableRow>
                            )
                        })}
                        {invitations.map((inv) => (
                            <NotionTableRow key={inv.id}>
                                <NotionTableCell>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-fg-subtle">
                                            <Mail className="h-3 w-3" />
                                        </span>
                                        <span className="truncate text-fg-muted" title={inv.email}>{inv.email}</span>
                                    </div>
                                </NotionTableCell>
                                <NotionTableCell className="hidden text-fg-subtle md:table-cell">—</NotionTableCell>
                                <NotionTableCell><Tag color="purple">Firm admin</Tag></NotionTableCell>
                                <NotionTableCell className="hidden sm:table-cell">
                                    <StatusPill kind="invitation" status="PENDING" className={resendFeedback.isFresh(inv.id) ? FRESH_CHIP_CLASS : undefined} />
                                </NotionTableCell>
                                <NotionTableActions>
                                    {canManage && (
                                        <span className="inline-flex items-center gap-0.5">
                                            <Hint label="Resend invitation">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResendInvite(inv.id, inv.email)} disabled={actionLoading === inv.id} aria-label={`Resend invitation to ${inv.email}`}>
                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                </Button>
                                            </Hint>
                                            <Hint label="Cancel invitation">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={() => setInviteToRevokeId(inv.id)} disabled={actionLoading === inv.id} aria-label={`Cancel invitation to ${inv.email}`}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </Hint>
                                        </span>
                                    )}
                                </NotionTableActions>
                            </NotionTableRow>
                        ))}
                    </NotionTableBody>
                </NotionTable>
            )}

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
                description="You can send a new invite later if needed."
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
                subtitle="Removing them would disconnect document storage."
                description={
                    <span>
                        <strong>{memberToRemove?.name}</strong>{memberToRemove?.email ? ` (${memberToRemove.email})` : ''} is the owner of this firm's Storage Drive Connector, through which all its clients and engagements store their documents.
                        <br /><br />
                        To remove this member, first transfer the Storage Connector to another Firm Administrator in <a href={firmSettingsPath(groupSlug, orgSlug, 'storage')} className="text-primary underline underline-offset-2">Firm Settings → Data Storage</a> — then come back and remove them.
                    </span>
                }
                extra={
                    <p className="text-[12px] text-fg-muted mt-1">
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
                subtitle="Their engagement access stays as it is."
                description={
                    <span>
                        <strong>{memberToRemove?.name}</strong>{memberToRemove?.email ? ` (${memberToRemove.email})` : ''} will lose their Firm Administrator role and can no longer manage this firm, its clients, or engagements.
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
