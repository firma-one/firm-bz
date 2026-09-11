'use client'

import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MoreVertical, Mail, Clock, Trash2, SquarePlus, UserCog, User, UserCircle, Info, UserMinus } from 'lucide-react'
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
const COLLAPSED_CARD_LIMIT = 4

export function MemberList({ members, invitations, personas, onRefresh, canManage = false, onInviteWithRole }: MemberListProps) {
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [editingMember, setEditingMember] = useState<any>(null)
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>("")
    const [editUiRole, setEditUiRole] = useState<PersonaUiRole | ''>('')
    const [editSubRole, setEditSubRole] = useState<PersonaUiSubRole>('internal')
    const [memberIdToRemove, setMemberIdToRemove] = useState<string | null>(null)
    const [inviteIdToRevoke, setInviteIdToRevoke] = useState<string | null>(null)
    const [expandedRoles, setExpandedRoles] = useState<Set<PersonaUiRole>>(new Set())
    const { addToast } = useToast()

    const toggleRoleExpanded = (uiRole: PersonaUiRole) => {
        setExpandedRoles((prev) => {
            const next = new Set(prev)
            if (next.has(uiRole)) next.delete(uiRole)
            else next.add(uiRole)
            return next
        })
    }

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
                return <UserCog className="h-5 w-5" />
            case 'contributor':
                return <User className="h-5 w-5" />
            case 'reviewer':
                return <UserCircle className="h-5 w-5" />
        }
    }

    const getUiRoleIconColor = (uiRole: PersonaUiRole) => {
        if (uiRole === 'owner') return 'text-indigo-600'
        if (uiRole === 'contributor') return 'text-indigo-600'
        return 'text-teal-600'
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

    return (
            <div>
                {/* Sections flow in normal page layout; members render as compact cards in a wrapping grid */}
                {personas.length > 0 ? (
                    <div className="space-y-6">
                        {UI_ROLE_ORDER.map((uiRole) => {
                            const group = membersByUiRole[uiRole]
                            const roleMembers = group?.members || []
                            const roleInvitations = group?.invitations || []
                            const totalCount = roleMembers.length + roleInvitations.length
                            const iconColorClass = getUiRoleIconColor(uiRole)
                            const displayLabel = UI_ROLE_DISPLAY_LABEL[uiRole]
                            const description = personaDescriptionForUiRole(uiRole)

                            return (
                                <div key={uiRole} className="rounded bg-[#fafafa] p-3">
                                    {/* Section header: icon + title + count + tooltip + action */}
                                    <div className="flex items-center gap-2 pb-2 border-b border-[#e5e7eb]">
                                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center ${iconColorClass}`}>
                                            {getUiRoleIcon(uiRole)}
                                        </div>
                                        <h3 className="text-[12px] font-semibold uppercase tracking-wide flex items-center gap-1.5 flex-1 min-w-0">
                                            <span className={`truncate ${iconColorClass}`}>{displayLabel}</span>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-slate-400 cursor-help shrink-0" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[280px] normal-case font-normal">
                                                        {description || 'No description'}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white text-[10px] font-medium normal-case text-slate-500 tabular-nums">{totalCount}</span>
                                        </h3>
                                        {canManage && onInviteWithRole && (
                                            <Button
                                                variant="ghost"
                                                className="h-auto w-44 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 shrink-0"
                                                onClick={() => onInviteWithRole(uiRole)}
                                            >
                                                <SquarePlus className="h-3.5 w-3.5 mr-1.5" />
                                                Invite {displayLabel}
                                            </Button>
                                        )}
                                    </div>

                                    {totalCount > 0 ? (() => {
                                        const isExpanded = expandedRoles.has(uiRole)
                                        const visibleMemberCount = isExpanded ? roleMembers.length : Math.max(0, Math.min(COLLAPSED_CARD_LIMIT, roleMembers.length))
                                        const visibleInvitationCount = isExpanded ? roleInvitations.length : Math.max(0, COLLAPSED_CARD_LIMIT - visibleMemberCount)
                                        const visibleMembers = roleMembers.slice(0, visibleMemberCount)
                                        const visibleInvitations = roleInvitations.slice(0, visibleInvitationCount)
                                        return (
                                        <>
                                        <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: '1fr' }}>
                                        <div className="overflow-hidden min-h-0">
                                        <div className="flex flex-wrap gap-3 mt-3">
                                            {visibleMembers.map((member: any) => {
                                                const memberGroup = getPersonaUiGroup(member.role)
                                                const memberPersonaDescription = personas.find((p: any) => p.slug === member.role)?.description
                                                return (
                                                <div key={member.id} className="w-[300px] rounded border border-[#e5e7eb] bg-white px-4 py-3.5 shadow-sm hover:shadow-md hover:border-[#d1d5db] transition-all">
                                                    <div className="flex items-start gap-3">
                                                        <Avatar className="h-11 w-11 shrink-0 rounded bg-[#e2e5e0]">
                                                            <AvatarImage src={member.user.avatarUrl} />
                                                            <AvatarFallback className="bg-[#e2e5e0] rounded text-[15px] font-semibold text-slate-700">{getInitials(member.user.name)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p className="text-[16px] font-semibold text-slate-900 truncate cursor-default">{member.user.name}</p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">{member.user.name}</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p className="text-[13px] text-slate-500 truncate mt-0.5 cursor-default">{member.user.email}</p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">{member.user.email}</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </div>
                                                        {canManage && (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                                        <MoreVertical className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="min-w-[140px]">
                                                                    <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                                                                        <UserCog className="h-4 w-4 mr-2" />
                                                                        Change role
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-red-600 focus:text-red-600"
                                                                        onClick={() => setMemberIdToRemove(member.id)}
                                                                        disabled={actionLoading === member.id}
                                                                    >
                                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                                        Remove member
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex items-center justify-between gap-2">
                                                        <span className="text-[13px] text-slate-400 tabular-nums truncate">Added {formatDate(member.createdAt)}</span>
                                                        {memberGroup?.uiRole === 'contributor' && (
                                                            <span className="inline-flex items-center gap-1.5 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#45474c] shrink-0">
                                                                {memberGroup.subLabel}
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Info className="h-3.5 w-3.5 text-[#8a8c91] cursor-help shrink-0" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top" className="max-w-[280px] normal-case font-normal">
                                                                            {memberPersonaDescription || 'No description'}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                )
                                            })}

                                            {visibleInvitations.map((invite: any) => {
                                                const invitePersona = personas.find((p: any) => p.id === invite.personaId)
                                                const inviteGroup = invitePersona ? getPersonaUiGroup(invitePersona.slug) : undefined
                                                return (
                                                <div key={invite.id} className="w-[300px] rounded border border-dashed border-[#e5e7eb] bg-white px-4 py-3.5 shadow-sm">
                                                    <div className="flex items-start gap-3">
                                                        <div className="h-11 w-11 shrink-0 rounded bg-[#f3f4f6] flex items-center justify-center text-slate-500">
                                                            <Mail className="h-4 w-4" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p className="text-[16px] font-semibold text-slate-900 truncate cursor-default">{invite.email}</p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">{invite.email}</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            <p className="text-[13px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                                <Clock className="h-3 w-3 shrink-0" />
                                                                {invite.status === 'PENDING' ? 'Pending' : invite.status === 'ACCEPTED' ? 'Accepted' : invite.status.toLowerCase()}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                                                onClick={() => handleResendInvite(invite.id)}
                                                                disabled={actionLoading === invite.id}
                                                                title="Resend invitation"
                                                            >
                                                                <Mail className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                onClick={() => setInviteIdToRevoke(invite.id)}
                                                                disabled={actionLoading === invite.id}
                                                                title="Cancel invitation"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    {inviteGroup?.uiRole === 'contributor' && (
                                                        <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex items-center justify-end">
                                                            <span className="inline-flex items-center gap-1.5 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#45474c] shrink-0">
                                                                {inviteGroup.subLabel}
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Info className="h-3.5 w-3.5 text-[#8a8c91] cursor-help shrink-0" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top" className="max-w-[280px] normal-case font-normal">
                                                                            {invitePersona?.description || 'No description'}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                )
                                            })}
                                        </div>
                                        </div>
                                        </div>
                                        {totalCount > COLLAPSED_CARD_LIMIT && (
                                            <button
                                                type="button"
                                                onClick={() => toggleRoleExpanded(uiRole)}
                                                className="mt-2 text-[12px] font-medium text-primary hover:underline"
                                            >
                                                {isExpanded ? 'Show less' : `Show all ${totalCount}`}
                                            </button>
                                        )}
                                        </>
                                        )
                                    })() : (
                                        <p className="mt-3 text-[12px] text-slate-400">No one in this role yet.</p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    /* Fallback when no personas exist */
                    <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e5e7eb]">
                            <h3 className="text-[13px] font-medium text-slate-900">Members</h3>
                            <span className="text-[11px] text-slate-500">Joined</span>
                        </div>
                        {members.length > 0 ? (
                            <div className="divide-y divide-[#e5e7eb]">
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f3f4f6] transition-colors">
                                        <Avatar className="h-7 w-7 shrink-0 border border-[#e5e7eb]">
                                            <AvatarImage src={member.user.avatarUrl} />
                                            <AvatarFallback className="bg-slate-100 text-[11px] font-medium text-slate-600">{getInitials(member.user.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <p className="text-[13px] font-medium text-slate-900 truncate cursor-default">{member.user.name}</p>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">{member.user.name}</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <p className="text-[11px] text-slate-500 truncate cursor-default">{member.user.email}</p>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">{member.user.email}</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                    <MoreVertical className="h-3.5 w-3.5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-[140px]">
                                                <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                                                    <UserCog className="h-4 w-4 mr-2" /> Change role
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setMemberIdToRemove(member.id)} disabled={actionLoading === member.id}>
                                                    <Trash2 className="h-4 w-4 mr-2" /> Remove member
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-3 py-6 text-center">
                                <p className="text-[13px] text-slate-500">No members yet.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Members / invitations without a persona */}
                {(membersWithoutPersona.length > 0 || invitationsWithoutPersona.length > 0) && (
                    <div className="mt-4 rounded border border-[#e5e7eb] bg-white overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e5e7eb]">
                            <h3 className="text-[13px] font-medium text-slate-900">Other members</h3>
                            <span className="text-[11px] text-slate-500">Joined</span>
                        </div>
                        <div className="divide-y divide-[#e5e7eb]">
                            {membersWithoutPersona.map((member: any) => (
                                <div key={member.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f3f4f6] transition-colors">
                                    <Avatar className="h-7 w-7 shrink-0 border border-[#e5e7eb]">
                                        <AvatarImage src={member.user.avatarUrl} />
                                        <AvatarFallback className="bg-slate-100 text-[11px] font-medium text-slate-600">{getInitials(member.user.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <p className="text-[13px] font-medium text-slate-900 truncate cursor-default">{member.user.name}</p>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">{member.user.name}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <p className="text-[11px] text-slate-500 truncate cursor-default">{member.user.email}</p>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">{member.user.email}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                <MoreVertical className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[140px]">
                                            <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                                                <UserCog className="h-4 w-4 mr-2" /> Change role
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setMemberIdToRemove(member.id)}>
                                                <Trash2 className="h-4 w-4 mr-2" /> Remove member
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Change Role Dialog */}
                <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
                    <DialogContent className="sm:max-w-[850px]">
                        <DialogHeader>
                            <DialogTitle>Change Member Role</DialogTitle>
                            <DialogDescription>
                                Select a new role for {editingMember?.user.name}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <RadioGroup value={editUiRole} onValueChange={(v) => handleEditUiRoleChange(v as PersonaUiRole)} className="gap-4">
                                {UI_ROLE_ORDER.map((uiRoleValue) => {
                                    const slug = uiRoleValue === 'contributor' ? resolvePersonaSlug('contributor', editSubRole) : resolvePersonaSlug(uiRoleValue)
                                    const persona = personas.find((p: any) => p.slug === slug)
                                    const label = UI_ROLE_DISPLAY_LABEL[uiRoleValue]
                                    return (
                                        <div key={uiRoleValue} className="flex items-center space-x-2 border border-[#e5e7eb] p-3 rounded hover:bg-[#f3f4f6] cursor-pointer" onClick={() => handleEditUiRoleChange(uiRoleValue)}>
                                            <RadioGroupItem value={uiRoleValue} id={`role-${uiRoleValue}`} />
                                            <div className="flex-1 cursor-pointer">
                                                <div className="flex items-center gap-1.5">
                                                    <Label htmlFor={`role-${uiRoleValue}`} className="font-medium cursor-pointer">{label}</Label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                                <Info className="h-3.5 w-3.5 text-slate-400 cursor-help shrink-0" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="max-w-[260px]">
                                                                {persona?.description || 'No description'}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                                <p className="text-sm text-slate-500">{persona?.description || 'No description'}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </RadioGroup>

                            {editUiRole === 'contributor' && (
                                <div className="ml-6 border border-[#e5e7eb] p-3 rounded bg-[#f9f9fb]">
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
                                                                <Info className="h-3.5 w-3.5 text-slate-400 cursor-help shrink-0" />
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
                            <Button variant="outline" className="rounded" onClick={() => setEditingMember(null)}>Cancel</Button>
                            <Button
                                onClick={handleUpdateRole}
                                disabled={actionLoading === "DIALOG_UPDATING"}
                                variant="greenCta"
                            >
                                {actionLoading === "DIALOG_UPDATING" ? 'Saving...' : 'Save'}
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
            </div>
        
    )
}

