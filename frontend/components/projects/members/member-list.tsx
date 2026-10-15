'use client'

import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AtSign, Clock3, Info, Mail, MoreHorizontal, Plus, Send, Shield, Trash2, Type, User, UserCircle, UserCog, UserMinus, X } from 'lucide-react'
import { NotionTable, NotionTableActions, NotionTableBody, NotionTableCell, NotionTableHead, NotionTableHeader, NotionTableRow } from '@/components/ui/notion-table'
import { Tag } from '@/components/ui/tag'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { formatFullDate } from '@/lib/utils'
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { removeMember, revokeInvitation, updateMemberPersona } from '@/lib/actions/members'
import { resendInvitation } from '@/lib/actions/invitations'
import { useToast } from "@/components/ui/toast"
import { PERSONA_UI_GROUPS, PersonaUiRole, PersonaUiSubRole, SUB_ROLE_LABEL, getPersonaUiGroup, resolvePersonaSlug } from '@/lib/persona-ui-groups'

interface MemberListProps {
    members: any[]
    invitations: any[]
    personas: any[]
    onRefresh: () => void
    canManage?: boolean
    onInviteWithRole?: (uiRole: PersonaUiRole) => void
}

const UI_ROLE_ORDER: PersonaUiRole[] = ['owner', 'contributor', 'reviewer']
const UI_ROLE_DISPLAY_LABEL: Record<PersonaUiRole, string> = { owner: 'Owner', contributor: 'Contributor', reviewer: 'Reviewer' }

