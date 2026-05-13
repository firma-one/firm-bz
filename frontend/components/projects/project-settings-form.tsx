'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { updateProject, deleteProject } from '@/lib/actions/project'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FileText, AlertTriangle, ChevronDown, Check } from 'lucide-react'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'

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
    /** Close modal or navigate away (e.g. back to Files). Always enabled even in Sandbox. */
    onCancel?: () => void
    onSaved?: () => void
}

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
    const [tagsInput, setTagsInput] = useState(initialTags.join(', '))
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
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
        setTagsInput(initialTags.join(', '))
    }, [
        initialName,
        initialDescription,
        initialKickoffDate,
        initialDueDate,
        initialStatus,
        initialContractType,
        initialRateOrValue,
        initialTags,
    ])

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

    const parseTags = (raw: string) =>
        raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)

    const handleSaveProperties = async () => {
        if (isSandboxFirm) return
        setSaving(true)
        try {
            await updateProject(
                projectId,
                {
                    name,
                    description,
                    kickoffDate: kickoffDate || null,
                    dueDate: dueDate || null,
                    status,
                    contractType: contractType.trim() || null,
                    rateOrValue: rateOrValue.trim() === '' ? null : rateOrValue.trim(),
                    tags: parseTags(tagsInput),
                },
                orgSlug,
                clientSlug
            )
            addToast({ type: 'success', title: 'Saved', message: 'Engagement properties updated.' })
            onSaved?.()
        } catch (e: unknown) {
            addToast({
                type: 'error',
                title: 'Update failed',
                message: e instanceof Error ? e.message : 'Could not update project.',
            })
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
            router.push(`/d/f/${orgSlug}/c/${clientSlug}`)
        } catch (e: unknown) {
            addToast({
                type: 'error',
                title: 'Delete failed',
                message: e instanceof Error ? e.message : 'Could not delete project.',
            })
        } finally {
            setDeleting(false)
        }
    }

    const buttonClass = 'min-w-[11rem] sm:w-[11rem]'

    return (
        <div className="space-y-0">
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Engagement settings</h2>
                <p className="text-sm text-gray-500 mt-1">Edit details, status, and commercial fields, or remove the engagement.</p>
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
                <p className="text-sm text-gray-500 mb-4">Name, dates, and description shown in the engagement workspace.</p>
                {isCompleted && (
                    <p className="text-xs text-gray-500 mb-3 rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
                        This engagement is completed. Change status below to edit other fields.
                    </p>
                )}
                <div className="space-y-4 w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="engagement-status" className="text-gray-700 font-medium">Status</Label>
                            <Select
                                value={status}
                                onValueChange={(value) => setStatus(value as LwCrmEngagementStatus)}
                                disabled={isSandboxFirm}
                            >
                                <SelectTrigger
                                    id="engagement-status"
                                    className="w-full h-10 rounded-md border-gray-200 bg-white px-3 text-sm text-gray-900 focus:ring-2 focus:ring-gray-400"
                                >
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent
                                    side="bottom"
                                    align="start"
                                    sideOffset={6}
                                    className="z-[70] border border-gray-200 bg-white shadow-lg"
                                >
                                    <SelectItem value="PLANNED">Planned</SelectItem>
                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                    <SelectItem value="PAUSED">Paused</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-gray-700 font-medium">Start date (optional)</Label>
                            <DateTimePicker
                                value={kickoffDate}
                                onChange={setKickoffDate}
                                placeholder="Select start date"
                                disabled={isCompleted || isSandboxFirm}
                                defaultTime="09:00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-gray-700 font-medium">End date (optional)</Label>
                            <DateTimePicker
                                value={dueDate}
                                onChange={setDueDate}
                                placeholder="Select end date"
                                disabled={isCompleted || isSandboxFirm}
                                defaultTime="17:00"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="project-name" className="text-gray-700 font-medium">Name</Label>
                        <Input
                            id="project-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Engagement name"
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400"
                            disabled={isCompleted || isSandboxFirm}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="project-description" className="text-gray-700 font-medium">Description</Label>
                        <textarea
                            id="project-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this engagement"
                            rows={3}
                            className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
                            disabled={isCompleted || isSandboxFirm}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contract-type" className="text-gray-700 font-medium">Contract type (optional)</Label>
                            <DropdownMenu open={contractTypeOpen} onOpenChange={setContractTypeOpen}>
                                <DropdownMenuTrigger asChild disabled={isCompleted || isSandboxFirm}>
                                    <button
                                        id="contract-type"
                                        className="w-full h-10 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span className={contractType ? 'text-gray-900' : 'text-gray-400'}>
                                            {contractType || 'Select a contract type'}
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    className="w-[var(--radix-dropdown-menu-trigger-width)] p-1"
                                    onCloseAutoFocus={(e) => e.preventDefault()}
                                >
                                    {[
                                        'Fixed Price',
                                        'Retainer',
                                        'Time & Material',
                                        'Case Management',
                                        'Milestone-Based',
                                        'Strategic Advisory',
                                        'Success Fee',
                                        'Subscription / Recurring',
                                    ].map((label) => (
                                        <DropdownMenuItem
                                            key={label}
                                            className="flex items-center justify-between cursor-pointer"
                                            onSelect={() => {
                                                setContractType(label)
                                                setContractTypeIsCustom(false)
                                                setContractTypeOpen(false)
                                            }}
                                        >
                                            {label}
                                            {contractType === label && !contractTypeIsCustom && (
                                                <Check className="h-4 w-4 text-gray-700" />
                                            )}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <div className="px-2 py-1.5 flex items-center gap-2">
                                        <input
                                            value={contractTypeIsCustom ? contractType : ''}
                                            onChange={(e) => {
                                                setContractType(e.target.value)
                                                setContractTypeIsCustom(true)
                                            }}
                                            onKeyDown={(e) => {
                                                e.stopPropagation()
                                                if (e.key === 'Enter') setContractTypeOpen(false)
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="Other..."
                                            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
                                        />
                                        {contractTypeIsCustom && contractType && (
                                            <Check className="h-4 w-4 text-gray-700 shrink-0" />
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rate-value" className="text-gray-700 font-medium">Contract Value <span className="text-gray-400 font-normal">(optional)</span></Label>
                            <div className={`flex items-center rounded-md border border-gray-200 bg-white focus-within:ring-1 focus-within:ring-gray-400 ${isCompleted || isSandboxFirm ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                {currencySymbol && (
                                    <span className="pl-3 pr-1 text-sm text-gray-500 shrink-0 select-none">{currencySymbol}</span>
                                )}
                                <input
                                    id="rate-value"
                                    value={rateOrValue}
                                    onChange={(e) => setRateOrValue(e.target.value)}
                                    placeholder="Total engagement value"
                                    disabled={isCompleted || isSandboxFirm}
                                    className="flex-1 h-10 px-3 text-sm text-gray-900 bg-transparent outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
                                />
                            </div>
                            {contractType && (
                                <p className="text-xs text-gray-400">
                                    {contractType === 'Fixed Price' && 'Total project fee'}
                                    {contractType === 'Time & Material' && 'Estimated total — leave blank if unknown'}
                                    {contractType === 'Retainer' && 'Total retainer value (e.g. 5 000/mo × 12 = 60 000)'}
                                    {contractType === 'Milestone-Based' && 'Sum of all milestone values'}
                                    {contractType === 'Subscription / Recurring' && 'Total value over engagement period'}
                                    {!['Fixed Price','Time & Material','Retainer','Milestone-Based','Subscription / Recurring'].includes(contractType) && 'Total value of this engagement'}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="engagement-tags" className="text-gray-700 font-medium">Tags</Label>
                        <Input
                            id="engagement-tags"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="Comma-separated"
                            disabled={isCompleted || isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400"
                        />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {onCancel ? (
                            <Button type="button" variant="outline" className={buttonClass} onClick={onCancel}>
                                Cancel
                            </Button>
                        ) : null}
                        <Button
                            onClick={handleSaveProperties}
                            disabled={saving || isSandboxFirm}
                            className={`${buttonClass} bg-gray-900 text-white hover:bg-black`}
                        >
                            {saving ? 'Saving...' : 'Save changes'}
                        </Button>
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-red-200 bg-red-50/50 p-6">
                <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
                    <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wide">Danger zone</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                    Permanently remove this engagement from Pockett. All members are removed and Drive access is revoked. The engagement folder remains in Google Drive for the firm admin.
                </p>
                <Button
                    onClick={() => setIsDeleteDialogOpen(true)}
                    disabled={isSandboxFirm || deleting}
                    className={`${buttonClass} bg-red-800 text-white hover:bg-red-900 border-0`}
                >
                    {deleting ? 'Deleting...' : 'Delete project'}
                </Button>
            </section>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete engagement?</DialogTitle>
                        <DialogDescription>
                            Permanently delete this engagement in Pockett? All members will be removed and Drive access revoked.
                            The engagement folder will remain in Google Drive for the firm admin to access directly. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleDeleteProject}
                            disabled={deleting}
                            className="bg-red-800 text-white hover:bg-red-900 border-0"
                        >
                            {deleting ? 'Deleting...' : 'Delete engagement'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
