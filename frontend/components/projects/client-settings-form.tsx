'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateClient, deleteClient, type LwCrmClientStatus } from '@/lib/actions/client'
import { getFirmMembers } from '@/lib/actions/firm-members'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, ChevronDown, Lock, Linkedin, Users2, MapPin, X, CornerDownLeft } from 'lucide-react'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface ClientSettingsFormProps {
    orgSlug: string
    firmId?: string
    clientSlug: string
    initialName: string
    initialIndustry?: string
    initialStatus?: LwCrmClientStatus
    initialWebsite?: string
    initialDescription?: string
    initialTags?: string[]
    initialOwnerId?: string | null
    initialFollowUpDate?: string
    initialExpectedCloseDate?: string
    initialLeadSource?: string
    initialInternalMemo?: string
    initialClientSinceDate?: string
    initialLinkedInUrl?: string
    initialCompanySizeBracket?: string
    initialBillingAddress?: string
    firmSandboxOnly?: boolean
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

export function ClientSettingsForm({
    orgSlug,
    firmId,
    clientSlug,
    initialName,
    initialIndustry = '',
    initialStatus = 'ACTIVE',
    initialWebsite = '',
    initialDescription = '',
    initialTags = [],
    initialOwnerId = null,
    initialFollowUpDate = '',
    initialExpectedCloseDate = '',
    initialLeadSource = '',
    initialInternalMemo = '',
    initialClientSinceDate = '',
    initialLinkedInUrl = '',
    initialCompanySizeBracket = '',
    initialBillingAddress = '',
    firmSandboxOnly = false,
    onSaved,
}: ClientSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [name, setName] = useState(initialName)
    const [industry, setIndustry] = useState(initialIndustry)
    const [status, setStatus] = useState<LwCrmClientStatus>(initialStatus)
    const [website, setWebsite] = useState(initialWebsite)
    const [description, setDescription] = useState(initialDescription)
    const [tags, setTags] = useState<string[]>(initialTags)
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [ownerId, setOwnerId] = useState<string | null>(initialOwnerId ?? null)
    const [followUpDate, setFollowUpDate] = useState(initialFollowUpDate)
    const [expectedCloseDate, setExpectedCloseDate] = useState(initialExpectedCloseDate)
    const [leadSource, setLeadSource] = useState(initialLeadSource)
    const [internalMemo, setInternalMemo] = useState(initialInternalMemo)
    const [clientSinceDate, setClientSinceDate] = useState(initialClientSinceDate)
    const [linkedInUrl, setLinkedInUrl] = useState(initialLinkedInUrl)
    const [companySizeBracket, setCompanySizeBracket] = useState(initialCompanySizeBracket)
    const [billingAddress, setBillingAddress] = useState(initialBillingAddress)
    const [memberOptions, setMemberOptions] = useState<{ userId: string; label: string }[]>([])
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [dangerOpen, setDangerOpen] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    useEffect(() => {
        setName(initialName)
        setIndustry(initialIndustry ?? '')
        setStatus(initialStatus ?? 'ACTIVE')
        setWebsite(initialWebsite ?? '')
        setDescription(initialDescription ?? '')
        setTags(initialTags)
        setOwnerId(initialOwnerId ?? null)
        setFollowUpDate(initialFollowUpDate ?? '')
        setExpectedCloseDate(initialExpectedCloseDate ?? '')
        setLeadSource(initialLeadSource ?? '')
        setInternalMemo(initialInternalMemo ?? '')
        setClientSinceDate(initialClientSinceDate ?? '')
        setLinkedInUrl(initialLinkedInUrl ?? '')
        setCompanySizeBracket(initialCompanySizeBracket ?? '')
        setBillingAddress(initialBillingAddress ?? '')
    }, [initialName, initialIndustry, initialStatus, initialWebsite, initialDescription, initialTags, initialOwnerId, initialFollowUpDate, initialExpectedCloseDate, initialLeadSource, initialInternalMemo, initialClientSinceDate, initialLinkedInUrl, initialCompanySizeBracket, initialBillingAddress])

    useEffect(() => {
        if (!firmId) return
        getFirmMembers(firmId)
            .then((res) => setMemberOptions(res.members.map((m) => ({ userId: m.userId, label: m.user?.name || m.user?.email || m.userId }))))
            .catch(() => setMemberOptions([]))
    }, [firmId])

    const commitTag = (raw: string) => {
        const value = raw.trim().toLowerCase().replace(/\s+/g, '-')
        if (value && !tags.includes(value)) setTags((prev) => [...prev, value])
        setTagInput('')
    }
    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); commitTag(tagInput) }
        else if (e.key === ',') { e.preventDefault(); commitTag(tagInput) }
        else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1))
    }
    const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val.endsWith(',')) commitTag(val.slice(0, -1))
        else setTagInput(val)
    }
    const removeTag = (tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag))
        tagInputRef.current?.focus()
    }

    const handleSave = async () => {
        if (isSandboxFirm) return
        setSaving(true)
        try {
            await updateClient(orgSlug, clientSlug, {
                name,
                industry: industry || undefined,
                status,
                website: website.trim() || null,
                description: description.trim() || null,
                tags: tagInput.trim() ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')] : tags,
                ownerId,
                followUpDate: followUpDate || null,
                expectedCloseDate: expectedCloseDate || null,
                leadSource: leadSource || null,
                internalMemo: internalMemo.trim() || null,
                clientSinceDate: clientSinceDate || null,
                linkedInUrl: linkedInUrl.trim() || null,
                companySizeBracket: companySizeBracket || null,
                billingAddress: billingAddress.trim() || null,
            })
            addToast({ type: 'success', title: 'Saved', message: 'Client details updated.' })
            window.dispatchEvent(new CustomEvent('firma-reminders-updated'))
            onSaved?.()
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Update failed', message: e instanceof Error ? e.message : 'Could not update client.' })
        } finally {
            setSaving(false)
        }
    }

    const performDeleteClient = async () => {
        if (isSandboxFirm) return
        setDeleting(true)
        try {
            await deleteClient(orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Client deleted', message: 'Client has been removed.' })
            setDeleteConfirmOpen(false)
            onSaved?.()
            router.push(`/d/f/${orgSlug}?tab=clients`)
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Could not delete client.' })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            {isSandboxFirm && <SandboxInfoBanner />}

            {/* Tile grid */}
            <div className="grid grid-cols-3 gap-3">

                {/* IDENTITY — col-span-2 */}
                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Identity</p>

                    {/* Status + Onboarding date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="client-status" className={fieldLabel}>Status</label>
                            <Select value={status} onValueChange={(v) => setStatus(v as LwCrmClientStatus)} disabled={isSandboxFirm}>
                                <SelectTrigger id="client-status" className={inputCls}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-[#e5e7eb] shadow-sm rounded">
                                    <SelectItem value="PROSPECT">Prospect</SelectItem>
                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                    <SelectItem value="ON_HOLD">On hold</SelectItem>
                                    <SelectItem value="PAST">Past</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className={fieldLabel}>Onboarding date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                            <DateTimePicker value={clientSinceDate} onChange={setClientSinceDate} placeholder="Select date" disabled={isSandboxFirm} defaultTime="00:00" />
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label htmlFor="client-name" className={fieldLabel}>Name</label>
                        <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" disabled={isSandboxFirm} className={inputCls} />
                    </div>

                    {/* Industry + Website */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="client-industry" className={fieldLabel}>Industry <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                            <Input id="client-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Technology" disabled={isSandboxFirm} className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="client-website" className={fieldLabel}>Website <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                            <Input id="client-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" disabled={isSandboxFirm} className={inputCls} />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="client-description" className={fieldLabel}>Description / notes <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <textarea id="client-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes about this client" rows={3} disabled={isSandboxFirm} className={textareaCls} />
                    </div>

                    {/* Tags */}
                    <div>
                        <label htmlFor="client-tags" className={fieldLabel}>Tags <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <div
                            className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-sm transition-colors cursor-text ${isSandboxFirm ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed' : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'}`}
                            onClick={() => tagInputRef.current?.focus()}
                        >
                            {tags.map((tag) => (
                                <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                                    {tag}
                                    {!isSandboxFirm && (
                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </span>
                            ))}
                            <input ref={tagInputRef} id="client-tags" value={tagInput} onChange={handleTagChange} onKeyDown={handleTagKeyDown} onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }} placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma…' : ''} disabled={isSandboxFirm} className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed" />
                            <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
                        </div>
                    </div>
                </div>

                {/* COMPANY — col-span-1 */}
                <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Company</p>

                    {/* LinkedIn */}
                    <div>
                        <label htmlFor="client-linkedin" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                        </label>
                        <Input id="client-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/company/…" disabled={isSandboxFirm} className={inputCls} />
                    </div>

                    {/* Company size */}
                    <div>
                        <label htmlFor="client-company-size" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                        </label>
                        <SelectWithCustomEntry id="client-company-size" value={companySizeBracket} onChange={setCompanySizeBracket} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…" customEntryHint="Custom…" disabled={isSandboxFirm} />
                    </div>

                    {/* Billing address */}
                    <div>
                        <label htmlFor="client-billing-address" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></span>
                        </label>
                        <textarea id="client-billing-address" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={3} disabled={isSandboxFirm} className={textareaCls} />
                    </div>

                    {/* Internal memo */}
                    <div>
                        <label htmlFor="client-internal-memo" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1">
                                Internal memo
                                <span className="inline-flex items-center gap-0.5 normal-case tracking-normal font-sans text-[#9a9ba0]"><Lock className="h-2.5 w-2.5" /> internal</span>
                            </span>
                        </label>
                        <textarea id="client-internal-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)} placeholder="Private notes, call summaries, relationship context…" rows={3} disabled={isSandboxFirm} className={textareaCls} />
                        <p className="mt-1 text-[10px] text-[#9a9ba0]">Not visible to client portal users.</p>
                    </div>
                </div>

                {/* PROSPECT fields — full width, conditional */}
                {status === 'PROSPECT' && (
                    <div className="col-span-3 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className={fieldLabel}>Prospect CRM</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label htmlFor="client-lead-source" className={fieldLabel}>Lead source <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                <SelectWithCustomEntry id="client-lead-source" value={leadSource} onChange={setLeadSource} options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']} placeholder="Select source…" customEntryHint="Other…" disabled={isSandboxFirm} />
                            </div>
                            <div>
                                <label className={fieldLabel}>Follow-up date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                <DateTimePicker value={followUpDate} onChange={setFollowUpDate} placeholder="Select date" disabled={isSandboxFirm} defaultTime="09:00" />
                                <p className="mt-1 text-[10px] text-[#9a9ba0]">When to next follow up?</p>
                            </div>
                            <div>
                                <label className={fieldLabel}>Expected close date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                                <DateTimePicker value={expectedCloseDate} onChange={setExpectedCloseDate} placeholder="Select date" disabled={isSandboxFirm} defaultTime="17:00" />
                                <p className="mt-1 text-[10px] text-[#9a9ba0]">When do you expect to convert?</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-3">
                <Button type="button" variant="outline" className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => router.push(`/d/f/${orgSlug}/c/${clientSlug}?tab=projects`)}>
                    Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSandboxFirm || saving} variant="greenCta" className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>

            {/* Danger zone — collapsible */}
            <section className="border border-red-200 rounded overflow-hidden">
                <button type="button" onClick={() => setDangerOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between bg-red-50/60 hover:bg-red-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-red-700">Danger zone</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-red-500 transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                </button>
                {dangerOpen && (
                    <div className="p-4 border-t border-red-200 bg-red-50/40 space-y-3">
                        <p className="text-xs text-[#45474c]">Permanently delete this client. All engagements and members will be removed. This cannot be undone.</p>
                        <Button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={isSandboxFirm || deleting} className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase">
                            {deleting ? 'Deleting…' : 'Delete client'}
                        </Button>
                    </div>
                )}
            </section>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Delete client?</DialogTitle>
                        <DialogDescription>
                            Permanently delete this client? All engagements and members will be removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="rounded-[2px]" disabled={deleting} onClick={() => setDeleteConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" disabled={isSandboxFirm || deleting} onClick={() => void performDeleteClient()} className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase">
                            {deleting ? 'Deleting…' : 'Delete client'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
