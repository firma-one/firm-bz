'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Building2, SquarePlus } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { createFirm } from '@/lib/actions/firms'
import { useAuth } from '@/lib/auth-context'
import { useCanCreateAdditionalFirm } from '@/lib/hooks/use-can-create-additional-firm'
import { buildAppBillingHref } from '@/lib/billing/billing-links'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'

interface AddFirmModalProps {
    trigger?: React.ReactNode
    /** When provided with onOpenChange, the dialog is controlled (no trigger rendered). */
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
    'live.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com', 'zoho.com'
])

export function AddFirmModal({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: AddFirmModalProps) {
    const { user } = useAuth()
    const { canCreateAdditionalFirm, loadingEntitlement } = useCanCreateAdditionalFirm(user?.id)
    const addDisabled = !user?.id || loadingEntitlement || !canCreateAdditionalFirm
    const showUpgradeHint = Boolean(user?.id) && !loadingEntitlement && !canCreateAdditionalFirm

    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange as (open: boolean) => void) : setInternalOpen
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [allowDomainAccess, setAllowDomainAccess] = useState(true)
    const [allowedEmailDomain, setAllowedEmailDomain] = useState('')
    const [error, setError] = useState<string | null>(null)

    const router = useRouter()
    const pathname = usePathname()
    const billingHref = (() => {
        const m = pathname?.match(/\/d\/f\/([^/]+)/)
        const slug = m?.[1]
        if (!slug) return '/d/billing'
        const returnPath = validateCheckoutReturnTo(pathname ?? null) ?? `/d/f/${slug}`
        return buildAppBillingHref({ firmSlug: slug, returnPath })
    })()

    useEffect(() => {
        if (open && user?.email) {
            const domain = user.email.split('@')[1]?.toLowerCase() || ''
            if (domain) setAllowedEmailDomain((prev) => (prev || domain))
        }
    }, [open, user?.email])

    useEffect(() => {
        if (!isControlled) return
        if (open && addDisabled && !isLoading) {
            setOpen(false)
        }
    }, [isControlled, open, addDisabled, isLoading, setOpen])

    const isPublicDomain = allowedEmailDomain && PUBLIC_EMAIL_DOMAINS.has(allowedEmailDomain.toLowerCase())

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        const domain = allowDomainAccess ? (allowedEmailDomain?.trim() || null) : null
        try {
            const newFirm = await createFirm({
                name,
                allowDomainAccess: allowDomainAccess && !!domain,
                allowedEmailDomain: domain
            })
            setOpen(false)
            setName('')
            setError(null)
            
            // Navigate to the new firm
            router.push(`/d/f/${newFirm.slug}`)
            router.refresh()
        } catch (err: any) {
            setError(err.message || 'Failed to create firm')
        } finally {
            setIsLoading(false)
        }
    }

    const handleOpenChange = (newOpen: boolean) => {
        if (isLoading) return
        if (newOpen && addDisabled) {
            setOpen(false)
            return
        }
        setOpen(newOpen)
        if (!newOpen) {
            setName('')
            setAllowDomainAccess(true)
            setAllowedEmailDomain('')
            setError(null)
        }
    }

    const renderTrigger = () => {
        if (trigger && React.isValidElement(trigger)) {
            return React.cloneElement(
                trigger as React.ReactElement<{ disabled?: boolean }>,
                { disabled: addDisabled }
            )
        }
        return (
            <Button variant="blackCta" size="sm" className="gap-2" disabled={addDisabled}>
                <SquarePlus className="h-4 w-4" />
                New Firm
            </Button>
        )
    }

    return (
        <div className="inline-flex flex-col items-end gap-1">
            <Dialog open={open} onOpenChange={handleOpenChange}>
                {!isControlled && (
                    <DialogTrigger asChild>
                        {renderTrigger()}
                    </DialogTrigger>
                )}
            <DialogContent className="sm:max-w-[440px] border-[#e5e7eb] p-0 gap-0 rounded-[2px]">

                    <VisuallyHidden><DialogTitle>Create New Firm</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Create New Firm</p>
                            <p className="text-xs text-[#45474c] mt-0.5">Create a new Firm workspace. You will be set as the Firm Administrator.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="p-5 space-y-5">
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                    {error}
                                </div>
                            )}

                            {/* Firm Name */}
                            <div className="space-y-1.5">
                                <label className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block">
                                    Firm Name <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Acme Consulting"
                                    disabled={isLoading}
                                    required
                                    autoFocus
                                    className="border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                                />
                            </div>

                            {/* Domain Access */}
                            <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
                                <div>
                                    <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Allow Domain Access</p>
                                    <p className="text-xs text-[#9a9ba0] mt-1">
                                        Users with this email domain can join the workspace without an invitation.
                                    </p>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <Label htmlFor="allow-domain" className="text-xs text-[#1b1b1d] cursor-pointer flex-1">
                                        Enable access for <span className="font-semibold">{allowedEmailDomain || 'your domain'}</span>
                                    </Label>
                                    <Switch
                                        id="allow-domain"
                                        checked={allowDomainAccess}
                                        onCheckedChange={setAllowDomainAccess}
                                        disabled={isLoading}
                                    />
                                </div>
                                {allowDomainAccess && (
                                    <div className="space-y-1.5">
                                        <label className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block">
                                            Email Domain
                                        </label>
                                        <Input
                                            id="domain"
                                            value={allowedEmailDomain}
                                            onChange={(e) => setAllowedEmailDomain(e.target.value)}
                                            placeholder="e.g., acme.com"
                                            disabled={isLoading}
                                            className="font-mono border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                                        />
                                        {isPublicDomain && (
                                            <p className="text-xs text-[#9a9ba0]">
                                                Public email domains (e.g. gmail.com) are not recommended for firm access.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                className="!rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase border-gray-300"
                                onClick={() => handleOpenChange(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="greenCta"
                                type="submit"
                                disabled={isLoading || !name.trim()}
                                className="min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase"
                            >
                                {isLoading ? <LoadingSpinner size="sm" /> : 'Create Firm'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
            {!isControlled && showUpgradeHint && (
                <p className="text-xs text-slate-600 text-right max-w-[240px] leading-snug ml-auto">
                    {upgradeCopy.addFirmModalHint}{' '}
                    <Link
                        href={billingHref}
                        className="font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-800"
                    >
                        {upgradeCopy.ctaContinueBilling}
                    </Link>
                </p>
            )}
        </div>
    )
}
