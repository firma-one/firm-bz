'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Brio } from '@/components/ui/brio'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { StatusProperty } from '@/components/ui/property-cells'
import { updateProject, deleteProject } from '@/lib/actions/project'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, FileText, Lock, Trash2 } from 'lucide-react'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { clientTabPath } from '@/lib/navigation/firm-paths'

export interface EngagementSettingsFormProps {
    projectId: string
    groupSlug: string
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
    onCancel?: () => void
    onSaved?: () => void
}

/** Notion property value: reads as plain text until hovered or focused. */
const fieldCls = PROPERTY_FIELD_CLASS
const textareaFieldCls = PROPERTY_TEXTAREA_CLASS
const sectionHeading = SETTINGS_SECTION_HEADING_CLASS

const STATUS_OPTIONS: LwCrmEngagementStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']
/** Stable default — a fresh `[]` per render would re-run the sync effect below on every render. */
const NO_TAGS: string[] = []

const CONTRACT_TYPES = ['Fixed Price', 'Retainer', 'Time & Material', 'Case Management', 'Milestone-Based', 'Strategic Advisory', 'Success Fee', 'Subscription / Recurring']

export function EngagementSettingsForm({
    projectId,
    groupSlug,
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
    initialTags = NO_TAGS,
    initialInternalMemo = null,
    onCancel,
    onSaved,
}: EngagementSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
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
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    const isCompleted = status === 'COMPLETED'
    const disabled = isCompleted

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
        setDeleting(true)
        try {
            await deleteProject(projectId, orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Engagement deleted', message: 'Engagement has been removed.' })
            setIsDeleteDialogOpen(false)
            onSaved?.()
            router.push(clientTabPath(groupSlug, orgSlug, clientSlug, 'projects'))
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
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">

            {isCompleted && (
                <div className="flex items-center gap-2 rounded-card bg-surface-subtle px-3 py-2 text-small text-fg-muted">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    This engagement is completed. Change its status to edit the other fields.
                </div>
            )}

            <section>
                <h3 className={sectionHeading}>Details</h3>
                <PropertyList>
                    <PropertyRow label={<label htmlFor="project-name">Name</label>} icon={<FileText />}>
                        <Input
                            id="project-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Engagement name"
                            disabled={disabled}
                            required
                            className={fieldCls}
                        />
                    </PropertyRow>
                    <PropertyRow label="Status" icon={<Activity />}>
                        <StatusProperty
                            kind="engagement"
                            value={status}
                            options={STATUS_OPTIONS}
                            onChange={(v) => setStatus(v as LwCrmEngagementStatus)}
                        />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="project-description">Description</label>} icon={<AlignLeft />}>
                        <div className="flex w-full flex-col gap-1">
                            <Textarea
                                id="project-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description of this engagement"
                                rows={3}
                                disabled={disabled}
                                className={textareaFieldCls}
                            />
                            {/* Same note as the New Engagement form. This is where a description
                                actually gets improved — after someone has seen a vague answer and
                                come looking for the reason. */}
                            <p className="px-2 text-caption text-fg-subtle">
                                <Brio className="text-caption" /> uses this for context when answering
                                questions about this engagement.
                            </p>
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={sectionHeading}>Commercial</h3>
                <PropertyList>
                    <PropertyRow label={<label htmlFor="contract-type">Contract type</label>} icon={<FileText />}>
                        <SelectWithCustomEntry
                            id="contract-type"
                            value={contractType}
                            onChange={setContractType}
                            options={CONTRACT_TYPES}
                            placeholder="Empty"
                            customEntryHint="Other…"
                            disabled={disabled}
                            className={fieldCls}
                        />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="rate-value">Contract value</label>} icon={<Banknote />}>
                        <div className="flex w-full flex-col gap-1">
                            <div className={`flex h-8 items-center rounded-control border border-transparent transition-colors hover:bg-surface-hover focus-within:border-action/60 focus-within:bg-surface focus-within:ring-2 focus-within:ring-action/20 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
                                {currencySymbol && (
                                    <span className="shrink-0 select-none pl-2 text-ui text-fg-muted">{currencySymbol}</span>
                                )}
                                <input
                                    id="rate-value"
                                    value={rateOrValue}
                                    onChange={(e) => setRateOrValue(e.target.value)}
                                    placeholder="Empty"
                                    disabled={disabled}
                                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-ui tabular-nums text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
                                />
                            </div>
                            {contractValueHint && (
                                <p className="px-2 text-caption text-fg-subtle">{contractValueHint}</p>
                            )}
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={sectionHeading}>Tracking</h3>
                <PropertyList>
                    <PropertyRow label="Start date" icon={<CalendarClock />}>
                        <DateTimePicker value={kickoffDate} onChange={setKickoffDate} placeholder="Empty" disabled={disabled} defaultTime="09:00" className={fieldCls} />
                    </PropertyRow>
                    <PropertyRow label="End date" icon={<CalendarCheck />}>
                        <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Empty" disabled={disabled} defaultTime="17:00" className={fieldCls} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="engagement-internal-memo">Internal memo</label>} icon={<Lock />}>
                        <div className="flex w-full flex-col gap-1">
                            <Textarea
                                id="engagement-internal-memo"
                                value={internalMemo}
                                onChange={(e) => setInternalMemo(e.target.value)}
                                placeholder="Private notes, call summaries, context…"
                                rows={3}
                                disabled={disabled}
                                className={textareaFieldCls}
                            />
                            <p className="px-2 text-caption text-fg-subtle">Only your firm sees this.</p>
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <div className="flex items-center gap-2">
                <Button onClick={handleSaveProperties} disabled={saving || !name.trim()} variant="greenCta">
                    {saving ? 'Saving…' : 'Save changes'}
                </Button>
                {onCancel && (
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>

            {/* Linear-style destructive row: say what happens, one button — no colored box. */}
            <section>
                <h3 className={sectionHeading}>Danger zone</h3>
                <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <p className="text-ui font-medium text-fg">Delete engagement</p>
                        <p className="text-small text-fg-muted">
                            Removes all members and revokes their Drive access. The folder stays in Google Drive for the firm admin.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={deleting}
                        className="shrink-0 text-danger hover:text-danger"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting ? 'Deleting…' : 'Delete engagement'}
                    </Button>
                </div>
            </section>

            <ConfirmDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Delete engagement"
                subtitle="This action cannot be undone."
                description="All members will be removed and their Drive access revoked. The folder stays in the firm's storage for the firm admin."
                confirmLabel="Delete engagement"
                confirmVariant="red"
                onCancel={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDeleteProject}
                loading={deleting}
            />
        </div>
    )
}
