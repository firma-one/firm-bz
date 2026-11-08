'use client'

import React, { useState } from 'react'
import { AtSign, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS } from '@/components/ui/property-list'
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from '@/components/ui/create-dialog'
import { inviteClientMember } from '@/lib/actions/client-members'
import { InviteeNameFields } from '@/components/projects/members/invitee-name-fields'
import { useToast } from '@/components/ui/toast'
import { failureReason } from '@/lib/files/action-failure'

interface ClientInviteModalProps {
    firmId: string
    clientId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function ClientInviteModal({ firmId, clientId, open, onOpenChange, onSuccess }: ClientInviteModalProps) {
    const [email, setEmail] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const { addToast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsSubmitting(true)
        try {
            const result = await inviteClientMember(firmId, clientId, email, { firstName, lastName })
            if (!result.ok) {
                setError(result.error)
                return
            }
            // Saved, but its email didn't go: the row reads Email failed, with Resend.
            if (result.warning) addToast({ type: 'warning', title: 'Invitation not emailed', message: result.warning })
            onSuccess()
            onOpenChange(false)
            setEmail('')
            setFirstName('')
            setLastName('')
        } catch (err: unknown) {
            setError(failureReason(err))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleOpenChange = (next: boolean) => {
        if (!next) setError('')
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
                <CreateDialogHeader title="Invite client administrator" description="Send an invitation to manage this client." />

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                        {error && <CreateDialogNotice message={error} />}

                        <PropertyList>
                            <PropertyRow label={<label htmlFor="client-invite-email">Email</label>} icon={<AtSign />}>
                                <Input
                                    id="client-invite-email"
                                    type="email"
                                    placeholder="admin@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    className={PROPERTY_FIELD_CLASS}
                                />
                            </PropertyRow>
                            <InviteeNameFields
                                idPrefix="client-invite"
                                firstName={firstName}
                                lastName={lastName}
                                onFirstNameChange={setFirstName}
                                onLastNameChange={setLastName}
                                disabled={isSubmitting}
                            />
                            <PropertyRow label="Role" icon={<ShieldCheck />}>
                                <div className="flex w-full flex-col gap-1">
                                    <span className="px-2 text-ui text-fg">Client administrator</span>
                                    <p className={PROPERTY_HINT_CLASS}>Can manage this client&apos;s settings and members.</p>
                                </div>
                            </PropertyRow>
                        </PropertyList>
                    </div>

                    <CreateDialogFooter
                        onCancel={() => handleOpenChange(false)}
                        cancelDisabled={isSubmitting}
                        submitDisabled={isSubmitting || !email.trim()}
                        submitting={isSubmitting}
                        submitLabel="Send invitation"
                    />
                </form>
            </DialogContent>
        </Dialog>
    )
}
