'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteFirmMember } from '@/lib/actions/firm-members'
import { ShieldCheck } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

const fieldLabel = 'text-small font-medium text-fg-muted block mb-1'
const inputCls = 'border-line text-fg text-xs font-normal placeholder:text-fg-subtle rounded focus-visible:ring-2 focus-visible:ring-action/30 focus-visible:border-action disabled:opacity-50 disabled:cursor-not-allowed'

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
            <DialogContent className="sm:max-w-[480px] p-0 gap-0">
                <VisuallyHidden><DialogTitle>Invite Firm Administrator</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-line bg-surface flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded bg-surface-muted flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5 text-fg-muted" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-fg leading-tight">Invite Firm Administrator</p>
                        <p className="text-xs text-fg-muted mt-0.5">Send an invitation to join this firm as an administrator.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-5 space-y-3">
                        {error && (
                            <div className="bg-tag-red-bg border border-tag-red-bg text-tag-red-fg text-xs px-3 py-2 rounded">
                                {error}
                            </div>
                        )}

                        {/* Access notice */}
                        <div className="bg-surface border border-line rounded p-3 flex items-start gap-2.5">
                            <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                            <div>
                                <p className="text-xs font-semibold text-fg">Firm Administrator access</p>
                                <p className="text-caption text-fg-muted mt-0.5">
                                    This person will have full access to manage firm settings, members, and all client workspaces.
                                </p>
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="firm-invite-email" className={fieldLabel}>Email Address</label>
                            <Input
                                id="firm-invite-email"
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-line bg-surface flex items-center justify-end gap-3">
                        <Button type="button" variant="outline" className="rounded w-28" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="greenCta"
                            disabled={isSubmitting || !email.trim()}
                            className="rounded w-36 text-white"
                        >
                            {isSubmitting ? <LoadingSpinner size="sm" /> : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
