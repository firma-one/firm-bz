'use client'

import React, { useState } from 'react'
import { AtSign, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS } from '@/components/ui/property-list'
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from '@/components/ui/create-dialog'
import { inviteFirmMember } from '@/lib/actions/firm-members'

interface FirmInviteModalProps {
    firmId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function FirmInviteModal({ firmId, open, onOpenChange, onSuccess }: FirmInviteModalProps) {
    const [email, setEmail] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsSubmitting(true)
        try {
            await inviteFirmMember(firmId, email)
            onSuccess()
            onOpenChange(false)
            setEmail('')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to send invitation')
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
                <CreateDialogHeader title="Invite firm administrator" description="Send an invitation to join this firm as an administrator." />

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                        {error && <CreateDialogNotice message={error} />}

                        <PropertyList>
                            <PropertyRow label={<label htmlFor="firm-invite-email">Email</label>} icon={<AtSign />}>
                                <Input
                                    id="firm-invite-email"
                                    type="email"
                                    placeholder="admin@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    className={PROPERTY_FIELD_CLASS}
                                />
                            </PropertyRow>
                            <PropertyRow label="Role" icon={<ShieldCheck />}>
                                <div className="flex w-full flex-col gap-1">
                                    <span className="px-2 text-ui text-fg">Firm administrator</span>
                                    <p className={PROPERTY_HINT_CLASS}>Full access to firm settings, members and every client workspace.</p>
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
