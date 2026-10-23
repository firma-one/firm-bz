'use client'

import React, { useState, useEffect } from 'react'
import { AtSign, CheckCircle2, KeyRound, Shield } from 'lucide-react'
import { Persona } from '@prisma/client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Hint } from '@/components/ui/tooltip'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS } from '@/components/ui/property-list'
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from '@/components/ui/create-dialog'
import { cn } from '@/lib/utils'
import { inviteMember } from '@/lib/actions/invitations'
import { InviteeNameFields } from '@/components/projects/members/invitee-name-fields'
import { PersonaUiRole, PersonaUiSubRole, SUB_ROLE_LABEL, resolvePersonaSlug } from '@/lib/persona-ui-groups'

type ProjectPersonaWithRole = Persona

/** One line on what each engagement role can do, shown under the Role row. */
const ROLE_SUMMARY: Record<string, string> = {
    eng_admin: 'Engagement Lead · manages the engagement and its members · internal',
    eng_member: 'Contributor · edits all engagement content · internal',
    eng_ext_collaborator: 'Contributor · edits only what is shared with them · guest',
    eng_viewer: 'Reviewer · views shared content, read-only · guest',
}

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
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
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
            setFirstName('')
            setLastName('')
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
            await inviteMember(projectId, email, selectedPersonaId, { firstName, lastName })
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation')
        } finally {
            setIsSubmitting(false)
        }
    }

    const emailValid = !!email && !emailError

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
                <CreateDialogHeader title="Invite to engagement" description="Send an invitation to collaborate on this engagement." />

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                        {error && <CreateDialogNotice message={error} />}

                        <PropertyList>
                            <PropertyRow label={<label htmlFor="invite-email">Email</label>} icon={<AtSign />}>
                                <div className="flex w-full flex-col gap-1">
                                    <div className="relative w-full">
                                        <Input
                                            id="invite-email"
                                            type="text"
                                            inputMode="email"
                                            autoComplete="off"
                                            placeholder="colleague@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoFocus
                                            aria-invalid={!!emailError}
                                            className={cn(PROPERTY_FIELD_CLASS, emailValid && 'pr-8', emailError && 'ring-1 ring-danger')}
                                        />
                                        {emailValid && (
                                            <CheckCircle2 className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-tag-green-fg" aria-hidden />
                                        )}
                                    </div>
                                    {emailError && <p className="px-2 text-caption text-danger">{emailError}</p>}
                                </div>
                            </PropertyRow>

                            <InviteeNameFields
                                idPrefix="invite"
                                firstName={firstName}
                                lastName={lastName}
                                onFirstNameChange={setFirstName}
                                onLastNameChange={setLastName}
                                disabled={isSubmitting}
                            />

                            <PropertyRow label="Role" icon={<Shield />}>
                                <div className="flex w-full flex-col gap-1">
                                    <Select value={uiRole} onValueChange={(v) => handleUiRoleChange(v as PersonaUiRole)} required>
                                        <SelectTrigger className={PROPERTY_FIELD_CLASS} aria-label="Role">
                                            <SelectValue placeholder="Empty" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="owner">Owner</SelectItem>
                                            <SelectItem value="contributor">Contributor</SelectItem>
                                            <SelectItem value="reviewer">Reviewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {selectedPersona && ROLE_SUMMARY[selectedPersona.slug] && (
                                        <p className={PROPERTY_HINT_CLASS}>{ROLE_SUMMARY[selectedPersona.slug]}</p>
                                    )}
                                </div>
                            </PropertyRow>

                            {/* Contributors come in two access levels; the others have one. */}
                            {uiRole === 'contributor' && (
                                <PropertyRow label="Access" icon={<KeyRound />}>
                                    <div className="flex items-center gap-0.5 px-1" role="radiogroup" aria-label="Access">
                                        {(['internal', 'external'] as const).map((sr) => {
                                            const persona = personas.find((p) => p.slug === resolvePersonaSlug('contributor', sr))
                                            return (
                                                <Hint key={sr} label={persona?.description || SUB_ROLE_LABEL[sr]} side="top">
                                                    <button
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={subRole === sr}
                                                        onClick={() => handleSubRoleChange(sr)}
                                                        className={cn(
                                                            'rounded-control px-2 py-1 text-small transition-colors',
                                                            subRole === sr ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                                                        )}
                                                    >
                                                        {SUB_ROLE_LABEL[sr]}
                                                    </button>
                                                </Hint>
                                            )
                                        })}
                                    </div>
                                </PropertyRow>
                            )}
                        </PropertyList>
                    </div>

                    <CreateDialogFooter
                        onCancel={() => onOpenChange(false)}
                        cancelDisabled={isSubmitting}
                        submitDisabled={isSubmitting || !selectedPersonaId || !email || !!emailError}
                        submitting={isSubmitting}
                        submitLabel="Send invitation"
                    />
                </form>
            </DialogContent>
        </Dialog>
    )
}
