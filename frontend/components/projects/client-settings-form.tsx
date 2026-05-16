'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { FileText, AlertTriangle, Tag, Lock, Linkedin, Users2, MapPin, CalendarDays } from 'lucide-react'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

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
    const [tagsInput, setTagsInput] = useState(initialTags.join(', '))
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
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    useEffect(() => {
        setName(initialName)
        setIndustry(initialIndustry ?? '')
        setStatus(initialStatus ?? 'ACTIVE')
        setWebsite(initialWebsite ?? '')
        setDescription(initialDescription ?? '')
        setTagsInput(initialTags.join(', '))
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
            .then((res) => {
                setMemberOptions(
                    res.members.map((m) => ({
                        userId: m.userId,
                        label: m.user?.name || m.user?.email || m.userId,
                    }))
                )
            })
            .catch(() => setMemberOptions([]))
    }, [firmId])

    const parseTags = (raw: string) =>
        raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)

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
                tags: parseTags(tagsInput),
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
            addToast({
                type: 'error',
                title: 'Update failed',
                message: e instanceof Error ? e.message : 'Could not update client.',
            })
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
            router.push(`/d/f/${orgSlug}`)
        } catch (e: unknown) {
            addToast({
                type: 'error',
                title: 'Delete failed',
                message: e instanceof Error ? e.message : 'Could not delete client.',
            })
        } finally {
            setDeleting(false)
        }
    }

    const buttonClass = 'min-w-[11rem] sm:w-[11rem]'

    return (
        <div className="space-y-0">
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Client settings</h2>
                <p className="text-sm text-gray-500 mt-1">Edit details or remove the client.</p>
            </div>

            {isSandboxFirm && (
                <div className="mb-6">
                    <SandboxInfoBanner />
                </div>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-6 mb-12">
                <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-gray-500" aria-hidden />
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Details</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">Name, CRM status, and optional business details.</p>
                <div className="space-y-4 w-full">
                    <div className="space-y-2">
                        <Label htmlFor="client-status" className="text-gray-700 font-medium">Status</Label>
                        <div className="relative">
                            <Tag className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                            <select
                                id="client-status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value as LwCrmClientStatus)}
                                disabled={isSandboxFirm}
                                className="w-full h-10 rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <option value="PROSPECT">Prospect</option>
                                <option value="ACTIVE">Active</option>
                                <option value="ON_HOLD">On hold</option>
                                <option value="PAST">Past</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-name" className="text-gray-700 font-medium">Name</Label>
                        <Input
                            id="client-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Client name"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-industry" className="text-gray-700 font-medium">Industry (optional)</Label>
                        <Input
                            id="client-industry"
                            value={industry}
                            onChange={(e) => setIndustry(e.target.value)}
                            placeholder="e.g. Technology"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-website" className="text-gray-700 font-medium">Website (optional)</Label>
                        <Input
                            id="client-website"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://…"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-description" className="text-gray-700 font-medium">Description / notes</Label>
                        <textarea
                            id="client-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Notes about this client"
                            rows={3}
                            disabled={isSandboxFirm}
                            className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="client-tags" className="text-gray-700 font-medium">Tags</Label>
                        <Input
                            id="client-tags"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="e.g. enterprise, priority (comma-separated)"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    {status === 'PROSPECT' && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="client-lead-source" className="text-gray-700 font-medium">Lead source (optional)</Label>
                                <SelectWithCustomEntry
                                    id="client-lead-source"
                                    value={leadSource}
                                    onChange={setLeadSource}
                                    options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']}
                                    placeholder="Select source…"
                                    customEntryHint="Other…"
                                    disabled={isSandboxFirm}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-700 font-medium">Follow-up date (optional)</Label>
                                <DateTimePicker
                                    value={followUpDate}
                                    onChange={setFollowUpDate}
                                    placeholder="Select date"
                                    disabled={isSandboxFirm}
                                    defaultTime="09:00"
                                />
                                <p className="text-xs text-gray-400">When should you next follow up with this prospect?</p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-700 font-medium">Expected close date (optional)</Label>
                                <DateTimePicker
                                    value={expectedCloseDate}
                                    onChange={setExpectedCloseDate}
                                    placeholder="Select date"
                                    disabled={isSandboxFirm}
                                    defaultTime="17:00"
                                />
                                <p className="text-xs text-gray-400">When do you expect to convert this prospect?</p>
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="client-internal-memo" className="text-gray-700 font-medium flex items-center gap-1.5">
                            Internal memo
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                <Lock className="h-2.5 w-2.5" /> Internal only
                            </span>
                        </Label>
                        <textarea
                            id="client-internal-memo"
                            value={internalMemo}
                            onChange={(e) => setInternalMemo(e.target.value)}
                            placeholder="Private notes, call summaries, relationship context…"
                            rows={3}
                            disabled={isSandboxFirm}
                            className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <p className="text-xs text-gray-400">Not visible to client portal users.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="client-since-date" className="text-gray-700 font-medium">Client since (optional)</Label>
                        <DateTimePicker
                            value={clientSinceDate}
                            onChange={setClientSinceDate}
                            placeholder="Select date"
                            disabled={isSandboxFirm}
                            defaultTime="00:00"
                        />
                        <p className="text-xs text-gray-400">When did this relationship begin?</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="client-linkedin" className="text-gray-700 font-medium flex items-center gap-1.5">
                            <Linkedin className="h-3.5 w-3.5" /> Company LinkedIn (optional)
                        </Label>
                        <Input
                            id="client-linkedin"
                            value={linkedInUrl}
                            onChange={(e) => setLinkedInUrl(e.target.value)}
                            placeholder="https://linkedin.com/company/…"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="client-company-size" className="text-gray-700 font-medium flex items-center gap-1.5">
                            <Users2 className="h-3.5 w-3.5" /> Company size (optional)
                        </Label>
                        <SelectWithCustomEntry
                            id="client-company-size"
                            value={companySizeBracket}
                            onChange={setCompanySizeBracket}
                            options={['<10', '11–50', '51–200', '201–1000', '1000+']}
                            placeholder="Select size bracket…"
                            customEntryHint="Custom…"
                            disabled={isSandboxFirm}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="client-billing-address" className="text-gray-700 font-medium flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" /> Billing address (optional)
                        </Label>
                        <textarea
                            id="client-billing-address"
                            value={billingAddress}
                            onChange={(e) => setBillingAddress(e.target.value)}
                            placeholder={"123 Main St\nCity, State ZIP\nCountry"}
                            rows={3}
                            disabled={isSandboxFirm}
                            className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className={buttonClass}
                            onClick={() => router.push(`/d/f/${orgSlug}/c/${clientSlug}?tab=projects`)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSandboxFirm || saving}
                            className={`${buttonClass} bg-gray-900 text-white hover:bg-black`}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </section>

            <div className="py-4">
                <section className="rounded-lg border border-red-200 bg-red-50/50 p-6">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
                        <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wide">Danger zone</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                        Permanently delete this client. All projects and members will be removed. This cannot be undone.
                    </p>
                    <Button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={isSandboxFirm || deleting}
                        className={`${buttonClass} bg-red-800 text-white hover:bg-red-900 border-0`}
                    >
                        {deleting ? 'Deleting...' : 'Delete client'}
                    </Button>
                </section>
            </div>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Delete client?</DialogTitle>
                        <DialogDescription className="text-slate-600">
                            Permanently delete this client? All projects and members will be removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-gray-200 text-gray-700 hover:bg-gray-50"
                            disabled={deleting}
                            onClick={() => setDeleteConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={isSandboxFirm || deleting}
                            onClick={() => void performDeleteClient()}
                        >
                            {deleting ? 'Deleting...' : 'Delete client'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
