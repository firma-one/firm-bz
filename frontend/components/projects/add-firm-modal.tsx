'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, Factory, FileText, Globe, Linkedin, Lock, MapPin, Plus, Users2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS } from "@/components/ui/property-list"
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from "@/components/ui/create-dialog"
import { SelectWithCustomEntry } from "@/components/ui/select-with-custom-entry"
import { OptionalFieldsSection } from "@/components/ui/optional-fields-toggle"
import { createFirm, updateFirm } from '@/lib/actions/firms'
import { firmPath } from '@/lib/navigation/firm-paths'


interface AddFirmModalProps {
    trigger?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /**
     * The group whose picker page this modal was opened from, if any — passed straight
     * through to createFirm() so the new firm attaches to THIS group, not an arbitrary
     * "first eligible group" pick. Omit only when there's no specific group in context.
     */
    groupSlug?: string
}

export function AddFirmModal({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange, groupSlug }: AddFirmModalProps) {
    const [capBlocked, setCapBlocked] = useState(false)
    const [capMessage, setCapMessage] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        const run = async () => {
            try {
                const response = await fetch(groupSlug ? `/api/billing/firm-gate?groupSlug=${encodeURIComponent(groupSlug)}` : '/api/billing/firm-gate')
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
    }, [groupSlug])

    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange as (open: boolean) => void) : setInternalOpen

    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showOptional, setShowOptional] = useState(false)


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
        setShowOptional(false)
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
            const newFirm = await createFirm({ name, groupSlug })
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
            router.push(newFirm.groupSlug ? firmPath(newFirm.groupSlug, newFirm.slug) : `/d/${newFirm.slug}`)
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
            <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> New firm
            </Button>
        )
    }

    return (
        <div className="inline-flex">
            <Dialog open={open} onOpenChange={handleOpenChange}>
                {!isControlled && <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>}

                <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
                    <CreateDialogHeader title="New firm" description="Add a firm to this workspace." />

                    <form onSubmit={handleCreate}>
                        <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                            {capBlocked && capMessage && <CreateDialogNotice message={capMessage} limit />}
                            {error && <CreateDialogNotice message={error} />}

                            {/* Same property rows as Firm Settings: create and edit look alike. */}
                            <PropertyList>
                                <PropertyRow label={<label htmlFor="cf-name">Firm name <span className="text-danger">*</span></label>} icon={<Building2 />}>
                                    <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Acme Consulting" disabled={isFormDisabled} required autoFocus className={PROPERTY_FIELD_CLASS} />
                                </PropertyRow>
                            </PropertyList>

                            <OptionalFieldsSection open={showOptional} onToggle={() => setShowOptional((v) => !v)}>
                                <PropertyList>
                                    <PropertyRow label={<label htmlFor="cf-industry">Industry</label>} icon={<Factory />}>
                                        <Input id="cf-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}
                                            placeholder="Empty" disabled={isFormDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-size">Company size</label>} icon={<Users2 />}>
                                        <SelectWithCustomEntry id="cf-size" value={companySizeBracket} onChange={setCompanySizeBracket}
                                            options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Empty"
                                            customEntryHint="Custom…" disabled={isFormDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-website">Website</label>} icon={<Globe />}>
                                        <Input id="cf-website" type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)}
                                            placeholder="https://…" disabled={isFormDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-linkedin">LinkedIn</label>} icon={<Linkedin />}>
                                        <Input id="cf-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)}
                                            placeholder="https://linkedin.com/company/…" disabled={isFormDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-billing">Billing address</label>} icon={<MapPin />}>
                                        <Textarea id="cf-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                                            placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={3}
                                            disabled={isFormDisabled} className={PROPERTY_TEXTAREA_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-notes">Notes</label>} icon={<FileText />}>
                                        <Textarea id="cf-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Additional details about the firm" rows={2}
                                            disabled={isFormDisabled} className={PROPERTY_TEXTAREA_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="cf-memo">Internal memo</label>} icon={<Lock />}>
                                        <div className="flex w-full flex-col gap-1">
                                            <Textarea id="cf-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)}
                                                placeholder="Private notes, context about this firm…" rows={2}
                                                disabled={isFormDisabled} className={PROPERTY_TEXTAREA_CLASS} />
                                            <p className={PROPERTY_HINT_CLASS}>Only firm admins see this.</p>
                                        </div>
                                    </PropertyRow>
                                </PropertyList>
                            </OptionalFieldsSection>
                        </div>

                        <CreateDialogFooter
                            onCancel={() => handleOpenChange(false)}
                            cancelDisabled={isDismissDisabled}
                            submitDisabled={isFormDisabled || !name.trim()}
                            submitting={creating}
                        />
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
