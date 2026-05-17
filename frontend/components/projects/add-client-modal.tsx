'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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

        if (isSandboxFirm) {
            return
        }

        // Commit any partially typed tag on submit
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
            // Keep user on the Clients list view after creation.
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
                    <Button
                        variant="blackCta"
                        type="button"
                        size="sm"
                        className="gap-2"
                    >
                        <UserPlus className="h-4 w-4" />
                        New Client
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[480px] border-slate-200 max-h-[90vh] overflow-y-auto p-6 pb-4">
                <DialogHeader>
                    <DialogTitle className="text-slate-900">Add Client</DialogTitle>
                    <DialogDescription className="text-slate-600">
                        Create a new client to organize engagements and projects within your firm.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    {isSandboxFirm && <SandboxInfoBanner />}
                    {error && (
                        <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-md">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="name" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Client Name <span className="text-slate-500">*</span>
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Acme Corp"
                            required={!isSandboxFirm}
                            disabled={isSandboxFirm || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-status" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Status</Label>
                        <Select
                            value={status}
                            onValueChange={(v) => setStatus(v as LwCrmClientStatus)}
                            disabled={isSandboxFirm || isLoading}
                        >
                            <SelectTrigger id="client-status" className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
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
                    <div className="space-y-2">
                        <Label htmlFor="industry" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Industry (optional)
                        </Label>
                        <Input
                            id="industry"
                            value={industry}
                            onChange={(e) => setIndustry(e.target.value)}
                            placeholder="e.g. Technology"
                            disabled={isSandboxFirm || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="website" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Website (optional)
                        </Label>
                        <Input
                            id="website"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://…"
                            disabled={isSandboxFirm || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Description (optional)
                        </Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Notes about this client"
                            rows={2}
                            disabled={isSandboxFirm || isLoading}
                            className="min-h-[52px] border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="linkedin-url" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            <span className="inline-flex items-center gap-1"><Linkedin className="h-3.5 w-3.5" /> Company LinkedIn (optional)</span>
                        </Label>
                        <Input
                            id="linkedin-url"
                            value={linkedInUrl}
                            onChange={(e) => setLinkedInUrl(e.target.value)}
                            placeholder="https://linkedin.com/company/…"
                            disabled={isSandboxFirm || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="company-size" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            <span className="inline-flex items-center gap-1"><Users2 className="h-3.5 w-3.5" /> Company size (optional)</span>
                        </Label>
                        <SelectWithCustomEntry
                            id="company-size"
                            value={companySizeBracket}
                            onChange={setCompanySizeBracket}
                            options={['<10', '11–50', '51–200', '201–1000', '1000+']}
                            placeholder="Select size bracket…"
                            customEntryHint="Custom…"
                            disabled={isSandboxFirm || isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="billing-address" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Billing address (optional)</span>
                        </Label>
                        <Textarea
                            id="billing-address"
                            value={billingAddress}
                            onChange={(e) => setBillingAddress(e.target.value)}
                            placeholder={"123 Main St\nCity, State ZIP\nCountry"}
                            rows={2}
                            disabled={isSandboxFirm || isLoading}
                            className="min-h-[52px] border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tags" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Tags (optional)
                        </Label>
                        <div
                            className={`flex flex-wrap gap-1.5 min-h-[38px] w-full rounded-md border px-3 py-2 text-sm transition-colors
                                ${isSandboxFirm || isLoading
                                    ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                                    : 'border-slate-200 bg-white focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-0 focus-within:border-slate-900'
                                }`}
                            onClick={() => tagInputRef.current?.focus()}
                        >
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                                >
                                    {tag}
                                    {!isSandboxFirm && !isLoading && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                                            className="text-slate-400 hover:text-slate-700 transition-colors"
                                            aria-label={`Remove ${tag}`}
                                        >
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
                                placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma' : ''}
                                disabled={isSandboxFirm || isLoading}
                                className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-slate-400 text-slate-900 disabled:cursor-not-allowed"
                            />
                            <CornerDownLeft className="h-3.5 w-3.5 text-emerald-500 shrink-0 self-center ml-1" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Client since (optional)
                        </Label>
                        <DateTimePicker
                            value={clientSinceDate}
                            onChange={setClientSinceDate}
                            placeholder="Select date"
                            disabled={isSandboxFirm || isLoading}
                            defaultTime="00:00"
                        />
                    </div>
                    {status === 'PROSPECT' && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="lead-source" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                                    Lead source (optional)
                                </Label>
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
                            <div className="space-y-2">
                                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                                    Follow-up date (optional)
                                </Label>
                                <DateTimePicker
                                    value={followUpDate}
                                    onChange={setFollowUpDate}
                                    placeholder="Select date"
                                    disabled={isSandboxFirm || isLoading}
                                    defaultTime="09:00"
                                />
                            </div>
                        </>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button
                            variant="blackCta"
                            type="submit"
                            disabled={isSandboxFirm || isLoading || !name.trim()}
                        >
                            {isLoading && <LoadingSpinner size="sm" />}
                            Create Client
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    )
}
