'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UserPlus, X, CornerDownLeft, Linkedin, Users2, MapPin, User, Activity, Share2, CalendarCheck, CalendarClock, Building2, Globe, FileText, Tag, Lock } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SandboxInfoBanner } from "@/components/ui/sandbox-info-banner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { SelectWithCustomEntry } from "@/components/ui/select-with-custom-entry"
import { OptionalFieldsSection } from "@/components/ui/optional-fields-toggle"
import { createClient, type LwCrmClientStatus } from '@/lib/actions/client'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'

interface AddClientModalProps {
    orgSlug: string
    firmId?: string
    /** Server-known flag so sandbox is enforced before client fetch completes */
    firmSandboxOnly?: boolean
    trigger?: React.ReactNode
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

export function AddClientModal({ orgSlug, firmId, firmSandboxOnly = false, trigger, onSaved }: AddClientModalProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [industry, setIndustry] = useState('')
    const [status, setStatus] = useState<LwCrmClientStatus>('ACTIVE')
    const [website, setWebsite] = useState('')
    const [description, setDescription] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [leadSource, setLeadSource] = useState('')
    const [followUpDate, setFollowUpDate] = useState('')
    const [expectedCloseDate, setExpectedCloseDate] = useState('')
    const [clientSinceDate, setClientSinceDate] = useState('')
    const [internalMemo, setInternalMemo] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [capBlocked, setCapBlocked] = useState(false)
    const [capMessage, setCapMessage] = useState<string | null>(null)
    const [showOptional, setShowOptional] = useState(false)

    const router = useRouter()

    useEffect(() => {
        let mounted = true
        const run = async () => {
            try {
                const response = await fetch(`/api/billing/client-gate?firmSlug=${encodeURIComponent(orgSlug)}`)
                if (!response.ok) return
                const payload = (await response.json()) as { allowed?: boolean; cap?: number | null; count?: number }
                if (!mounted) return
                const blocked = payload.allowed === false
                setCapBlocked(blocked)
                if (blocked) {
                    const cap = typeof payload.cap === 'number' ? payload.cap : null
                    const count = typeof payload.count === 'number' ? payload.count : null
                    setCapMessage(cap != null && count != null
                        ? `You have consumed the entitlements on your plan (${count} of ${cap}). Upgrade to add more.`
                        : 'You have consumed the entitlements on your plan. Upgrade to add more.')
                } else {
                    setCapMessage(null)
                }
            } catch { /* best effort */ }
        }
        run()
        return () => { mounted = false }
    }, [orgSlug])

    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const isDisabled = isSandboxFirm || isLoading || capBlocked

    const commitTag = (raw: string) => {
        const value = raw.trim().toLowerCase().replace(/\s+/g, '-')
        if (value && !tags.includes(value)) {
            setTags((prev) => [...prev, value])
        }
        setTagInput('')
    }

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            commitTag(tagInput)
        } else if (e.key === ',') {
            e.preventDefault()
            commitTag(tagInput)
        } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
            setTags((prev) => prev.slice(0, -1))
        }
    }

    const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val.endsWith(',')) {
            commitTag(val.slice(0, -1))
        } else {
            setTagInput(val)
        }
    }

    const removeTag = (tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag))
        tagInputRef.current?.focus()
    }

    const wrapTrigger = (node: React.ReactNode): React.ReactNode => {
        if (!React.isValidElement(node)) return node
        const el = node as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
        return React.cloneElement(el, {
            onClick: (e: React.MouseEvent) => {
                el.props.onClick?.(e)
                if (e.defaultPrevented) return
                setOpen(true)
            },
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (isSandboxFirm || capBlocked) return

        const finalTags = tagInput.trim()
            ? Array.from(new Set([...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')]))
            : tags

        setIsLoading(true)
        setError(null)

        try {
            await createClient(orgSlug, {
                name,
                industry: industry || undefined,
                status,
                website: website.trim() || undefined,
                description: description.trim() || undefined,
                tags: finalTags,
                leadSource: leadSource || null,
                followUpDate: followUpDate || null,
                expectedCloseDate: expectedCloseDate || null,
                clientSinceDate: clientSinceDate || null,
                internalMemo: internalMemo.trim() || null,
                linkedInUrl: linkedInUrl.trim() || null,
                companySizeBracket: companySizeBracket || null,
                billingAddress: billingAddress.trim() || null,
            })
            setOpen(false)
            setName('')
            setIndustry('')
            setStatus('ACTIVE')
            setWebsite('')
            setDescription('')
            setTags([])
            setTagInput('')
            setLeadSource('')
            setFollowUpDate('')
            setExpectedCloseDate('')
            setClientSinceDate('')
            setInternalMemo('')
            setLinkedInUrl('')
            setCompanySizeBracket('')
            setBillingAddress('')
            setError(null)
            setShowOptional(false)

            window.dispatchEvent(new CustomEvent('firma-reminders-updated'))
            router.push(`/d/f/${orgSlug}?tab=clients`, { scroll: false })
            onSaved?.()
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Failed to create client")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            {wrapTrigger(
                trigger || (
                    <Button variant="greenCta" type="button" size="sm" className="gap-2">
                        <UserPlus className="h-4 w-4" />
                        New Client
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[900px] border-[#e5e7eb] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded bg-[#f9f9fb]">

                    <VisuallyHidden><DialogTitle>New Client</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <UserPlus className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Client</p>
                            <p className="text-xs text-[#45474c] mt-0.5">Create a new client record within your firm.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="p-5">
                            {isSandboxFirm && <SandboxInfoBanner />}
                            {capBlocked && capMessage && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded mb-3 flex items-center gap-2">
                                    <Lock className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                                    <span>
                                        {capMessage.split('Upgrade')[0]}
                                        <Link href="/d/billing" className="font-semibold underline underline-offset-2 hover:text-rose-900">Upgrade</Link>
                                        {capMessage.split('Upgrade')[1]}
                                    </span>
                                </div>
                            )}
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded mb-3">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3">

                                {/* IDENTITY — always visible, mandatory fields */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-3 space-y-3">
                                    <p className={fieldLabel}>Identity</p>

                                    {/* Name (3/4) + Status (1/4) */}
                                    <div className="grid grid-cols-[3fr_1fr] gap-3">
                                        <div>
                                            <label htmlFor="new-client-name" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                                            </label>
                                            <Input id="new-client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" required={!isSandboxFirm} disabled={isDisabled} className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="new-client-status" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> Status <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                                            </label>
                                            <Select value={status} onValueChange={(v) => setStatus(v as LwCrmClientStatus)} disabled={isDisabled}>
                                                <SelectTrigger id="new-client-status" className={inputCls}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded border border-[#e5e7eb] bg-white shadow-md py-0.5 min-w-[var(--radix-select-trigger-width)]">
                                                    <SelectItem value="PROSPECT" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Prospect</SelectItem>
                                                    <SelectItem value="ACTIVE" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Active</SelectItem>
                                                    <SelectItem value="ON_HOLD" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">On hold</SelectItem>
                                                    <SelectItem value="PAST" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Past</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                </div>

                                <OptionalFieldsSection open={showOptional} onToggle={() => setShowOptional((v) => !v)}>
                                <div className="grid grid-cols-3 gap-3">

                                {/* COMPANY — col-span-1, row-span-2 */}
                                <div className="row-span-2 space-y-3">
                                    <p className={fieldLabel}>Company</p>

                                    <div>
                                        <label htmlFor="new-client-industry" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span>
                                        </label>
                                        <Input id="new-client-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Technology" disabled={isDisabled} className={inputCls} />
                                    </div>

                                    <div>
                                        <label htmlFor="new-client-company-size" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span>
                                        </label>
                                        <SelectWithCustomEntry id="new-client-company-size" value={companySizeBracket} onChange={setCompanySizeBracket} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select bracket…" customEntryHint="Custom…" disabled={isDisabled} />
                                    </div>

                                    <div>
                                        <label htmlFor="new-client-website" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span>
                                        </label>
                                        <Input id="new-client-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" disabled={isDisabled} className={inputCls} />
                                    </div>

                                    <div>
                                        <label htmlFor="new-client-linkedin" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span>
                                        </label>
                                        <Input id="new-client-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/company/…" disabled={isDisabled} className={inputCls} />
                                    </div>

                                    <div>
                                        <label htmlFor="new-client-billing" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span>
                                        </label>
                                        <textarea id="new-client-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={2} disabled={isDisabled} className={textareaCls} />
                                    </div>

                                    <div>
                                        <label htmlFor="new-client-description" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span>
                                        </label>
                                        <textarea id="new-client-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details about the client" rows={2} disabled={isDisabled} className={textareaCls} />
                                    </div>
                                </div>

                                {/* CRM — col-span-2 */}
                                <div className="col-span-2 space-y-3">
                                    <p className={fieldLabel}>CRM</p>

                                    {/* Row 1: Lead Source + Tags */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="new-client-lead-source" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> Lead source</span>
                                            </label>
                                            <SelectWithCustomEntry id="new-client-lead-source" value={leadSource} onChange={setLeadSource} options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']} placeholder="Select source…" customEntryHint="Other…" disabled={isDisabled} />
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">How did you acquire the lead?</p>
                                        </div>
                                        <div>
                                            <label htmlFor="new-client-tags" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</span>
                                            </label>
                                            <div
                                                className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 transition-colors cursor-text ${isDisabled ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed' : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'}`}
                                                onClick={() => tagInputRef.current?.focus()}
                                            >
                                                {tags.map((tag) => (
                                                    <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                                                        {tag}
                                                        {!isDisabled && (
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        )}
                                                    </span>
                                                ))}
                                                <input ref={tagInputRef} id="new-client-tags" value={tagInput} onChange={handleTagChange} onKeyDown={handleTagKeyDown} onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }} placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma…' : ''} disabled={isDisabled} className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed" />
                                                <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 2: Follow-up date + Lead Conversion Date (disabled when not PROSPECT) + Client Onboarding Date (disabled when PROSPECT) */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Follow-up date</span>
                                            </label>
                                            <DateTimePicker value={followUpDate} onChange={setFollowUpDate} placeholder="Select date" disabled={isDisabled} defaultTime="09:00" />
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When to next follow up?</p>
                                        </div>
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Lead conversion date</span>
                                            </label>
                                            <DateTimePicker value={expectedCloseDate} onChange={setExpectedCloseDate} placeholder="Select date" disabled={isDisabled || status !== 'PROSPECT'} defaultTime="17:00" />
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When do you expect to convert the lead?</p>
                                        </div>
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Client onboarding date</span>
                                            </label>
                                            <DateTimePicker value={clientSinceDate} onChange={setClientSinceDate} placeholder="Select date" disabled={isDisabled || status === 'PROSPECT'} defaultTime="00:00" />
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When did the formal business relationship start?</p>
                                        </div>
                                    </div>

                                    {/* Row 3: Internal Memo */}
                                    <div>
                                        <label htmlFor="new-client-memo" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Internal memo <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">— internal only</span></span>
                                        </label>
                                        <textarea id="new-client-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)} placeholder="Private notes, call summaries, relationship context…" rows={2} disabled={isDisabled} className={textareaCls} />
                                    </div>
                                </div>

                                </div>
                                </OptionalFieldsSection>

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button
                                variant="greenCta"
                                type="submit"
                                disabled={isDisabled || !name.trim()}
                                className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white"
                            >
                                {isLoading ? <LoadingSpinner size="sm" /> : 'Create'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
