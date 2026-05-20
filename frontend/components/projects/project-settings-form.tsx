'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateProject, deleteProject } from '@/lib/actions/project'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertTriangle, ChevronDown, Check, X, CornerDownLeft } from 'lucide-react'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export interface ProjectSettingsFormProps {
    projectId: string
    orgSlug: string
    clientSlug: string
    initialName: string
    initialDescription?: string
    initialKickoffDate?: string | null
    initialDueDate?: string | null
    initialStatus?: LwCrmEngagementStatus
    initialContractType?: string
    initialRateOrValue?: string | null
    initialTags?: string[]
    firmSandboxOnly?: boolean
    onCancel?: () => void
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

export function ProjectSettingsForm({
    projectId,
    orgSlug,
    clientSlug,
    initialName,
    initialDescription = '',
    initialKickoffDate = null,
    initialDueDate = null,
    initialStatus = 'ACTIVE',
    initialContractType = '',
    initialRateOrValue = null,
    initialTags = [],
    firmSandboxOnly = false,
    onCancel,
    onSaved,
}: ProjectSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [name, setName] = useState(initialName)
    const [description, setDescription] = useState(initialDescription)
    const [kickoffDate, setKickoffDate] = useState<string>(initialKickoffDate ?? '')
    const [dueDate, setDueDate] = useState<string>(initialDueDate ?? '')
    const [status, setStatus] = useState<LwCrmEngagementStatus>(initialStatus)
    const [contractType, setContractType] = useState(initialContractType)
    const [contractTypeOpen, setContractTypeOpen] = useState(false)
    const [contractTypeIsCustom, setContractTypeIsCustom] = useState(
        () => initialContractType !== '' && !['Fixed Price','Retainer','Time & Material','Case Management','Milestone-Based','Strategic Advisory','Success Fee','Subscription / Recurring'].includes(initialContractType)
    )
    const [rateOrValue, setRateOrValue] = useState(initialRateOrValue ?? '')
    const [currencySymbol, setCurrencySymbol] = useState('')
    const [tags, setTags] = useState<string[]>(initialTags)
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [dangerOpen, setDangerOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    const isCompleted = status === 'COMPLETED'

    useEffect(() => {
        setName(initialName)
        setDescription(initialDescription ?? '')
        setKickoffDate(initialKickoffDate ?? '')
        setDueDate(initialDueDate ?? '')
        setStatus(initialStatus ?? 'ACTIVE')
        setContractType(initialContractType ?? '')
        setRateOrValue(initialRateOrValue ?? '')
        setTags(initialTags)
    }, [initialName, initialDescription, initialKickoffDate, initialDueDate, initialStatus, initialContractType, initialRateOrValue, initialTags])

    useEffect(() => {
        let mounted = true
        fetch(`/api/firm?slug=${encodeURIComponent(orgSlug)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
                if (!mounted || !d) return
                const firm = d.firm ?? d
                const s = ((firm?.settings as Record<string, unknown>)?.currency as Record<string, string> | undefined)
                setCurrencySymbol(s?.symbol ?? '')
            })
            .catch(() => {})
        return () => { mounted = false }
    }, [orgSlug])

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

    const handleSaveProperties = async () => {
        if (isSandboxFirm) return
        setSaving(true)
        try {
            await updateProject(projectId, {
                name,
                description,
                kickoffDate: kickoffDate || null,
                dueDate: dueDate || null,
                status,
                contractType: contractType.trim() || null,
                rateOrValue: rateOrValue.trim() === '' ? null : rateOrValue.trim(),
                tags: tagInput.trim() ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')] : tags,
            }, orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Saved', message: 'Engagement properties updated.' })
            onSaved?.()
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Update failed', message: e instanceof Error ? e.message : 'Could not update project.' })
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteProject = async () => {
        if (isSandboxFirm) return
        setDeleting(true)
        try {
            await deleteProject(projectId, orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Engagement deleted', message: 'Engagement has been removed.' })
            setIsDeleteDialogOpen(false)
            onSaved?.()
            router.push(`/d/f/${orgSlug}/c/${clientSlug}?tab=projects`)
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Could not delete project.' })
        } finally {
            setDeleting(false)
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
        <div className="flex flex-col gap-3">
            {isSandboxFirm && <SandboxInfoBanner />}

            {isCompleted && (
                <div className="text-xs text-[#45474c] rounded border border-[#e5e7eb] bg-[#f9f9fb] px-3 py-2">
                    This engagement is completed. Change status to edit other fields.
                </div>
            )}

            {/* Tile grid */}
            <div className="grid grid-cols-3 gap-3">

                {/* DETAILS — col-span-2 */}
                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Details</p>

                    {/* Status + Start date + End date */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label htmlFor="engagement-status" className={fieldLabel}>Status</label>
                            <Select value={status} onValueChange={(v) => setStatus(v as LwCrmEngagementStatus)} disabled={isSandboxFirm}>
                                <SelectTrigger id="engagement-status" className={inputCls}>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent side="bottom" align="start" sideOffset={6} className="z-[70] border border-[#e5e7eb] bg-white shadow-sm rounded">
                                    <SelectItem value="PLANNED">Planned</SelectItem>
                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                    <SelectItem value="PAUSED">Paused</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className={fieldLabel}>Start date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                            <DateTimePicker value={kickoffDate} onChange={setKickoffDate} placeholder="Select date" disabled={isCompleted || isSandboxFirm} defaultTime="09:00" />
                        </div>
                        <div>
                            <label className={fieldLabel}>End date <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                            <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Select date" disabled={isCompleted || isSandboxFirm} defaultTime="17:00" />
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label htmlFor="project-name" className={fieldLabel}>Name</label>
                        <Input
                            id="project-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Engagement name"
                            disabled={isCompleted || isSandboxFirm}
                            className={inputCls}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="project-description" className={fieldLabel}>Description <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <textarea
                            id="project-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this engagement"
                            rows={3}
                            disabled={isCompleted || isSandboxFirm}
                            className={`flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-[#f9f9fb] disabled:cursor-not-allowed disabled:opacity-50`}
                        />
                    </div>
                </div>

                {/* COMMERCIAL — col-span-1 */}
                <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Commercial</p>

                    {/* Contract type */}
                    <div>
                        <label htmlFor="contract-type" className={fieldLabel}>Contract type <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <DropdownMenu open={contractTypeOpen} onOpenChange={setContractTypeOpen}>
                            <DropdownMenuTrigger asChild disabled={isCompleted || isSandboxFirm}>
                                <button
                                    id="contract-type"
                                    className="w-full h-9 flex items-center justify-between rounded border border-[#e5e7eb] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-primary"
                                >
                                    <span className={contractType ? 'text-[#1b1b1d]' : 'text-[#9a9ba0]'}>
                                        {contractType || 'Select type…'}
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5 text-[#45474c] shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1 border-[#e5e7eb] shadow-sm rounded" onCloseAutoFocus={(e) => e.preventDefault()}>
                                {['Fixed Price','Retainer','Time & Material','Case Management','Milestone-Based','Strategic Advisory','Success Fee','Subscription / Recurring'].map((label) => (
                                    <DropdownMenuItem
                                        key={label}
                                        className="flex items-center justify-between cursor-pointer text-sm text-[#1b1b1d]"
                                        onSelect={() => { setContractType(label); setContractTypeIsCustom(false); setContractTypeOpen(false) }}
                                    >
                                        {label}
                                        {contractType === label && !contractTypeIsCustom && <Check className="h-3.5 w-3.5 text-primary" />}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <div className="px-2 py-1.5 flex items-center gap-2">
                                    <input
                                        value={contractTypeIsCustom ? contractType : ''}
                                        onChange={(e) => { setContractType(e.target.value); setContractTypeIsCustom(true) }}
                                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setContractTypeOpen(false) }}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Other…"
                                        className="flex-1 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] outline-none bg-transparent"
                                    />
                                    {contractTypeIsCustom && contractType && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Contract value */}
                    <div>
                        <label htmlFor="rate-value" className={fieldLabel}>Contract value <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <div className={`flex items-center rounded border border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary ${isCompleted || isSandboxFirm ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {currencySymbol && (
                                <span className="pl-3 pr-1 text-sm text-[#45474c] shrink-0 select-none">{currencySymbol}</span>
                            )}
                            <input
                                id="rate-value"
                                value={rateOrValue}
                                onChange={(e) => setRateOrValue(e.target.value)}
                                placeholder="Total value"
                                disabled={isCompleted || isSandboxFirm}
                                className="flex-1 h-9 px-3 text-sm text-[#1b1b1d] bg-transparent outline-none placeholder:text-[#9a9ba0] disabled:cursor-not-allowed"
                            />
                        </div>
                        {contractValueHint && (
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">{contractValueHint}</p>
                        )}
                    </div>

                    {/* Tags */}
                    <div>
                        <label htmlFor="engagement-tags" className={fieldLabel}>Tags <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                        <div
                            className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-sm transition-colors cursor-text
                                ${isCompleted || isSandboxFirm
                                    ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed'
                                    : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'
                                }`}
                            onClick={() => tagInputRef.current?.focus()}
                        >
                            {tags.map((tag) => (
                                <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                                    {tag}
                                    {!isCompleted && !isSandboxFirm && (
                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </span>
                            ))}
                            <input
                                ref={tagInputRef}
                                id="engagement-tags"
                                value={tagInput}
                                onChange={handleTagChange}
                                onKeyDown={handleTagKeyDown}
                                onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }}
                                placeholder={tags.length === 0 ? 'Type a tag, press Enter or comma…' : ''}
                                disabled={isCompleted || isSandboxFirm}
                                className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed"
                            />
                            <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
                        </div>
                    </div>
                </div>

            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-3">
                {onCancel && (
                    <Button type="button" variant="outline" className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={handleSaveProperties}
                    disabled={saving || isSandboxFirm}
                    variant="greenCta"
                    className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white"
                >
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>

            {/* Danger zone — collapsible */}
            <section className="border border-red-200 rounded overflow-hidden">
                <button
                    type="button"
                    onClick={() => setDangerOpen((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-red-50/60 hover:bg-red-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-red-700">Danger zone</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-red-500 transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                </button>
                {dangerOpen && (
                    <div className="p-4 border-t border-red-200 bg-red-50/40 space-y-3">
                        <p className="text-xs text-[#45474c]">
                            Permanently removes this engagement. All members are removed and Drive access revoked. The engagement folder remains in Google Drive for the firm admin.
                        </p>
                        <Button
                            type="button"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            disabled={isSandboxFirm || deleting}
                            className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase"
                        >
                            {deleting ? 'Deleting…' : 'Delete engagement'}
                        </Button>
                    </div>
                )}
            </section>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="max-w-md">
                    <VisuallyHidden><DialogTitle>Delete engagement</DialogTitle></VisuallyHidden>
                    <DialogHeader>
                        <DialogTitle>Delete engagement?</DialogTitle>
                        <DialogDescription>
                            Permanently delete this engagement? All members will be removed and Drive access revoked. The folder remains in Google Drive for the firm admin. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="rounded-[2px]" onClick={() => setIsDeleteDialogOpen(false)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleDeleteProject}
                            disabled={deleting}
                            className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase"
                        >
                            {deleting ? 'Deleting…' : 'Delete engagement'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
