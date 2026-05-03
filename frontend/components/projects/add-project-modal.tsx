'use client'

import React, { useEffect, useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SquarePlus, Info, ChevronDown, Check } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SandboxInfoBanner } from "@/components/ui/sandbox-info-banner"
import { createProject, type LwCrmEngagementStatus } from '@/lib/actions/project'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

interface AddProjectModalProps {
    orgSlug: string
    clientSlug: string
    /** Server-known flag so sandbox is enforced before client fetch completes */
    firmSandboxOnly?: boolean
    trigger?: React.ReactNode
}

export function AddProjectModal({ orgSlug, clientSlug, firmSandboxOnly = false, trigger }: AddProjectModalProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [status, setStatus] = useState<LwCrmEngagementStatus>('ACTIVE')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [contractType, setContractType] = useState('')
    const [contractTypeOpen, setContractTypeOpen] = useState(false)
    const [contractTypeIsCustom, setContractTypeIsCustom] = useState(false)
    const [rateOrValue, setRateOrValue] = useState('')
    const [tagsInput, setTagsInput] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [capBlocked, setCapBlocked] = useState(false)
    const [capMessage, setCapMessage] = useState<string | null>(null)
    const router = useRouter()
    useEffect(() => {
        let mounted = true
        const run = async () => {
            try {
                const response = await fetch(`/api/billing/engagement-gate?firmSlug=${encodeURIComponent(orgSlug)}`)
                if (!response.ok) return
                const payload = (await response.json()) as { allowed?: boolean; cap?: number | null; count?: number }
                if (!mounted) return
                const blocked = payload.allowed === false
                setCapBlocked(blocked)
                if (blocked) {
                    const cap = typeof payload.cap === 'number' ? payload.cap : null
                    const count = typeof payload.count === 'number' ? payload.count : null
                    if (cap != null && count != null) {
                        setCapMessage(`Engagement limit reached (${count}/${cap}) for this firm group. Upgrade to add more.`)
                    } else {
                        setCapMessage('Engagement limit reached for this firm group. Upgrade to add more.')
                    }
                } else {
                    setCapMessage(null)
                }
            } catch {
                // best effort: keep form usable if gate lookup fails
            }
        }
        run()
        return () => {
            mounted = false
        }
    }, [orgSlug])

    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)

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

    const parseTags = (raw: string) =>
        raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (isSandboxFirm || capBlocked) {
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            await createProject(orgSlug, clientSlug, {
                name,
                description: description || undefined,
                status,
                startDate: startDate ? new Date(startDate).toISOString() : undefined,
                endDate: endDate ? new Date(endDate).toISOString() : undefined,
                contractType: contractType.trim() || undefined,
                rateOrValue: rateOrValue.trim() || undefined,
                tags: parseTags(tagsInput),
            })
            setOpen(false)
            setName('')
            setDescription('')
            setStatus('ACTIVE')
            setStartDate('')
            setEndDate('')
            setContractType('')
            setContractTypeIsCustom(false)
            setContractTypeOpen(false)
            setRateOrValue('')
            setTagsInput('')
            setError(null)
            // Keep user on engagement cards/list tab after creation.
            router.push(`/d/f/${orgSlug}/c/${clientSlug}?tab=projects`, { scroll: false })
            router.refresh()
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Failed to create engagement")
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
                        disabled={capBlocked}
                    >
                        <SquarePlus className="h-4 w-4" />
                        New Engagement
                    </Button>
                ),
            )}
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[480px] border-slate-200 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-slate-900">New Engagement</DialogTitle>
                    <DialogDescription className="text-slate-600">
                        Create a new engagement for this client.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    {isSandboxFirm && <SandboxInfoBanner />}
                    {error && (
                        <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-md">
                            {error}
                        </div>
                    )}
                    {capBlocked && capMessage && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-md">
                            {capMessage}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="name" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Engagement Name <span className="text-slate-500">*</span>
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Q1 Audit"
                            required={!isSandboxFirm}
                            disabled={isSandboxFirm || capBlocked || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="eng-status" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Status</Label>
                        <Select value={status} onValueChange={(value) => setStatus(value as LwCrmEngagementStatus)} disabled={isSandboxFirm || capBlocked || isLoading}>
                            <SelectTrigger id="eng-status" className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PLANNED">Planned</SelectItem>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="PAUSED">Paused</SelectItem>
                                <SelectItem value="COMPLETED">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="start" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Start (optional)</Label>
                            <Input
                                id="start"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                disabled={isSandboxFirm || capBlocked || isLoading}
                                className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>End (optional)</Label>
                            <Input
                                id="end"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                disabled={isSandboxFirm || capBlocked || isLoading}
                                className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Description (optional)
                        </Label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief engagement description"
                            rows={2}
                            disabled={isSandboxFirm || capBlocked || isLoading}
                            className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ctype" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Contract type (optional)</Label>
                        <DropdownMenu open={contractTypeOpen} onOpenChange={setContractTypeOpen}>
                            <DropdownMenuTrigger asChild disabled={isSandboxFirm || capBlocked || isLoading}>
                                <button
                                    id="ctype"
                                    className="w-full h-10 flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <span className={contractType ? 'text-slate-900' : 'text-slate-400'}>
                                        {contractType || 'Select a contract type'}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
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
                                            <Check className="h-4 w-4 text-slate-700" />
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
                                        className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                                    />
                                    {contractTypeIsCustom && contractType && (
                                        <Check className="h-4 w-4 text-slate-700 shrink-0" />
                                    )}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rate" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Rate / value</Label>
                        <Input
                            id="rate"
                            value={rateOrValue}
                            onChange={(e) => setRateOrValue(e.target.value)}
                            placeholder="Optional"
                            disabled={isSandboxFirm || capBlocked || isLoading}
                            className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="tags" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>Tags</Label>
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent variant="light" side="right">
                                        <div className="text-xs space-y-1">
                                            <div className="font-semibold">Suggested tags:</div>
                                            <div><span className="font-medium">Priority:</span> high-priority, urgent, rush</div>
                                            <div><span className="font-medium">Client:</span> new-client, key-account, vip, pro-bono</div>
                                            <div><span className="font-medium">Work type:</span> tax, audit, compliance, m&a, litigation, advisory, restructuring</div>
                                            <div><span className="font-medium">Billing:</span> billable, non-billable, recurring, one-time</div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Input
                            id="tags"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="Comma-separated"
                            disabled={isSandboxFirm || capBlocked || isLoading}
                            className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button
                            variant="blackCta"
                            type="submit"
                            disabled={isSandboxFirm || capBlocked || isLoading || !name.trim()}
                        >
                            {isLoading && <LoadingSpinner size="sm" />}
                            Create Engagement
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    )
}
