'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteFirmMember } from '@/lib/actions/firm-members'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { ShieldCheck } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

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
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(orgSandbox?.sandboxOnly)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (isSandboxFirm) return
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
            <DialogContent className="sm:max-w-[480px] border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb]">
                <VisuallyHidden><DialogTitle>Invite Firm Administrator</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Invite Firm Administrator</p>
                        <p className="text-xs text-[#45474c] mt-0.5">Send an invitation to join this firm as an administrator.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-5 space-y-3">
                        {isSandboxFirm && <SandboxInfoBanner />}

                        {error && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                {error}
                            </div>
                        )}

                        {/* Access notice */}
                        <div className="bg-white border border-[#e5e7eb] rounded p-3 flex items-start gap-2.5">
                            <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                            <div>
                                <p className="text-xs font-semibold text-[#1b1b1d]">Firm Administrator access</p>
                                <p className="text-[10px] text-[#45474c] mt-0.5">
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
                                required={!isSandboxFirm}
                                disabled={isSandboxFirm}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3">
                        <Button type="button" variant="outline" className="rounded w-28 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="greenCta"
                            disabled={isSandboxFirm || isSubmitting || !email.trim()}
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
