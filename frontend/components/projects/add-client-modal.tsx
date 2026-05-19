'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UserPlus, X, CornerDownLeft, Linkedin, Users2, MapPin } from "lucide-react"
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
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-[#069668] focus-visible:border-[#069668] disabled:opacity-50 disabled:cursor-not-allowed'

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
    const [clientSinceDate, setClientSinceDate] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [error, setError] = useState<string | null>(null)

    const router = useRouter()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)

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

        if (isSandboxFirm) return

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
                clientSinceDate: clientSinceDate || null,
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
            setClientSinceDate('')
            setLinkedInUrl('')
            setCompanySizeBracket('')
            setBillingAddress('')
            setError(null)

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
                <DialogContent className="sm:max-w-[620px] border-[#e5e7eb] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[2px]">

                    <VisuallyHidden><DialogTitle>New Client</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded bg-[#ecfdf5] flex items-center justify-center shrink-0">
                            <UserPlus className="h-3.5 w-3.5 text-[#069668]" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Client</p>
                            <p className="text-xs text-[#45474c] mt-0.5">Create a new client record within your firm.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="p-5 space-y-4">
                            {isSandboxFirm && <SandboxInfoBanner />}
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                    {error}
                                </div>
                            )}

                            {/* Client Name */}
                            <div>
                                <label htmlFor="name" className={fieldLabel}>
                                    Client name <span className="text-red-500 normal-case tracking-normal font-sans">*</span>
                                </label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Acme Corp"
                                    required={!isSandboxFirm}
                                    disabled={isSandboxFirm || isLoading}
                                    className={inputCls}
                                />
                            </div>

                            {/* Status + Industry + Onboarding Date — 3 col */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label htmlFor="client-status" className={fieldLabel}>Status</label>
                                    <Select value={status} onValueChange={(v) => setStatus(v as LwCrmClientStatus)} disabled={isSandboxFirm || isLoading}>
                                        <SelectTrigger id="client-status" className={inputCls}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PROSPECT">Prospect</SelectItem>
                                            <SelectItem value="ACTIVE">Active</SelectItem>
                                            <SelectItem value="ON_HOLD">On hold</SelectItem>
                                            <SelectItem value="PAST">Past</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label htmlFor="industry" className={fieldLabel}>Industry <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                    <Input
                                        id="industry"
                                        value={industry}
                                        onChange={(e) => setIndustry(e.target.value)}
                                        placeholder="e.g. Technology"
                                        disabled={isSandboxFirm || isLoading}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={fieldLabel}>Onboarding date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                    <DateTimePicker
                                        value={clientSinceDate}
                                        onChange={setClientSinceDate}
                                        placeholder="Select date"
                                        disabled={isSandboxFirm || isLoading}
                                        defaultTime="00:00"
                                    />
                                </div>
                            </div>

                            {/* Website + Company Size — 2 col */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="website" className={fieldLabel}>Website <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                    <Input
                                        id="website"
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                        placeholder="https://…"
                                        disabled={isSandboxFirm || isLoading}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="company-size" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                                    </label>
                                    <SelectWithCustomEntry
                                        id="company-size"
                                        value={companySizeBracket}
                                        onChange={setCompanySizeBracket}
                                        options={['<10', '11–50', '51–200', '201–1000', '1000+']}
                                        placeholder="Select bracket…"
                                        customEntryHint="Custom…"
                                        disabled={isSandboxFirm || isLoading}
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label htmlFor="description" className={fieldLabel}>Description <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                <Textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Notes about this client"
                                    rows={2}
                                    disabled={isSandboxFirm || isLoading}
                                    className={`min-h-[52px] ${inputCls}`}
                                />
                            </div>

                            {/* LinkedIn */}
                            <div>
                                <label htmlFor="linkedin-url" className={fieldLabel}>
                                    <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> Company LinkedIn <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                                </label>
                                <Input
                                    id="linkedin-url"
                                    value={linkedInUrl}
                                    onChange={(e) => setLinkedInUrl(e.target.value)}
                                    placeholder="https://linkedin.com/company/…"
                                    disabled={isSandboxFirm || isLoading}
                                    className={inputCls}
                                />
                            </div>

                            {/* Billing address */}
                            <div>
                                <label htmlFor="billing-address" className={fieldLabel}>
                                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                                </label>
                                <Textarea
                                    id="billing-address"
                                    value={billingAddress}
                                    onChange={(e) => setBillingAddress(e.target.value)}
                                    placeholder={"123 Main St\nCity, State ZIP\nCountry"}
                                    rows={2}
                                    disabled={isSandboxFirm || isLoading}
                                    className={`min-h-[52px] ${inputCls}`}
                                />
                            </div>

                            {/* Tags */}
                            <div>
                                <label htmlFor="tags" className={fieldLabel}>Tags <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                <div
                                    className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-sm transition-colors cursor-text
                                        ${isSandboxFirm || isLoading
                                            ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed'
                                            : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-[#069668] focus-within:border-[#069668]'
                                        }`}
                                    onClick={() => tagInputRef.current?.focus()}
                                >
                                    {tags.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                                            {tag}
                                            {!isSandboxFirm && !isLoading && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                    <input
                                        ref={tagInputRef}
                                        id="tags"
                                        value={tagInput}
                                        onChange={handleTagChange}
                                        onKeyDown={handleTagKeyDown}
                                        onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }}
                                        placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma…' : ''}
                                        disabled={isSandboxFirm || isLoading}
                                        className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed"
                                    />
                                    <CornerDownLeft className="h-3 w-3 text-[#069668] shrink-0 self-center ml-1" />
                                </div>
                            </div>

                            {/* Prospect-only fields */}
                            {status === 'PROSPECT' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="lead-source" className={fieldLabel}>Lead source <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                        <SelectWithCustomEntry
                                            id="lead-source"
                                            value={leadSource}
                                            onChange={setLeadSource}
                                            options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']}
                                            placeholder="Select source…"
                                            customEntryHint="Other…"
                                            disabled={isSandboxFirm || isLoading}
                                        />
                                    </div>
                                    <div>
                                        <label className={fieldLabel}>Follow-up date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                        <DateTimePicker
                                            value={followUpDate}
                                            onChange={setFollowUpDate}
                                            placeholder="Select date"
                                            disabled={isSandboxFirm || isLoading}
                                            defaultTime="09:00"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" className="rounded-[2px]" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button
                                variant="greenCta"
                                type="submit"
                                disabled={isSandboxFirm || isLoading || !name.trim()}
                                className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase"
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
