'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { updateProject, deleteProject } from '@/lib/actions/project'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, ChevronDown, FileText, Lock } from 'lucide-react'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export interface EngagementSettingsFormProps {
    projectId: string
    orgSlug: string
    clientSlug: string
    initialName: string
    initialDescription?: string
    initialKickoffDate?: string | null
    initialDueDate?: string | null
    initialFollowUpDate?: string | null
    initialStatus?: LwCrmEngagementStatus
    initialContractType?: string
    initialRateOrValue?: string | null
    initialTags?: string[]
    initialInternalMemo?: string | null
    firmSandboxOnly?: boolean
    onCancel?: () => void
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-[#f9f9fb] disabled:cursor-not-allowed disabled:opacity-50'
const selectItemCls = 'cursor-pointer rounded-none px-2.5 text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]'

const CONTRACT_TYPES = ['Fixed Price', 'Retainer', 'Time & Material', 'Case Management', 'Milestone-Based', 'Strategic Advisory', 'Success Fee', 'Subscription / Recurring']

export function EngagementSettingsForm({
    projectId,
    orgSlug,
    clientSlug,
    initialName,
    initialDescription = '',
    initialKickoffDate = null,
    initialDueDate = null,
    initialFollowUpDate = null,
    initialStatus = 'ACTIVE',
    initialContractType = '',
    initialRateOrValue = null,
    initialTags = [],
    initialInternalMemo = null,
    firmSandboxOnly = false,
    onCancel,
    onSaved,
}: EngagementSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [name, setName] = useState(initialName)
    const [description, setDescription] = useState(initialDescription)
    const [kickoffDate, setKickoffDate] = useState<string>(initialKickoffDate ?? '')
    const [dueDate, setDueDate] = useState<string>(initialDueDate ?? '')
    const [followUpDate, setFollowUpDate] = useState<string>(initialFollowUpDate ?? '')
    const [status, setStatus] = useState<LwCrmEngagementStatus>(initialStatus)
    const [contractType, setContractType] = useState(initialContractType)
    const [rateOrValue, setRateOrValue] = useState(initialRateOrValue ?? '')
    const [currencySymbol, setCurrencySymbol] = useState('')
    const [internalMemo, setInternalMemo] = useState(initialInternalMemo ?? '')
    const [tags, setTags] = useState<string[]>(initialTags)
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [dangerOpen, setDangerOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    const isCompleted = status === 'COMPLETED'
    const disabled = isCompleted || isSandboxFirm

    useEffect(() => {
        setName(initialName)
        setDescription(initialDescription ?? '')
        setKickoffDate(initialKickoffDate ?? '')
        setDueDate(initialDueDate ?? '')
        setStatus(initialStatus ?? 'ACTIVE')
        setContractType(initialContractType ?? '')
        setRateOrValue(initialRateOrValue ?? '')
        setTags(initialTags)
        setInternalMemo(initialInternalMemo ?? '')
    }, [initialName, initialDescription, initialKickoffDate, initialDueDate, initialStatus, initialContractType, initialRateOrValue, initialTags, initialInternalMemo])

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
                followUpDate: followUpDate || null,
                status,
                contractType: contractType.trim() || null,
                rateOrValue: rateOrValue.trim() === '' ? null : rateOrValue.trim(),
                tags: tagInput.trim() ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')] : tags,
                internalMemo: internalMemo.trim() || null,
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

            {/* Tile grid — 3 cols, all cards stretch to equal height */}
            <div className="grid grid-cols-3 gap-3 items-stretch">

                {/* DETAILS — col-span-2, row 1 */}
                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Details</p>

                    {/* Name + Status */}
                    <div className="grid grid-cols-[3fr_1fr] gap-3">
                        <div>
                            <label htmlFor="project-name" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1">
                                    <FileText className="h-3 w-3" /> Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span>
                                </span>
                            </label>
                            <Input
                                id="project-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Engagement name"
                                disabled={disabled}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label htmlFor="engagement-status" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1">
                                    <Activity className="h-3 w-3" /> Status <span className="text-red-500 normal-case tracking-normal font-sans">*</span>
                                </span>
                            </label>
                            <Select value={status} onValueChange={(v) => setStatus(v as LwCrmEngagementStatus)} disabled={isSandboxFirm}>
                                <SelectTrigger id="engagement-status" className={inputCls}>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent side="bottom" align="start" sideOffset={6} className="z-[70] border border-[#e5e7eb] bg-white shadow-sm rounded py-0.5 min-w-[var(--radix-select-trigger-width)]">
                                    <SelectItem value="PLANNED" className={selectItemCls}>Planned</SelectItem>
                                    <SelectItem value="ACTIVE" className={selectItemCls}>Active</SelectItem>
                                    <SelectItem value="PAUSED" className={selectItemCls}>Paused</SelectItem>
                                    <SelectItem value="COMPLETED" className={selectItemCls}>Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="project-description" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Description</span>
                        </label>
                        <textarea
                            id="project-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this engagement"
                            rows={2}
                            disabled={disabled}
                            className={textareaCls}
                        />
                    </div>
                </div>

                {/* COMMERCIAL — col-span-1, row-span-2 */}
                <div className="row-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Commercial</p>

                    {/* Contract type */}
                    <div>
                        <label htmlFor="contract-type" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Contract type</span>
                        </label>
                        <SelectWithCustomEntry
                            id="contract-type"
                            value={contractType}
                            onChange={setContractType}
                            options={CONTRACT_TYPES}
                            placeholder="Select type…"
                            customEntryHint="Other…"
                            disabled={disabled}
                        />
                    </div>

                    {/* Contract value */}
                    <div>
                        <label htmlFor="rate-value" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" /> Contract value</span>
                        </label>
                        <div className={`flex items-center rounded border border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {currencySymbol && (
                                <span className="pl-3 pr-1 text-xs text-[#45474c] shrink-0 select-none">{currencySymbol}</span>
                            )}
                            <input
                                id="rate-value"
                                value={rateOrValue}
                                onChange={(e) => setRateOrValue(e.target.value)}
                                placeholder="Total value"
                                disabled={disabled}
                                className="flex-1 h-9 px-3 text-xs text-[#1b1b1d] bg-transparent outline-none placeholder:text-[#9a9ba0] disabled:cursor-not-allowed"
                            />
                        </div>
                        {contractValueHint && (
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">{contractValueHint}</p>
                        )}
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
                            <DateTimePicker value={kickoffDate} onChange={setKickoffDate} placeholder="Select date" disabled={disabled} defaultTime="09:00" />
                        </div>
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> End date</span>
                            </label>
                            <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Select date" disabled={disabled} defaultTime="17:00" />
                        </div>
                    </div>

                    {/* Internal Memo */}
                    <div>
                        <label htmlFor="engagement-internal-memo" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" /> Internal memo
                                <span className="inline-flex items-center gap-0.5 normal-case tracking-normal font-sans text-[#9a9ba0]">— internal only</span>
                            </span>
                        </label>
                        <textarea
                            id="engagement-internal-memo"
                            value={internalMemo}
                            onChange={(e) => setInternalMemo(e.target.value)}
                            placeholder="Private notes, call summaries, context…"
                            rows={2}
                            disabled={disabled}
                            className={textareaCls}
                        />
                    </div>
                </div>

            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-3">
                {onCancel && (
                    <Button type="button" variant="outline" className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={handleSaveProperties}
                    disabled={saving || isSandboxFirm}
                    variant="greenCta"
                    className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white"
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
                            className="rounded bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase"
                        >
                            {deleting ? 'Deleting…' : 'Delete engagement'}
                        </Button>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Delete engagement"
                subtitle="This action cannot be undone."
                description="Permanently delete this engagement? All members will be removed and Drive access revoked. The folder remains in Google Drive for the firm admin. This cannot be undone."
                confirmLabel="Delete engagement"
                confirmVariant="red"
                onCancel={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDeleteProject}
                loading={deleting}
            />
        </div>
    )
}
