'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteClientMember } from '@/lib/actions/client-members'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

interface ClientInviteModalProps {
    firmId: string
    clientId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function ClientInviteModal({ firmId, clientId, open, onOpenChange, onSuccess }: ClientInviteModalProps) {
    const [email, setEmail] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(orgSandbox?.sandboxOnly)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (isSandboxFirm) return
        setIsSubmitting(true)
        try {
            await inviteClientMember(firmId, clientId, email)
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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Invite Client Administrator</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    {isSandboxFirm && <SandboxInfoBanner />}
                    <p className="text-sm text-slate-500">
                        Invite someone to join this client as a Client Administrator. They will be able to manage client settings and members.
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="client-invite-email" className={isSandboxFirm ? 'text-slate-500' : undefined}>
                            Email Address
                        </Label>
                        <Input
                            id="client-invite-email"
                            type="email"
                            placeholder="admin@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required={!isSandboxFirm}
                            disabled={isSandboxFirm}
                            className="disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
                    )}
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="blackCta" disabled={isSandboxFirm || isSubmitting || !email.trim()}>
                            {isSubmitting ? 'Sending...' : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
