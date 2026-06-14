'use client'

import React, { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Building2, SquarePlus, ChevronDown, ChevronUp, Info, Box } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FirmSwitchDialog } from './firm-switch-dialog'
import { AddFirmModal } from './add-firm-modal'
import { useAuth } from '@/lib/auth-context'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { buildBillingPageHref } from '@/lib/billing/build-billing-page-href'

const ADD_FIRM_VALUE = '__create__'

export interface FirmOption {
    id: string
    name: string
    slug: string
    isDefault: boolean
    sandboxOnly: boolean
}

interface FirmSelectorProps {
    firms: FirmOption[]
    selectedFirmSlug: string
    onFirmChange: (firmSlug: string) => void
    className?: string
    compact?: boolean
    isFirmAdmin?: boolean
}

export function FirmSelector({ firms, selectedFirmSlug, onFirmChange, className, compact, isFirmAdmin = false }: FirmSelectorProps) {
    const { user } = useAuth()
    const addFirmDisabled = !user?.id

    const pathname = usePathname()
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetOrg, setTargetOrg] = useState<{ slug: string; name: string } | null>(null)
    const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)
    const [isSelectOpen, setIsSelectOpen] = useState(false)

    const currentOrgSlug = pathname?.match(/\/(?:d\/)?f\/([^\/]+)/)?.[1] || null
    const currentOrg = currentOrgSlug ? firms.find(o => o.slug === currentOrgSlug) : null
    const selectedOrg = firms.find(o => o.slug === selectedFirmSlug) || null

    const billingContextSlug = useMemo(() => {
        return (
            currentOrgSlug ??
            selectedFirmSlug ??
            firms.find((o) => o.isDefault)?.slug ??
            firms[0]?.slug ??
            ''
        )
    }, [currentOrgSlug, selectedFirmSlug, firms])

    const firmForBilling = useMemo(() => {
        return (
            firms.find((o) => o.slug === billingContextSlug) ??
            firms.find((o) => o.isDefault) ??
            firms[0] ??
            null
        )
    }, [firms, billingContextSlug])

    const upgradeReturnPath = useMemo(() => {
        const slug = firmForBilling?.slug ?? billingContextSlug
        return validateCheckoutReturnTo(pathname ?? null) ?? (slug ? `/d/f/${slug}` : '/d')
    }, [pathname, firmForBilling, billingContextSlug])

    const handleValueChange = (orgSlug: string) => {
        if (orgSlug === ADD_FIRM_VALUE) {
            if (addFirmDisabled) {
                const href = buildBillingPageHref({
                    firmSlug: firmForBilling?.slug ?? null,
                    pathname: pathname ?? null,
                })
                window.location.assign(href)
                return
            }
            setAddOrgModalOpen(true)
            return
        }
        if (currentOrgSlug && currentOrgSlug !== orgSlug) {
            const target = firms.find(o => o.slug === orgSlug)
            if (target) {
                setTargetOrg({ slug: target.slug, name: target.name })
                setSwitchDialogOpen(true)
            }
        } else {
            onFirmChange(orgSlug)
        }
    }

    const handleDialogClose = (open: boolean) => {
        if (!open) setTargetOrg(null)
        setSwitchDialogOpen(open)
    }

    if (firms.length === 0) {
        return (
            <div className={`w-full max-w-xs ${className || ''}`}>
                <div className="w-full h-10 bg-[#f3f4f6] border border-[#e5e7eb] rounded flex items-center px-3 text-sm text-[#45474c]">
                    No firms found
                </div>
            </div>
        )
    }

    return (
        <div className={`w-full ${compact ? 'h-8 overflow-hidden' : ''} ${className || ''}`}>
            <Select value={selectedFirmSlug} onValueChange={handleValueChange} open={isSelectOpen} onOpenChange={setIsSelectOpen}>
                {compact ? (
                    <SelectTrigger className="flex h-8 w-full items-center gap-2 rounded border-none bg-transparent px-3 py-1 text-[#1b1b1d] shadow-none transition-colors hover:bg-[#f3f4f6] focus:ring-0 [&>svg]:hidden">
                        <span className="shrink-0 flex items-center"><Building2 className="h-4 w-4 text-[#45474c]" /></span>
                        <span className="d-sidebar-section truncate flex-1 text-left">
                            {selectedOrg?.name || 'Select Workspace...'}
                        </span>
                        {selectedOrg?.sandboxOnly && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="shrink-0 flex items-center" aria-label="Demo firm">
                                        <Box className="h-3.5 w-3.5 text-[#9ca3af]" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    Demo Firm — contains sample data
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <span className="ml-auto shrink-0 flex items-center">
                            {isSelectOpen
                                ? <ChevronUp className="h-3 w-3 text-[#9ca3af]" />
                                : <ChevronDown className="h-3 w-3 text-[#9ca3af]" />
                            }
                        </span>
                    </SelectTrigger>
                ) : (
                    <SelectTrigger className="flex h-auto min-h-0 w-full min-w-0 items-start gap-2 whitespace-normal rounded border-none bg-transparent px-3 pt-2 pb-1.5 text-[#1b1b1d] shadow-none transition-colors hover:bg-[#f3f4f6] focus:ring-0 [&>svg]:hidden">
                        <div className="flex flex-1 flex-col min-w-0 text-left leading-tight">
                            <div className="flex items-center gap-2 min-w-0">
                                <Building2 className="h-4 w-4 shrink-0 text-[#45474c]" />
                                <span className="text-sm font-semibold truncate text-[#1b1b1d]">
                                    {selectedOrg?.name || 'Select Workspace...'}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 min-w-0">
                                <span className="truncate text-[10px] leading-snug text-[#45474c] font-mono">
                                    {selectedOrg ? `/${selectedOrg.slug}` : '/—'}
                                </span>
                                {selectedOrg?.sandboxOnly && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="shrink-0 flex items-center" aria-label="Demo firm">
                                                <Box className="h-3.5 w-3.5 text-[#9ca3af]" />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                            Demo Firm — contains sample data
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                        <span className="shrink-0 flex items-start mt-0.5">
                            {isSelectOpen
                                ? <ChevronUp className="h-3.5 w-3.5 text-[#9ca3af]" />
                                : <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af]" />
                            }
                        </span>
                    </SelectTrigger>
                )}
                <SelectContent
                    sideOffset={4}
                    className="d-app max-h-[min(70vh,24rem)] min-w-[var(--radix-select-trigger-width)] max-w-[min(100vw-1.5rem,18rem)] overflow-y-auto overflow-x-hidden rounded-none border border-[#e5e7eb] bg-white py-0.5 shadow-md"
                    viewportClassName="p-1"
                    data-firm-selector
                >
                    {isFirmAdmin && (
                    <div
                        className="px-2.5 py-2 border-b border-[#e5e7eb]"
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                        role="presentation"
                    >
                        <button
                            type="button"
                            disabled={addFirmDisabled}
                            onClick={() => {
                                setIsSelectOpen(false)
                                setAddOrgModalOpen(true)
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded-[2px] border-0 bg-primary px-3 py-1.5 text-[10px] font-headline font-bold tracking-widest uppercase text-white shadow-sm transition-all hover:brightness-105 hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-sm disabled:hover:translate-y-0"
                        >
                            <SquarePlus className="h-3.5 w-3.5" aria-hidden />
                            ADD FIRM
                        </button>
                    </div>
                    )}
                    {firms.map((org) => (
                        <SelectItem
                            key={org.id}
                            value={org.slug}
                            textValue={org.name}
                            className="rounded-none cursor-pointer py-1.5 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb] data-[highlighted]:text-[#1b1b1d] [&>span:last-child]:block [&>span:last-child]:min-w-0 [&>span:last-child]:w-full"
                            endAdornment={
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                            <Info className="h-3.5 w-3.5 text-[#9ca3af] hover:text-[#45474c]" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="font-mono text-xs">
                                        /{org.slug}
                                    </TooltipContent>
                                </Tooltip>
                            }
                        >
                            <div className="flex w-full min-w-0 items-center gap-2 text-left">
                                <Building2 className="h-4 w-4 shrink-0 text-[#45474c]" aria-hidden />
                                <span className="line-clamp-1 min-w-0 font-medium text-[#1b1b1d]" title={org.name}>
                                    {org.name}
                                </span>
                                {org.sandboxOnly && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Box className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-label="Demo firm" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                            Demo Firm — contains sample data
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {targetOrg && (
                <FirmSwitchDialog
                    open={switchDialogOpen}
                    onOpenChange={handleDialogClose}
                    targetFirmSlug={targetOrg.slug}
                    targetFirmName={targetOrg.name}
                    currentFirmName={currentOrg?.name}
                />
            )}

            <AddFirmModal
                open={addOrgModalOpen}
                onOpenChange={setAddOrgModalOpen}
            />
        </div>
    )
}
