'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Linkedin, Users2, MapPin, User, Activity, Share2, CalendarCheck, CalendarDays, Building2, Globe, FileText, Lock } from "lucide-react"
import { StatusProperty } from "@/components/ui/property-cells"
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS } from "@/components/ui/property-list"
import { CreateDialogFooter, CreateDialogHeader, CreateDialogNotice } from "@/components/ui/create-dialog"
import { SelectWithCustomEntry } from "@/components/ui/select-with-custom-entry"
import { OptionalFieldsSection } from "@/components/ui/optional-fields-toggle"
import { createClient, type LwCrmClientStatus } from '@/lib/actions/client'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { firmTabPath } from '@/lib/navigation/firm-paths'

interface AddClientModalProps {
    groupSlug: string
    orgSlug: string
    firmId?: string
    trigger?: React.ReactNode
    onSaved?: () => void
}

const CLIENT_STATUSES: LwCrmClientStatus[] = ['PROSPECT', 'ACTIVE', 'ON_HOLD', 'PAST']

export function AddClientModal({ groupSlug, orgSlug, firmId, trigger, onSaved }: AddClientModalProps) {
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

    const isDisabled = isLoading || capBlocked

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

        if (capBlocked) return

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
            router.push(firmTabPath(groupSlug, orgSlug, 'clients'), { scroll: false })
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
                    <Button type="button" size="sm">
                        <Plus className="h-3.5 w-3.5" />
                        New client
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
                    <CreateDialogHeader title="New client" description="Create a new client record within your firm." />

                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col gap-3 px-5 pb-5 pt-2">
                            {capBlocked && capMessage && <CreateDialogNotice message={capMessage} limit />}
                            {error && <CreateDialogNotice message={error} />}

                            {/* Same property rows as Client Settings: create and edit look alike. */}
                            <PropertyList>
                                <PropertyRow label={<label htmlFor="new-client-name">Name <span className="text-danger">*</span></label>} icon={<User />}>
                                    <Input id="new-client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" required autoFocus disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                </PropertyRow>
                                <PropertyRow label="Status" icon={<Activity />}>
                                    <StatusProperty kind="client" value={status} options={CLIENT_STATUSES} onChange={(v) => setStatus(v as LwCrmClientStatus)} disabled={isDisabled} />
                                </PropertyRow>
                            </PropertyList>

                            <OptionalFieldsSection open={showOptional} onToggle={() => setShowOptional((v) => !v)}>
                                <PropertyList>
                                    <PropertyRow label={<label htmlFor="new-client-industry">Industry</label>} icon={<Building2 />}>
                                        <Input id="new-client-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Empty" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-company-size">Company size</label>} icon={<Users2 />}>
                                        <SelectWithCustomEntry id="new-client-company-size" value={companySizeBracket} onChange={setCompanySizeBracket} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Empty" customEntryHint="Custom…" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-website">Website</label>} icon={<Globe />}>
                                        <Input id="new-client-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-linkedin">LinkedIn</label>} icon={<Linkedin />}>
                                        <Input id="new-client-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/company/…" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-billing">Billing address</label>} icon={<MapPin />}>
                                        <Textarea id="new-client-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={3} disabled={isDisabled} className={PROPERTY_TEXTAREA_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-description">Notes</label>} icon={<FileText />}>
                                        <Textarea id="new-client-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details about the client" rows={2} disabled={isDisabled} className={PROPERTY_TEXTAREA_CLASS} />
                                    </PropertyRow>
                                    <PropertyRow label={<label htmlFor="new-client-lead-source">Lead source</label>} icon={<Share2 />}>
                                        <div className="flex w-full flex-col gap-1">
                                            <SelectWithCustomEntry id="new-client-lead-source" value={leadSource} onChange={setLeadSource} options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']} placeholder="Empty" customEntryHint="Other…" disabled={isDisabled} className={PROPERTY_FIELD_CLASS} />
                                            <p className={PROPERTY_HINT_CLASS}>How the lead came in</p>
                                        </div>
                                    </PropertyRow>
                                    {/* A prospect has an expected close; a client has a start date (as in Client Settings). */}
                                    {status === 'PROSPECT' ? (
                                        <PropertyRow label="Expected close" icon={<CalendarCheck />}>
                                            <div className="flex w-full flex-col gap-1">
                                                <DateTimePicker value={expectedCloseDate} onChange={setExpectedCloseDate} placeholder="Empty" disabled={isDisabled} defaultTime="17:00" className={PROPERTY_FIELD_CLASS} />
                                                <p className={PROPERTY_HINT_CLASS}>When you expect to convert the lead</p>
                                            </div>
                                        </PropertyRow>
                                    ) : (
                                        <PropertyRow label="Client since" icon={<CalendarDays />}>
                                            <div className="flex w-full flex-col gap-1">
                                                <DateTimePicker value={clientSinceDate} onChange={setClientSinceDate} placeholder="Empty" disabled={isDisabled} defaultTime="00:00" className={PROPERTY_FIELD_CLASS} />
                                                <p className={PROPERTY_HINT_CLASS}>When the formal business relationship started</p>
                                            </div>
                                        </PropertyRow>
                                    )}
                                    <PropertyRow label={<label htmlFor="new-client-memo">Internal memo</label>} icon={<Lock />}>
                                        <div className="flex w-full flex-col gap-1">
                                            <Textarea id="new-client-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)} placeholder="Private notes, call summaries, relationship context…" rows={2} disabled={isDisabled} className={PROPERTY_TEXTAREA_CLASS} />
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
