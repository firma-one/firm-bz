'use client'

import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MoreHorizontal, Mail, Clock, Trash2, SquarePlus, UserCog, User, UserCircle, Info, UserMinus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
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

interface MemberListProps {
    members: any[]
    invitations: any[]
    personas: any[]
    onRefresh: () => void
    canManage?: boolean
    onInviteWithPersona?: (personaId: string) => void
}

export function MemberList({ members, invitations, personas, onRefresh, canManage = false, onInviteWithPersona }: MemberListProps) {
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [editingMember, setEditingMember] = useState<any>(null)
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>("")
    const [memberIdToRemove, setMemberIdToRemove] = useState<string | null>(null)
    const [inviteIdToRevoke, setInviteIdToRevoke] = useState<string | null>(null)
    const { addToast } = useToast()

    const handleOpenEdit = (member: any) => {
        setEditingMember(member)
        const matchingPersona = personas.find((p: any) => p.slug === member.role)
        setSelectedPersonaId(matchingPersona?.id ?? '')
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

    /* People-oriented icons: Lead = directs/coordinates, Contributor = does the work, Viewer = client/stakeholder. */
    const getPersonaIcon = (slug: string) => {
        switch (slug) {
            case 'eng_admin':
                return <UserCog className="h-5 w-5" />
            case 'eng_member':
            case 'eng_ext_collaborator':
                return <User className="h-5 w-5" />
            case 'eng_viewer':
                return <UserCircle className="h-5 w-5" />
            default:
                return <User className="h-5 w-5" />
        }
    }

    /* Internal (eng_admin, eng_member) = same color. External (eng_ext_collaborator, eng_viewer) = same color. */
    const getPersonaIconColor = (slug: string) => {
        const internal = ['eng_admin', 'eng_member'].includes(slug)
        const external = ['eng_ext_collaborator', 'eng_viewer'].includes(slug)
        if (internal) return 'text-indigo-600'
        if (external) return 'text-teal-600'
        return 'text-slate-500'
    }

    // Group members by persona (RBAC v2: members have role, match by persona.slug)
    const membersByPersona = personas.reduce((acc, persona) => {
        acc[persona.id] = {
            persona,
            members: members.filter((m: any) => m.role === persona.slug),
            invitations: invitations.filter((i: any) => i.personaId === persona.id)
        }
        return acc
    }, {} as Record<string, { persona: any, members: any[], invitations: any[] }>)

    const membersWithoutPersona = members.filter((m: any) => !personas.find((p: any) => p.slug === m.role))
    const invitationsWithoutPersona = invitations.filter((i: any) => !i.personaId || !personas.find((p: any) => p.id === i.personaId))

    return (
            <div>
                {/* Group by Persona - 2x2 Grid Layout */}
                {personas.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {personas.map((persona) => {
                        const group = membersByPersona[persona.id]
                        const personaMembers = group?.members || []
                        const personaInvitations = group?.invitations || []

                    const totalCount = personaMembers.length + personaInvitations.length
                    const iconColorClass = getPersonaIconColor(persona.slug)
                    const PersonaIcon = () => getPersonaIcon(persona.slug)

                    return (
                        <div key={persona.id} className="flex flex-col overflow-hidden rounded border border-[#e5e7eb] bg-white min-h-[160px] max-h-[300px]">
                            {/* Single-line header: icon + title + count + action (Linear-style) */}
                            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#e5e7eb] flex-shrink-0">
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#f3f4f6] ${iconColorClass}`}>
                                    <PersonaIcon />
                                </div>
                                <h3 className="text-[13px] font-medium text-slate-900 truncate flex items-center gap-1.5 flex-1 min-w-0">
                                    <span className="truncate">{persona.displayName}</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5 text-slate-900 hover:text-slate-900 hover:bg-slate-100 shrink-0"
                                                aria-label={`More info about ${persona.displayName}`}
                                            >
                                                <Info className="h-3 w-3" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="start"
                                            side="bottom"
                                            className="max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-md"
                                        >
                                            <p className="text-xs font-medium text-slate-900">{persona.displayName}</p>
                                            <p className="mt-0.5 text-xs text-slate-600">{persona.description || 'No description'}</p>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    {totalCount > 0 && (
                                        <span className="text-slate-400 font-normal tabular-nums">{totalCount}</span>
                                    )}
                                </h3>
                                {canManage && onInviteWithPersona && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto px-3 py-1 rounded-[2px] bg-primary text-white text-[10px] font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1 shrink-0"
                                        onClick={() => onInviteWithPersona(persona.id)}
                                    >
                                        <SquarePlus className="h-3.5 w-3.5" />
                                        Invite
                                    </Button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0">
                                {personaMembers.length > 0 ? (
                                    <div className="divide-y divide-[#e5e7eb]">
                                        {personaMembers.map((member: any) => (
                                            <div key={member.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f3f4f6] transition-colors">
                                                <Avatar className="h-7 w-7 shrink-0 border border-[#e5e7eb]">
                                                    <AvatarImage src={member.user.avatarUrl} />
                                                    <AvatarFallback className="bg-slate-100 text-[11px] font-medium text-slate-600">{getInitials(member.user.name)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-slate-900 truncate">{member.user.name}</p>
                                                    <p className="text-[11px] text-slate-500 truncate">{member.user.email}</p>
                                                </div>
                                                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                                {canManage && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="min-w-[160px]">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleOpenEdit(member)}>Change role</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
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
                                        ))}
                                    </div>
                                ) : null}

                                {/* Pending invitations — minimal, same row style as members */}
                                {personaInvitations.length > 0 && (
                                    <div className="border-t border-[#e5e7eb] divide-y divide-[#e5e7eb]">
                                        {personaInvitations.map((invite: any) => (
                                            <div key={invite.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f3f4f6] transition-colors">
                                                <div className="h-7 w-7 shrink-0 rounded bg-[#f3f4f6] flex items-center justify-center text-slate-500">
                                                    <Mail className="h-3.5 w-3.5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-slate-900 truncate">{invite.email}</p>
                                                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                                        <Clock className="h-3 w-3 shrink-0" />
                                                        {invite.status === 'PENDING' ? 'Pending' : invite.status === 'ACCEPTED' ? 'Accepted' : invite.status.toLowerCase()}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                        onClick={() => handleResendInvite(invite.id)}
                                                        disabled={actionLoading === invite.id}
                                                    >
                                                        Resend
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => setInviteIdToRevoke(invite.id)}
                                                        disabled={actionLoading === invite.id}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Empty state — one line, no duplicate CTA (header already has Invite) */}
                                {personaMembers.length === 0 && personaInvitations.length === 0 && (
                                    <div className="px-3 py-6 text-center">
                                        <p className="text-[13px] text-slate-500">No one in this role yet.</p>
                                    </div>
                                )}
                            </div>
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
                                            <p className="text-[13px] font-medium text-slate-900 truncate">{member.user.name}</p>
                                            <p className="text-[11px] text-slate-500 truncate">{member.user.email}</p>
                                        </div>
                                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-[160px]">
                                                <DropdownMenuItem onClick={() => handleOpenEdit(member)}>Change role</DropdownMenuItem>
                                                <DropdownMenuSeparator />
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
                                        <p className="text-[13px] font-medium text-slate-900 truncate">{member.user.name}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{member.user.email}</p>
                                    </div>
                                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatDate(member.createdAt)}</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[160px]">
                                            <DropdownMenuItem onClick={() => handleOpenEdit(member)}>Change role</DropdownMenuItem>
                                            <DropdownMenuSeparator />
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
                        <div className="py-4">
                            <RadioGroup value={selectedPersonaId} onValueChange={setSelectedPersonaId} className="gap-4">
                                {personas.map((persona) => (
                                    <div key={persona.id} className="flex items-center space-x-2 border border-[#e5e7eb] p-3 rounded hover:bg-[#f3f4f6] cursor-pointer" onClick={() => setSelectedPersonaId(persona.id)}>
                                        <RadioGroupItem value={persona.id} id={persona.id} />
                                        <div className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-1.5">
                                                <Label htmlFor={persona.id} className="font-medium cursor-pointer">{persona.displayName}</Label>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Info className="h-3.5 w-3.5 text-slate-400 cursor-help shrink-0" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="max-w-[260px]">
                                                            {persona.description || 'No description'}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            <p className="text-sm text-slate-500">{persona.description || 'No description'}</p>
                                        </div>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" className="rounded-[2px]" onClick={() => setEditingMember(null)}>Cancel</Button>
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

