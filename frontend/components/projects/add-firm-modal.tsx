'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, FileText, Globe, Linkedin, Lock, MapPin, SquarePlus, Users2 } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SelectWithCustomEntry } from "@/components/ui/select-with-custom-entry"
import { createFirm, updateFirm } from '@/lib/actions/firms'

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

interface AddFirmModalProps {
    trigger?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function AddFirmModal({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: AddFirmModalProps) {
    const [capBlocked, setCapBlocked] = useState(false)
    const [capMessage, setCapMessage] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        const run = async () => {
            try {
                const response = await fetch('/api/billing/firm-gate')
                if (!response.ok) return
                const payload = (await response.json()) as { allowed?: boolean; reason?: string; cap?: number | null }
                if (!mounted) return
                const blocked = payload.allowed === false
                setCapBlocked(blocked)
                if (blocked) {
                    const cap = typeof payload.cap === 'number' ? payload.cap : null
                    setCapMessage(cap != null
                        ? `You have consumed the entitlements on your plan (${cap} of ${cap}). Upgrade to add more.`
                        : 'You have consumed the entitlements on your plan. Upgrade to add more.')
                } else {
                    setCapMessage(null)
                }
            } catch { /* best effort */ }
        }
        run()
        return () => { mounted = false }
    }, [])

    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange as (open: boolean) => void) : setInternalOpen

    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)


    // Details
    const [name, setName] = useState('')
    const [internalMemo, setInternalMemo] = useState('')
    const [industry, setIndustry] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')

    // Company
    const [companyWebsite, setCompanyWebsite] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [notes, setNotes] = useState('')

    const router = useRouter()

    const isFormDisabled = creating || capBlocked
    const isDismissDisabled = creating

    const resetForm = () => {
        setError(null)
        setName(''); setInternalMemo('')
        setIndustry(''); setCompanySizeBracket('')
        setCompanyWebsite(''); setLinkedInUrl('')
        setBillingAddress(''); setNotes('')
    }

    const handleOpenChange = (newOpen: boolean) => {
        if (isDismissDisabled) return
        setOpen(newOpen)
        if (!newOpen) resetForm()
    }

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (capBlocked) return
        setCreating(true)
        setError(null)
        try {
            const newFirm = await createFirm({ name })
            await updateFirm(newFirm.slug, {
                internalMemo: internalMemo.trim() || null,
                industry: industry.trim() || null,
                companySizeBracket: companySizeBracket || null,
                companyWebsite: companyWebsite.trim() || null,
                linkedInUrl: linkedInUrl.trim() || null,
                billingAddress: billingAddress.trim() || null,
                notes: notes.trim() || null,
            })
            setOpen(false)
            resetForm()
            router.push(`/d/f/${newFirm.slug}`)
            router.refresh()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create firm')
        } finally {
            setCreating(false)
        }
    }

    const renderTrigger = () => {
        if (trigger && React.isValidElement(trigger)) return trigger
        return (
            <Button variant="blackCta" size="sm" className="gap-2">
                <SquarePlus className="h-4 w-4" /> New Firm
            </Button>
        )
    }

    return (
        <div className="inline-flex">
            <Dialog open={open} onOpenChange={handleOpenChange}>
                {!isControlled && <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>}

                <DialogContent className="sm:max-w-[860px] border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb] max-h-[90vh] overflow-y-auto">
                    <VisuallyHidden><DialogTitle>New Firm</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3 sticky top-0 z-10">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Firm</p>
                            <p className="text-xs text-[#45474c] mt-0.5">Fill in the details and click Create.</p>
                        </div>
                    </div>

                    {capBlocked && capMessage && (
                        <div className="mx-4 mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                            <span>
                                {capMessage.split('Upgrade')[0]}
                                <Link href="/d/billing" className="font-semibold underline underline-offset-2 hover:text-rose-900">Upgrade</Link>
                                {capMessage.split('Upgrade')[1]}
                            </span>
                        </div>
                    )}
                    {error && (
                        <div className="mx-4 mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleCreate}>
                        <div className="p-4">
                            <div className="grid grid-cols-2 gap-4 items-stretch">

                                {/* LEFT — Details */}
                                <div className="flex flex-col">
                                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3 flex-1">
                                        <p className={fieldLabel}>Details</p>
                                        <div>
                                            <label htmlFor="cf-name" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Firm name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                                            </label>
                                            <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)}
                                                placeholder="e.g. Acme Consulting" disabled={isFormDisabled} required autoFocus className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="cf-memo" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Internal memo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— internal only</span></span>
                                            </label>
                                            <textarea id="cf-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)}
                                                placeholder="Private notes, context about this firm…" rows={2}
                                                disabled={isFormDisabled} className={textareaCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="cf-industry" className={fieldLabel}><span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span></label>
                                            <Input id="cf-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}
                                                placeholder="e.g. Technology" disabled={isFormDisabled} className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="cf-size" className={fieldLabel}><span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span></label>
                                            <SelectWithCustomEntry id="cf-size" value={companySizeBracket} onChange={setCompanySizeBracket}
                                                options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…"
                                                customEntryHint="Custom…" disabled={isFormDisabled} />
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT — Company */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-4 flex flex-col gap-3 h-full">
                                    <p className={fieldLabel}>Company</p>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-website" className={fieldLabel}><span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span></label>
                                        <Input id="cf-website" type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)}
                                            placeholder="https://…" disabled={isFormDisabled} className={inputCls} />
                                    </div>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-linkedin" className={fieldLabel}><span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span></label>
                                        <Input id="cf-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)}
                                            placeholder="https://linkedin.com/company/…" disabled={isFormDisabled} className={inputCls} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="cf-billing" className={fieldLabel}><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span></label>
                                        <textarea id="cf-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                                            placeholder={"123 Main St\nCity, State ZIP\nCountry"}
                                            disabled={isFormDisabled} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="cf-notes" className={fieldLabel}><span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span></label>
                                        <textarea id="cf-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Additional details about the firm"
                                            disabled={isFormDisabled} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3 sticky bottom-0">
                            <Button type="button" variant="outline"
                                className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase"
                                onClick={() => handleOpenChange(false)}
                                disabled={isDismissDisabled}>
                                Cancel
                            </Button>
                            <Button type="submit"
                                variant="greenCta"
                                disabled={isFormDisabled || !name.trim()}
                                className="rounded w-40 text-[10px] font-headline font-bold tracking-widest uppercase">
                                {creating ? <LoadingSpinner size="sm" /> : 'Create'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