export function MemberList({ members, invitations, personas, onRefresh, canManage = false, onInviteWithRole }: MemberListProps) {
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [editingMember, setEditingMember] = useState<any>(null)
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>("")
    const [editUiRole, setEditUiRole] = useState<PersonaUiRole | ''>('')
    const [editSubRole, setEditSubRole] = useState<PersonaUiSubRole>('internal')
    const [memberIdToRemove, setMemberIdToRemove] = useState<string | null>(null)
    const [inviteIdToRevoke, setInviteIdToRevoke] = useState<string | null>(null)
    const { addToast } = useToast()

    const findPersonaId = (uiRoleValue: PersonaUiRole, subRoleValue?: PersonaUiSubRole) => {
        const slug = resolvePersonaSlug(uiRoleValue, subRoleValue)
        return personas.find((p: any) => p.slug === slug)?.id ?? ''
    }

    const handleOpenEdit = (member: any) => {
        setEditingMember(member)
        const matchingPersona = personas.find((p: any) => p.slug === member.role)
        setSelectedPersonaId(matchingPersona?.id ?? '')
        const group = matchingPersona ? getPersonaUiGroup(matchingPersona.slug) : undefined
        setEditUiRole(group?.uiRole ?? '')
        setEditSubRole(group?.uiRole === 'contributor' ? group.subRole : 'internal')
    }

    const handleEditUiRoleChange = (value: PersonaUiRole) => {
        setEditUiRole(value)
        if (value === 'contributor') {
            setSelectedPersonaId(findPersonaId('contributor', editSubRole))
        } else {
            setSelectedPersonaId(findPersonaId(value))
        }
    }

    const handleEditSubRoleChange = (value: PersonaUiSubRole) => {
        setEditSubRole(value)
        setSelectedPersonaId(findPersonaId('contributor', value))
    }

    const handleUpdateRole = async () => {
        if (!editingMember || !selectedPersonaId) return
        setActionLoading("DIALOG_UPDATING")
        try {
            await updateMemberPersona(editingMember.id, selectedPersonaId)
            addToast({ type: 'success', title: 'Role Updated', message: 'Member role has been updated.' })
            onRefresh()
            setEditingMember(null)
        } catch (e: any) {
            console.error(e)
            addToast({ type: 'error', title: 'Update Failed', message: e.message || 'Could not update role.' })
        } finally {
            setActionLoading(null)
        }
    }

    const executeRemoveMember = async () => {
        if (!memberIdToRemove) return
        const id = memberIdToRemove
        setMemberIdToRemove(null)
        setActionLoading(id)
        try {
            await removeMember(id)
            addToast({ type: 'success', title: 'Member Removed', message: 'User access has been revoked.' })
            onRefresh()
        } catch (e) {
            console.error(e)
            addToast({ type: 'error', title: 'Error', message: 'Failed to remove member.' })
        } finally {
            setActionLoading(null)
        }
    }

    const executeRevokeInvite = async () => {
        if (!inviteIdToRevoke) return
        const id = inviteIdToRevoke
        setInviteIdToRevoke(null)
        setActionLoading(id)
        try {
            await revokeInvitation(id)
            addToast({ type: 'success', title: 'Invitation Cancelled', message: 'The invitation has been successfully revoked.' })
            onRefresh()
        } catch (e) {
            console.error(e)
            addToast({ type: 'error', title: 'Error', message: 'Failed to revoke invitation.' })
        } finally {
            setActionLoading(null)
        }
    }

    const handleResendInvite = async (id: string) => {
        setActionLoading(id)
        try {
            await resendInvitation(id)
            addToast({ type: 'success', title: 'Invitation Sent', message: 'The invitation has been resent.' })
            onRefresh()
        } catch (e) {
            console.error(e)
            addToast({ type: 'error', title: 'Failed to Send', message: 'Could not resend the invitation.' })
        } finally {
            setActionLoading(null)
        }
    }

    const getInitials = (name: string) => {
        return name ? name.substring(0, 2).toUpperCase() : '??'
    }

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        try {
            const formatted = formatFullDate(date)
            return formatted || '-'
        } catch {
            return '-'
        }
    }

    /* People-oriented icons: Owner = directs/coordinates, Contributor = does the work, Reviewer = client/stakeholder. */
    const getUiRoleIcon = (uiRole: PersonaUiRole) => {
        switch (uiRole) {
            case 'owner':
                return <UserCog />
            case 'contributor':
                return <User />
            case 'reviewer':
                return <UserCircle />
        }
    }

    // Group members/invitations by top-level UI role (Owner / Contributor / Reviewer),
    // collapsing the Internal/External contributor personas into one bucket.
    const slugToUiRole = (slug: string): PersonaUiRole | undefined => getPersonaUiGroup(slug)?.uiRole

    const membersByUiRole = UI_ROLE_ORDER.reduce((acc, uiRole) => {
        acc[uiRole] = {
            members: members.filter((m: any) => slugToUiRole(m.role) === uiRole),
            invitations: invitations.filter((i: any) => {
                const persona = personas.find((p: any) => p.id === i.personaId)
                return persona && slugToUiRole(persona.slug) === uiRole
            }),
        }
        return acc
    }, {} as Record<PersonaUiRole, { members: any[], invitations: any[] }>)

    const personaDescriptionForUiRole = (uiRole: PersonaUiRole) => {
        const slug = uiRole === 'contributor' ? resolvePersonaSlug('contributor', 'internal') : resolvePersonaSlug(uiRole)
        return personas.find((p: any) => p.slug === slug)?.description
    }

    const membersWithoutPersona = members.filter((m: any) => !personas.find((p: any) => p.slug === m.role))
    const invitationsWithoutPersona = invitations.filter((i: any) => !i.personaId || !personas.find((p: any) => p.id === i.personaId))

    const memberActions = (member: any) => canManage && (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${member.user.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                    <UserCog className="h-4 w-4" /> Change role
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onClick={() => setMemberIdToRemove(member.id)}
                    disabled={actionLoading === member.id}
                >
                    <Trash2 className="h-4 w-4" /> Remove member
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    const roleTag = (slug: string | undefined, description?: string) => {
        const group = slug ? getPersonaUiGroup(slug) : undefined
        if (!group) return <span className="text-fg-subtle">—</span>
        const tag = (
            <Tag color={group.uiRole === 'reviewer' ? 'blue' : group.uiRole === 'owner' ? 'purple' : 'gray'}>
                {group.uiRole === 'contributor' ? `${group.label} · ${group.subLabel}` : group.label}
            </Tag>
        )
        return description ? (
            <Tooltip>
                <TooltipTrigger asChild><span className="inline-flex cursor-default">{tag}</span></TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">{description}</TooltipContent>
            </Tooltip>
        ) : tag
    }

    const memberRow = (member: any) => {
        const description = personas.find((p: any) => p.slug === member.role)?.description
        return (
            <NotionTableRow key={member.id}>
                <NotionTableCell>
                    <div className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-5 w-5 shrink-0">
                            <AvatarImage src={member.user.avatarUrl} />
                            <AvatarFallback className="text-[9px]">{getInitials(member.user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate" title={member.user.name}>{member.user.name}</span>
                    </div>
                </NotionTableCell>
                <NotionTableCell className="hidden max-w-[16rem] truncate text-fg-muted md:table-cell" title={member.user.email}>{member.user.email}</NotionTableCell>
                <NotionTableCell>
                    {canManage ? (
                        <button type="button" onClick={() => handleOpenEdit(member)} className="-mx-1 rounded-control px-1 py-0.5 hover:bg-surface-selected" aria-label={`Change role for ${member.user.name}`}>
                            {roleTag(member.role)}
                        </button>
                    ) : roleTag(member.role, description)}
                </NotionTableCell>
                <NotionTableCell className="hidden whitespace-nowrap text-small tabular-nums text-fg-muted sm:table-cell">{formatDate(member.createdAt)}</NotionTableCell>
                <NotionTableActions>{memberActions(member)}</NotionTableActions>
            </NotionTableRow>
        )
    }

    const invitationRow = (invite: any) => {
        const persona = personas.find((p: any) => p.id === invite.personaId)
        return (
            <NotionTableRow key={invite.id}>
                <NotionTableCell>
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-fg-subtle">
                            <Mail className="h-3 w-3" />
                        </span>
                        <span className="truncate text-fg-muted" title={invite.email}>{invite.email}</span>
                    </div>
                </NotionTableCell>
                <NotionTableCell className="hidden text-fg-subtle md:table-cell">—</NotionTableCell>
                <NotionTableCell>{roleTag(persona?.slug, persona?.description)}</NotionTableCell>
                <NotionTableCell className="hidden sm:table-cell">
                    <Tag color={invite.status === 'PENDING' ? 'yellow' : 'gray'} dot>
                        {invite.status === 'PENDING' ? 'Invited' : invite.status === 'ACCEPTED' ? 'Accepted' : invite.status.toLowerCase()}
                    </Tag>
                </NotionTableCell>
                <NotionTableActions>
                    {canManage && (
                        <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResendInvite(invite.id)} disabled={actionLoading === invite.id} title="Resend invitation" aria-label={`Resend invitation to ${invite.email}`}>
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={() => setInviteIdToRevoke(invite.id)} disabled={actionLoading === invite.id} title="Cancel invitation" aria-label={`Cancel invitation to ${invite.email}`}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </NotionTableActions>
            </NotionTableRow>
        )
    }

    /* Linear-style group header: role, count and description, with a quiet invite button at the end. */
    const groupHeader = (key: string, label: string, count: number, description?: string, icon?: React.ReactNode, onInvite?: () => void) => (
        <tr key={`${key}-header`} className="h-9 border-b border-line bg-surface-subtle">
            <td colSpan={5} className="px-1">
                <div className="flex items-center gap-2">
                    {icon && <span className="text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
                    <span className="text-small font-medium text-fg">{label}</span>
                    <span className="text-small tabular-nums text-fg-subtle">{count}</span>
                    {description && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-fg-subtle" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px]">{description}</TooltipContent>
                        </Tooltip>
                    )}
                    {onInvite && (
                        <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={onInvite}>
                            <Plus className="h-3.5 w-3.5" />
                            Invite {label.toLowerCase()}
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    )

    const tableHeader = (
        <NotionTableHeader>
            <NotionTableHead icon={<Type />}>Name</NotionTableHead>
            <NotionTableHead icon={<AtSign />} className="hidden md:table-cell">Email</NotionTableHead>
            <NotionTableHead icon={<Shield />}>Role</NotionTableHead>
            <NotionTableHead icon={<Clock3 />} className="hidden sm:table-cell">Added</NotionTableHead>
            <th className="w-px" aria-label="Actions" />
        </NotionTableHeader>
    )

    return (
            <TooltipProvider>
                {personas.length > 0 ? (
                    <NotionTable>
                        {tableHeader}
                        {UI_ROLE_ORDER.map((uiRole) => {
                            const group = membersByUiRole[uiRole]
                            const roleMembers = group?.members || []
                            const roleInvitations = group?.invitations || []
                            const totalCount = roleMembers.length + roleInvitations.length
                            const displayLabel = UI_ROLE_DISPLAY_LABEL[uiRole]
                            return (
                                <NotionTableBody key={uiRole}>
                                    {groupHeader(
                                        uiRole,
                                        displayLabel,
                                        totalCount,
                                        personaDescriptionForUiRole(uiRole),
                                        getUiRoleIcon(uiRole),
                                        canManage && onInviteWithRole ? () => onInviteWithRole(uiRole) : undefined,
                                    )}
                                    {roleMembers.map(memberRow)}
                                    {roleInvitations.map(invitationRow)}
                                    {totalCount === 0 && (
                                        <tr className="h-9 border-b border-line">
                                            <td colSpan={5} className="px-1 text-small text-fg-subtle">No one in this role yet.</td>
                                        </tr>
                                    )}
                                </NotionTableBody>
                            )
                        })}
                        {(membersWithoutPersona.length > 0 || invitationsWithoutPersona.length > 0) && (
                            <NotionTableBody>
                                {groupHeader('other', 'Other members', membersWithoutPersona.length + invitationsWithoutPersona.length)}
                                {membersWithoutPersona.map(memberRow)}
                                {invitationsWithoutPersona.map(invitationRow)}
                            </NotionTableBody>
                        )}
                    </NotionTable>
                ) : members.length > 0 ? (
                    /* Fallback when no personas exist: one flat table, no role grouping. */
                    <NotionTable>
                        {tableHeader}
                        <NotionTableBody>{members.map(memberRow)}</NotionTableBody>
                    </NotionTable>
                ) : (
                    <EmptyPanel compact title="No members yet" />
                )}

                {/* Change Role Dialog */}
                <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Change role</DialogTitle>
                            <DialogDescription>
                                Select a new role for {editingMember?.user.name}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                            <RadioGroup value={editUiRole} onValueChange={(v) => handleEditUiRoleChange(v as PersonaUiRole)} className="gap-2">
                                {UI_ROLE_ORDER.map((uiRoleValue) => {
                                    const slug = uiRoleValue === 'contributor' ? resolvePersonaSlug('contributor', editSubRole) : resolvePersonaSlug(uiRoleValue)
                                    const persona = personas.find((p: any) => p.slug === slug)
                                    const label = UI_ROLE_DISPLAY_LABEL[uiRoleValue]
                                    return (
                                        <div key={uiRoleValue} className="flex cursor-pointer items-start gap-3 rounded-card border border-line p-3 transition-colors hover:bg-surface-hover has-[[data-state=checked]]:border-action/60 has-[[data-state=checked]]:bg-surface-subtle" onClick={() => handleEditUiRoleChange(uiRoleValue)}>
                                            <RadioGroupItem value={uiRoleValue} id={`role-${uiRoleValue}`} className="mt-0.5" />
                                            <div className="flex-1 cursor-pointer">
                                                <Label htmlFor={`role-${uiRoleValue}`} className="cursor-pointer text-ui font-medium text-fg">{label}</Label>
                                                <p className="text-small text-fg-muted">{persona?.description || 'No description'}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </RadioGroup>

                            {editUiRole === 'contributor' && (
                                <div className="ml-7 rounded-card bg-surface-subtle p-3">
                                    <RadioGroup value={editSubRole} onValueChange={(v) => handleEditSubRoleChange(v as PersonaUiSubRole)} className="gap-2">
                                        {(['internal', 'external'] as const).map((sr) => {
                                            const persona = personas.find((p: any) => p.slug === resolvePersonaSlug('contributor', sr))
                                            return (
                                                <div key={sr} className="flex items-center gap-2 cursor-pointer" onClick={() => handleEditSubRoleChange(sr)}>
                                                    <RadioGroupItem value={sr} id={`edit-sub-${sr}`} />
                                                    <Label htmlFor={`edit-sub-${sr}`} className="text-sm font-medium cursor-pointer">
                                                        {SUB_ROLE_LABEL[sr]}
                                                    </Label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                                <Info className="h-3.5 w-3.5 text-fg-subtle cursor-help shrink-0" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="max-w-[260px]">
                                                                {persona?.description || 'No description'}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            )
                                        })}
                                    </RadioGroup>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setEditingMember(null)}>Cancel</Button>
                            <Button
                                onClick={handleUpdateRole}
                                disabled={actionLoading === "DIALOG_UPDATING"}
                                variant="greenCta"
                            >
                                {actionLoading === "DIALOG_UPDATING" ? 'Saving…' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={memberIdToRemove !== null}
                    onOpenChange={(open) => !open && setMemberIdToRemove(null)}
                    icon={<UserMinus className="h-3.5 w-3.5" />}
                    iconVariant="red"
                    title="Remove member"
                    subtitle="This action cannot be undone."
                    description="This will remove the user's access to this project. This cannot be undone."
                    confirmLabel="Remove member"
                    confirmVariant="red"
                    onCancel={() => setMemberIdToRemove(null)}
                    onConfirm={() => void executeRemoveMember()}
                />

                <ConfirmDialog
                    open={inviteIdToRevoke !== null}
                    onOpenChange={(open) => !open && setInviteIdToRevoke(null)}
                    icon={<Mail className="h-3.5 w-3.5" />}
                    iconVariant="red"
                    title="Cancel invitation"
                    subtitle="The invitation will be revoked."
                    description="This invitation will be revoked. You can send a new invite later if needed."
                    cancelLabel="Keep invitation"
                    confirmLabel="Cancel invitation"
                    confirmVariant="red"
                    onCancel={() => setInviteIdToRevoke(null)}
                    onConfirm={() => void executeRevokeInvite()}
                />
            </TooltipProvider>
    )
}

