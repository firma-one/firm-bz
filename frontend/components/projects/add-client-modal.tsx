'use client'

import React, { useState, useEffect } from 'react'
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
import { UserPlus } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SandboxInfoBanner } from "@/components/ui/sandbox-info-banner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createClient, type LwCrmClientStatus } from '@/lib/actions/client'
import { getFirmMembers } from '@/lib/actions/firm-members'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

interface AddClientModalProps {
    orgSlug: string
    firmId?: string
    /** Server-known flag so sandbox is enforced before client fetch completes */
    firmSandboxOnly?: boolean
    trigger?: React.ReactNode
}

export function AddClientModal({ orgSlug, firmId, firmSandboxOnly = false, trigger }: AddClientModalProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [industry, setIndustry] = useState('')
    const [status, setStatus] = useState<LwCrmClientStatus>('ACTIVE')
    const [website, setWebsite] = useState('')
    const [description, setDescription] = useState('')
    const [tagsInput, setTagsInput] = useState('')
    const [ownerId, setOwnerId] = useState<string | null>(null)
    const [memberOptions, setMemberOptions] = useState<{ userId: string; label: string }[]>([])

    const [error, setError] = useState<string | null>(null)

    const router = useRouter()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)

    useEffect(() => {
        if (!open || !firmId) return
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
    }, [open, firmId])

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

        if (isSandboxFirm) {
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            await createClient(orgSlug, {
                name,
                industry: industry || undefined,
                status,
                website: website.trim() || undefined,
                description: description.trim() || undefined,
                tags: parseTags(tagsInput),
                ownerId,
            })
            setOpen(false)
            setName('')
            setIndustry('')
            setStatus('ACTIVE')
            setWebsite('')
            setDescription('')
            setTagsInput('')
            setOwnerId(null)
            setError(null)

            // Keep user on the Clients list view after creation.
            router.push(`/d/f/${orgSlug}?tab=clients`, { scroll: false })
            router.refresh()
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
                        <Label htmlFor="tags" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                            Tags (optional)
                        </Label>
                        <Input
                            id="tags"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="Comma-separated"
                            disabled={isSandboxFirm || isLoading}
                            className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    {firmId ? (
                        <div className="space-y-2">
                            <Label htmlFor="owner" className={isSandboxFirm ? 'text-slate-500' : 'text-slate-900'}>
                                Owner (optional)
                            </Label>
                            <Select
                                value={ownerId ?? '__none__'}
                                onValueChange={(v) => setOwnerId(v === '__none__' ? null : v)}
                                disabled={isSandboxFirm || isLoading}
                            >
                                <SelectTrigger id="owner" className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                                    <SelectValue placeholder="No owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No owner</SelectItem>
                                    {memberOptions.map((m) => (
                                        <SelectItem key={m.userId} value={m.userId}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
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
