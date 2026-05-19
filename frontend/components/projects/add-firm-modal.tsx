'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SquarePlus, Building2 } from "lucide-react"
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
            <DialogContent className="sm:max-w-[425px] border-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <SquarePlus className="h-4 w-4 text-slate-600" />
                        <Building2 className="h-4 w-4 text-slate-600" />
                        <span>Create New Firm</span>
                    </DialogTitle>
                    <DialogDescription className="text-slate-600">
                        Create a new Firm workspace. You will be set as the Firm Administrator.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className='text-slate-900'>Firm Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Acme Consulting"
                                disabled={isLoading}
                                required
                                autoFocus
                                className="border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 selection:bg-slate-200 selection:text-slate-900 focus-visible:border-slate-300 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgb(255,255,255)]"
                            />
                        </div>
                        <div className="grid gap-3 border-t border-slate-200 pt-4">
                            <h4 className="font-semibold text-slate-900">Allow domain access</h4>
                            <p className="text-sm text-slate-600">
                                Enabling access allows users with email address with this domain to join the workspace without an invitation.
                            </p>
                            <div className="flex items-center justify-between gap-4">
                                <Label htmlFor="allow-domain" className="text-sm font-normal text-slate-900 cursor-pointer flex-1">
                                    Enable access for {allowedEmailDomain || 'your domain'}
                                </Label>
                                <Switch
                                    id="allow-domain"
                                    checked={allowDomainAccess}
                                    onCheckedChange={setAllowDomainAccess}
                                    disabled={isLoading}
                                />
                            </div>
                            {allowDomainAccess && (
                                <div className="grid gap-2">
                                    <Label htmlFor="domain" className="text-sm text-slate-700">Email domain</Label>
                                    <Input
                                        id="domain"
                                        value={allowedEmailDomain}
                                        onChange={(e) => setAllowedEmailDomain(e.target.value)}
                                        placeholder="e.g., acme.com"
                                        disabled={isLoading}
                                        className="font-mono text-sm border-slate-200 bg-white text-slate-900 shadow-sm selection:bg-slate-200 selection:text-slate-900 focus-visible:border-slate-300 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgb(255,255,255)]"
                                    />
                                    {isPublicDomain && (
                                        <p className="text-xs text-slate-500">
                                            Public email domains (e.g. gmail.com) are not recommended for firm access.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        {error && (
                            <p className="text-sm text-red-600">{error}</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button variant="blackCta" type="submit" disabled={isLoading || !name.trim()}>
                            {isLoading ? (
                                <>
                                    <LoadingSpinner size="sm" className="mr-2" />
                                    Creating...
                                </>
                            ) : (
                                'Create Firm'
                            )}
                        </Button>
                    </DialogFooter>
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
