'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SquarePlus, Info, Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, FileText, Lock, Tag, X, CornerDownLeft } from "lucide-react"
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SandboxInfoBanner } from "@/components/ui/sandbox-info-banner"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { createProject, type LwCrmEngagementStatus } from '@/lib/actions/project'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

interface AddEngagementModalProps {
    firmSlug: string
    clientSlug: string
    firmSandboxOnly?: boolean
    trigger?: React.ReactNode
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

export function AddEngagementModal({ firmSlug, clientSlug, firmSandboxOnly = false, trigger, onSaved }: AddEngagementModalProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [status, setStatus] = useState<LwCrmEngagementStatus>('ACTIVE')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [contractType, setContractType] = useState('')
    const [rateOrValue, setRateOrValue] = useState('')
    const [internalMemo, setInternalMemo] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [error, setError] = useState<string | null>(null)
    const [capBlocked, setCapBlocked] = useState(false)
    const [capMessage, setCapMessage] = useState<string | null>(null)
    const [currencySymbol, setCurrencySymbol] = useState('')
    const router = useRouter()

    useEffect(() => {
        let mounted = true
        const run = async () => {
            try {
                const response = await fetch(`/api/billing/engagement-gate?firmSlug=${encodeURIComponent(firmSlug)}`)
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
    }, [firmSlug])

    useEffect(() => {
        let mounted = true
        fetch(`/api/firm?slug=${encodeURIComponent(firmSlug)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
                if (!mounted || !d) return
                const firm = d.firm ?? d
                const s = ((firm?.settings as Record<string, unknown>)?.currency as Record<string, string> | undefined)
                setCurrencySymbol(s?.symbol ?? '')
            })
            .catch(() => {})
        return () => { mounted = false }
    }, [firmSlug])

    const firmSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || firmSandbox?.sandboxOnly)
    const isDisabled = isSandboxFirm || capBlocked || isLoading

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSandboxFirm || capBlocked) return

        setIsLoading(true)
        setError(null)

        try {
            await createProject(firmSlug, clientSlug, {
                name,
                description: description || undefined,
                status,
                startDate: startDate ? new Date(startDate).toISOString() : undefined,
                endDate: endDate ? new Date(endDate).toISOString() : undefined,
                contractType: contractType.trim() || undefined,
                rateOrValue: rateOrValue.trim() || undefined,
                tags: tagInput.trim() ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')] : tags,
                internalMemo: internalMemo.trim() || null,
            })
            setOpen(false)
            setName('')
            setDescription('')
            setStatus('ACTIVE')
            setStartDate('')
            setEndDate('')
            setContractType('')
            setRateOrValue('')
            setTags([])
            setTagInput('')
            setInternalMemo('')
            setError(null)
            router.push(`/d/f/${firmSlug}/c/${clientSlug}?tab=projects`, { scroll: false })
            onSaved?.()
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Failed to create engagement")
        } finally {
            setIsLoading(false)
        }
    }

    const contractValueHint = contractType === 'Fixed Price' ? 'Total project fee'
        : contractType === 'Time & Material' ? 'Estimated total — leave blank if unknown'
        : contractType === 'Retainer' ? 'Total retainer value (e.g. 5 000/mo × 12 = 60 000)'
        : contractType === 'Milestone-Based' ? 'Sum of all milestone values'
        : contractType === 'Subscription / Recurring' ? 'Total value over engagement period'
        : contractType ? 'Total value of this engagement'
        : null

    return (
        <>
            {wrapTrigger(
                trigger || (
                    <Button variant="greenCta" type="button" size="sm" className="gap-2" disabled={capBlocked}>
                        <SquarePlus className="h-4 w-4" />
                        New Engagement
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[860px] border-[#e5e7eb] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[2px]">
                    <VisuallyHidden><DialogTitle>New Engagement</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <SquarePlus className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Engagement</p>
                            <p className="text-xs text-[#45474c] mt-0.5">Create a new engagement for this client.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="p-5 space-y-3 bg-[#f9f9fb]">
                            {isSandboxFirm && <SandboxInfoBanner />}
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                    {error}
                                </div>
                            )}
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

                            {/* Tile grid — mirrors Engagement Settings layout */}
                            <div className="grid grid-cols-3 gap-3 items-stretch">

                                {/* DETAILS — col-span-2, row 1 */}
                                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                    <p className={fieldLabel}>Details</p>

                                    {/* Name + Status */}
                                    <div className="grid grid-cols-[3fr_1fr] gap-3">
                                        <div>
                                            <label htmlFor="eng-name" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1">
                                                    <FileText className="h-3 w-3" /> Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span>
                                                </span>
                                            </label>
                                            <input
                                                id="eng-name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="e.g. Q1 Audit"
                                                required={!isSandboxFirm}
                                                disabled={isDisabled}
                                                className={`flex h-9 w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed`}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="eng-status" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1">
                                                    <Activity className="h-3 w-3" /> Status <span className="text-red-500 normal-case tracking-normal font-sans">*</span>
                                                </span>
                                            </label>
                                            <Select value={status} onValueChange={(v) => setStatus(v as LwCrmEngagementStatus)} disabled={isDisabled}>
                                                <SelectTrigger id="eng-status" className={inputCls}>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent side="bottom" align="start" sideOffset={6} className="border border-[#e5e7eb] bg-white shadow-sm rounded-[2px] py-0.5 min-w-[var(--radix-select-trigger-width)]">
                                                    <SelectItem value="PLANNED">Planned</SelectItem>
                                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                                    <SelectItem value="PAUSED">Paused</SelectItem>
                                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label htmlFor="eng-description" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Description</span>
                                        </label>
                                        <textarea
                                            id="eng-description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Brief engagement description"
                                            rows={2}
                                            disabled={isDisabled}
                                            className="flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                {/* COMMERCIAL — col-span-1, row-span-2 */}
                                <div className="row-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                    <p className={fieldLabel}>Commercial</p>

                                    {/* Contract type */}
                                    <div>
                                        <label htmlFor="ctype" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Contract type</span>
                                        </label>
                                        <SelectWithCustomEntry
                                            id="ctype"
                                            value={contractType}
                                            onChange={setContractType}
                                            options={['Fixed Price','Retainer','Time & Material','Case Management','Milestone-Based','Strategic Advisory','Success Fee','Subscription / Recurring']}
                                            placeholder="Select type…"
                                            customEntryHint="Other…"
                                            disabled={isDisabled}
                                        />
                                    </div>

                                    {/* Contract value */}
                                    <div>
                                        <label htmlFor="eng-rate" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" /> Contract value</span>
                                        </label>
                                        <div className={`flex items-center rounded border border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                            {currencySymbol && (
                                                <span className="pl-3 pr-1 text-xs text-[#45474c] shrink-0 select-none">{currencySymbol}</span>
                                            )}
                                            <input
                                                id="eng-rate"
                                                value={rateOrValue}
                                                onChange={(e) => setRateOrValue(e.target.value)}
                                                placeholder="Total value"
                                                disabled={isDisabled}
                                                className="flex-1 h-9 px-3 text-xs text-[#1b1b1d] bg-transparent outline-none placeholder:text-[#9a9ba0] disabled:cursor-not-allowed"
                                            />
                                        </div>
                                        {contractValueHint && (
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">{contractValueHint}</p>
                                        )}
                                    </div>

                                    {/* Tags */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <label htmlFor="eng-tags" className={fieldLabel + ' mb-0'}>
                                                <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</span>
                                            </label>
                                            <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-[#9a9ba0] cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent variant="light" side="right">
                                                        <div className="text-xs space-y-1">
                                                            <div className="font-semibold">Suggested tags:</div>
                                                            <div><span className="font-medium">Priority:</span> high-priority, urgent, rush</div>
                                                            <div><span className="font-medium">Client:</span> new-client, key-account, vip, pro-bono</div>
                                                            <div><span className="font-medium">Work type:</span> tax, audit, compliance, m&a, litigation, advisory</div>
                                                            <div><span className="font-medium">Billing:</span> billable, non-billable, recurring, one-time</div>
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                        <div
                                            className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-xs transition-colors cursor-text
                                                ${isDisabled
                                                    ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed'
                                                    : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'
                                                }`}
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
                                            <input
                                                ref={tagInputRef}
                                                id="eng-tags"
                                                value={tagInput}
                                                onChange={handleTagChange}
                                                onKeyDown={handleTagKeyDown}
                                                onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }}
                                                placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma…' : ''}
                                                disabled={isDisabled}
                                                className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed"
                                            />
                                            <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
                                        </div>
                                    </div>
                                </div>

                                {/* TRACKING — col-span-2, row 2: dates + internal memo */}
                                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                    <p className={fieldLabel}>Tracking</p>

                                    {/* Start date + End date */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Start date</span>
                                            </label>
                                            <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Select date" defaultTime="09:00" disabled={isDisabled} />
                                        </div>
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> End date</span>
                                            </label>
                                            <DateTimePicker value={endDate} onChange={setEndDate} placeholder="Select date" defaultTime="17:00" disabled={isDisabled} />
                                        </div>
                                    </div>

                                    {/* Internal Memo */}
                                    <div>
                                        <label htmlFor="eng-internal-memo" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1">
                                                <Lock className="h-3 w-3" /> Internal memo
                                                <span className="inline-flex items-center gap-0.5 normal-case tracking-normal font-sans text-[#9a9ba0]">— internal only</span>
                                            </span>
                                        </label>
                                        <textarea
                                            id="eng-internal-memo"
                                            value={internalMemo}
                                            onChange={(e) => setInternalMemo(e.target.value)}
                                            placeholder="Private notes, call summaries, context…"
                                            rows={2}
                                            disabled={isDisabled}
                                            className="flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button
                                variant="greenCta"
                                type="submit"
                                disabled={isDisabled || !name.trim()}
                                className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white"
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
