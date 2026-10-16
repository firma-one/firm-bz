'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Brio } from '@/components/ui/brio'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { StatusProperty } from "@/components/ui/property-cells"
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS } from "@/components/ui/property-list"
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from "@/components/ui/create-dialog"
import { Plus, Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, FileText, Lock } from "lucide-react"
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { OptionalFieldsSection } from "@/components/ui/optional-fields-toggle"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { createProject, type LwCrmEngagementStatus } from '@/lib/actions/project'
import { clientTabPath } from '@/lib/navigation/firm-paths'

interface AddEngagementModalProps {
    groupSlug: string
    firmSlug: string
    clientSlug: string
    trigger?: React.ReactNode
    onSaved?: () => void
}

const ENGAGEMENT_STATUSES: LwCrmEngagementStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']

export function AddEngagementModal({ groupSlug, firmSlug, clientSlug, trigger, onSaved }: AddEngagementModalProps) {
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
    const [showOptional, setShowOptional] = useState(false)
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

    const isDisabled = capBlocked || isLoading

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
        if (capBlocked) return

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
            setShowOptional(false)
            router.push(clientTabPath(groupSlug, firmSlug, clientSlug, 'projects'), { scroll: false })
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
                    <Button type="button" size="sm" disabled={capBlocked}>
                        <Plus className="h-3.5 w-3.5" />
                        New engagement
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
                    <CreateDialogHeader title="New engagement" description="Create a new engagement for this client." />

                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                            {error && <CreateDialogNotice message={error} />}
                            {capBlocked && capMessage && <CreateDialogNotice message={capMessage} limit />}

                            {/* Same property rows as Engagement Settings: create and edit look alike. */}
                            <PropertyList>
                                <PropertyRow label={<label htmlFor="eng-name">Name <span className="text-danger">*</span></label>} icon={<FileText />}>
                                    <Input
                                        id="eng-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Q1 Audit"
                                        required
                                        autoFocus
                                        disabled={isDisabled}
                                        className={PROPERTY_FIELD_CLASS}
                                    />
                                </PropertyRow>
                                <PropertyRow label="Status" icon={<Activity />}>
                                    <StatusProperty
                                        kind="engagement"
                                        value={status}
                                        options={ENGAGEMENT_STATUSES}
                                        onChange={(v) => setStatus(v as LwCrmEngagementStatus)}
                                        disabled={isDisabled}
                                    />
                                </PropertyRow>
                                <PropertyRow label={<label htmlFor="eng-description">Description</label>} icon={<AlignLeft />}>
                                    <div className="flex w-full flex-col gap-1">
                                        <Textarea
                                            id="eng-description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Brief engagement description"
                                            rows={2}
                                            disabled={isDisabled}
                                            className={PROPERTY_TEXTAREA_CLASS}
                                        />
                                        {/* Says the field is READ, which is the only thing that
                                            changes what someone writes here. "Q2 GTM" and "Q2 GTM
                                            positioning for a Series B fintech entering the UK" are
                                            both valid labels; only the second is useful context. */}
                                        <p className={PROPERTY_HINT_CLASS}>
                                            <Brio className="text-caption" /> uses this for context when answering questions about this engagement.
                                        </p>
                                    </div>
                                </PropertyRow>
                            </PropertyList>

                            <OptionalFieldsSection open={showOptional} onToggle={() => setShowOptional((v) => !v)}>
                                <PropertyList>
                                    <PropertyRow label={<label htmlFor="ctype">Contract type</label>} icon={<FileText />}>
                                        <SelectWithCustomEntry
                                            id="ctype"
                                            value={contractType}
                                            onChange={setContractType}
                                            options={['Fixed Price','Retainer','Time & Material','Case Management','Milestone-Based','Strategic Advisory','Success Fee','Subscription / Recurring']}
                                            placeholder="Empty"
                                            customEntryHint="Other…"
                                            disabled={isDisabled}
                                            className={PROPERTY_FIELD_CLASS}
                                        />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="eng-rate">Contract value</label>} icon={<Banknote />}>
                                        <div className="flex w-full flex-col gap-1">
                                            <div className={`flex h-8 items-center rounded-control border border-transparent transition-colors hover:bg-surface-hover focus-within:border-action/60 focus-within:bg-surface focus-within:ring-2 focus-within:ring-action/20 ${isDisabled ? 'pointer-events-none opacity-50' : ''}`}>
                                                {currencySymbol && (
                                                    <span className="shrink-0 select-none pl-2 text-ui text-fg-muted">{currencySymbol}</span>
                                                )}
                                                <input
                                                    id="eng-rate"
                                                    value={rateOrValue}
                                                    onChange={(e) => setRateOrValue(e.target.value)}
                                                    placeholder="Empty"
                                                    disabled={isDisabled}
                                                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-ui tabular-nums text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            {contractValueHint && <p className={PROPERTY_HINT_CLASS}>{contractValueHint}</p>}
                                        </div>
                                    </PropertyRow>
                                    <PropertyRow label="Start date" icon={<CalendarClock />}>
                                        <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Empty" defaultTime="09:00" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label="End date" icon={<CalendarCheck />}>
                                        <DateTimePicker value={endDate} onChange={setEndDate} placeholder="Empty" defaultTime="17:00" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="eng-internal-memo">Internal memo</label>} icon={<Lock />}>
                                        <div className="flex w-full flex-col gap-1">
                                            <Textarea
                                                id="eng-internal-memo"
                                                value={internalMemo}
                                                onChange={(e) => setInternalMemo(e.target.value)}
                                                placeholder="Private notes, call summaries, context…"
                                                rows={2}
                                                disabled={isDisabled}
                                                className={PROPERTY_TEXTAREA_CLASS}
                                            />
                                            <p className={PROPERTY_HINT_CLASS}>Only your firm sees this.</p>
                                        </div>
                                    </PropertyRow>
                                </PropertyList>
                            </OptionalFieldsSection>
                        </div>

                        <CreateDialogFooter
                            onCancel={() => setOpen(false)}
                            cancelDisabled={isLoading}
                            submitDisabled={isDisabled || !name.trim()}
                            submitting={isLoading}
                        />
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
