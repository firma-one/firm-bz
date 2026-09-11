'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Persona } from '@prisma/client'
import { inviteMember } from '@/lib/actions/invitations'
import { Shield, Briefcase, Eye, CheckCircle2, UserPlus, Users, Info } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PersonaUiRole, PersonaUiSubRole, SUB_ROLE_LABEL, getPersonaUiGroup, resolvePersonaSlug } from '@/lib/persona-ui-groups'

type ProjectPersonaWithRole = Persona

interface InviteMemberModalProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    personas: ProjectPersonaWithRole[]
    preselectedUiRole?: PersonaUiRole | null
    onSuccess: () => void
}

export function InviteMemberModal({ projectId, open, onOpenChange, personas, preselectedUiRole, onSuccess }: InviteMemberModalProps) {
    const [email, setEmail] = useState('')
    const [emailError, setEmailError] = useState('')
    const [selectedPersonaId, setSelectedPersonaId] = useState('')
    const [uiRole, setUiRole] = useState<PersonaUiRole | ''>('')
    const [subRole, setSubRole] = useState<PersonaUiSubRole>('internal')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

    const findPersonaId = (uiRoleValue: PersonaUiRole, subRoleValue?: PersonaUiSubRole) => {
        const slug = resolvePersonaSlug(uiRoleValue, subRoleValue)
        return personas.find(p => p.slug === slug)?.id ?? ''
    }

    const handleUiRoleChange = (value: PersonaUiRole) => {
        setUiRole(value)
        if (value === 'contributor') {
            setSelectedPersonaId(findPersonaId('contributor', subRole))
        } else {
            setSelectedPersonaId(findPersonaId(value))
        }
    }

    const handleSubRoleChange = (value: PersonaUiSubRole) => {
        setSubRole(value)
        setSelectedPersonaId(findPersonaId('contributor', value))
    }

    // Set preselected role when modal opens
    useEffect(() => {
        if (open && preselectedUiRole) {
            setUiRole(preselectedUiRole)
            setSubRole('internal')
            if (preselectedUiRole === 'contributor') {
                setSelectedPersonaId(findPersonaId('contributor', 'internal'))
            } else {
                setSelectedPersonaId(findPersonaId(preselectedUiRole))
            }
        } else if (!open) {
            setSelectedPersonaId('')
            setUiRole('')
            setSubRole('internal')
            setEmail('')
            setError('')
            setEmailError('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, preselectedUiRole, personas])

    // Debounced email validation
    useEffect(() => {
        if (!email) {
            setEmailError('')
            return
        }
        const timer = setTimeout(() => {
            setEmailError(isValidEmail(email) ? '' : 'Please enter a valid email address')
        }, 400)
        return () => clearTimeout(timer)
    }, [email])

    const selectedPersona = personas.find(p => p.id === selectedPersonaId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!isValidEmail(email)) {
            setEmailError('Please enter a valid email address')
            return
        }

        setIsSubmitting(true)

        try {
            await inviteMember(projectId, email, selectedPersonaId)
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation')
        } finally {
            setIsSubmitting(false)
        }
    }

    const getPersonaIcon = (slug: string) => {
        const group = getPersonaUiGroup(slug)
        if (group?.uiRole === 'owner') return <Shield className="h-4 w-4" />
        if (group?.uiRole === 'contributor' && group.subRole === 'internal') return <Users className="h-4 w-4" />
        if (group?.uiRole === 'reviewer') return <Eye className="h-4 w-4" />
        return <Briefcase className="h-4 w-4" />
    }

    const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
    const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb]">
                <VisuallyHidden><DialogTitle>Invite to Engagement</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <UserPlus className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Invite to Engagement</p>
                        <p className="text-xs text-[#45474c] mt-0.5">Send an invitation to collaborate on this engagement.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-5 space-y-3">
                        {error && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                {error}
                            </div>
                        )}

                        {/* Email Input */}
                        <div>
                            <label htmlFor="invite-email" className={fieldLabel}>Email Address</label>
                            <div className="relative">
                                <Input
                                    id="invite-email"
                                    type="text"
                                    placeholder="colleague@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`${inputCls} ${emailError ? 'border-red-400 focus-visible:ring-red-400' : ''} ${email && !emailError ? 'pr-9' : ''}`}
                                />
                                {email && !emailError && (
                                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />
                                )}
                            </div>
                            {emailError && (
                                <p className="mt-1 text-[10px] text-red-500">{emailError}</p>
                            )}
                        </div>

                        {/* Persona Selection */}
                        <div>
                            <label className={fieldLabel}>Role</label>
                            <Select value={uiRole} onValueChange={(v) => handleUiRoleChange(v as PersonaUiRole)} required>
                                <SelectTrigger className={inputCls}>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent className="rounded border border-[#e5e7eb] bg-white shadow-md py-0.5 min-w-[var(--radix-select-trigger-width)]">
                                    <SelectItem value="owner" className="cursor-pointer rounded-none px-2.5 text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">
                                        Owner
                                    </SelectItem>
                                    <SelectItem value="contributor" className="cursor-pointer rounded-none px-2.5 text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">
                                        Contributor
                                    </SelectItem>
                                    <SelectItem value="reviewer" className="cursor-pointer rounded-none px-2.5 text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">
                                        Reviewer
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Access-scope sub-choice for Contributor */}
                            {uiRole === 'contributor' && (
                                <div className="mt-2 bg-white border border-[#e5e7eb] rounded p-3">
                                    <RadioGroup value={subRole} onValueChange={(v) => handleSubRoleChange(v as PersonaUiSubRole)} className="gap-2">
                                        {(['internal', 'external'] as const).map((sr) => {
                                            const persona = personas.find(p => p.slug === resolvePersonaSlug('contributor', sr))
                                            return (
                                                <div key={sr} className="flex items-center gap-2 cursor-pointer" onClick={() => handleSubRoleChange(sr)}>
                                                    <RadioGroupItem value={sr} id={`invite-sub-${sr}`} />
                                                    <Label htmlFor={`invite-sub-${sr}`} className="text-xs font-medium text-[#1b1b1d] cursor-pointer">
                                                        {SUB_ROLE_LABEL[sr]}
                                                    </Label>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                                <Info className="h-3.5 w-3.5 text-[#9a9ba0] cursor-help shrink-0" />
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

                            {/* Persona preview */}
                            {selectedPersona && (
                                <div className="mt-2 bg-white border border-[#e5e7eb] rounded p-3 flex items-start gap-2.5">
                                    <div className="mt-0.5 shrink-0 text-[#45474c]">
                                        {getPersonaIcon(selectedPersona.slug)}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[#1b1b1d]">{selectedPersona.displayName}</p>
                                        <div className="flex gap-1.5 mt-1">
                                            <span className="inline-flex items-center rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[10px] font-medium text-[#45474c]">
                                                {selectedPersona.slug === 'eng_admin' ? 'Manage' :
                                                    selectedPersona.slug === 'eng_member' || selectedPersona.slug === 'eng_ext_collaborator' ? 'Edit' : 'View'}
                                            </span>
                                            <span className="inline-flex items-center rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[10px] font-medium text-[#45474c]">
                                                {selectedPersona.slug === 'eng_ext_collaborator' || selectedPersona.slug === 'eng_viewer' ? 'Guest' : 'Internal'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3">
                        <Button type="button" variant="outline" className="rounded w-28 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="greenCta"
                            disabled={isSubmitting || !selectedPersonaId || !email || !!emailError}
                            className="rounded w-36 text-[10px] font-headline font-bold tracking-widest uppercase text-white"
                        >
                            {isSubmitting ? <LoadingSpinner size="sm" /> : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
