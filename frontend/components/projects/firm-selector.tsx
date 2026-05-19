'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, SquarePlus } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select"
import { FirmSwitchDialog } from './firm-switch-dialog'
import { AddFirmModal } from './add-firm-modal'
import { useAuth } from '@/lib/auth-context'
import { useCanCreateAdditionalFirm } from '@/lib/hooks/use-can-create-additional-firm'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
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
}

export function FirmSelector({ firms, selectedFirmSlug, onFirmChange, className, compact }: FirmSelectorProps) {
    const { user } = useAuth()
    const { canCreateAdditionalFirm, loadingEntitlement } = useCanCreateAdditionalFirm(user?.id)
    const addFirmDisabled = !user?.id || loadingEntitlement || !canCreateAdditionalFirm
    const showAddFirmUpgradeHint = Boolean(user?.id) && !loadingEntitlement && !canCreateAdditionalFirm

    const pathname = usePathname()
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetOrg, setTargetOrg] = useState<{ slug: string; name: string } | null>(null)
    const [addOrgModalOpen, setAddOrgModalOpen] = useState(false)

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
            <Select value={selectedFirmSlug} onValueChange={handleValueChange}>
                {compact ? (
                    <SelectTrigger className="flex h-8 w-full items-center gap-2 rounded border-none bg-transparent px-3 py-1 text-[#1b1b1d] shadow-none transition-colors hover:bg-[#f3f4f6] focus:ring-0 [&>svg]:ml-auto [&>svg]:shrink-0">
                        <Building2 className="h-4 w-4 shrink-0 text-[#45474c]" />
                        <span className="d-sidebar-section truncate flex-1 text-left">
                            {selectedOrg?.name || 'Select Workspace...'}
                        </span>
                        {selectedOrg?.sandboxOnly && (
                            <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 whitespace-nowrap shrink-0">
                                Sandbox
                            </span>
                        )}
                    </SelectTrigger>
                ) : (
                    <SelectTrigger className="flex h-auto min-h-0 w-full min-w-0 items-start gap-2 whitespace-normal rounded border-none bg-transparent px-3 pt-2 pb-1.5 text-[#1b1b1d] shadow-none transition-colors hover:bg-[#f3f4f6] focus:ring-0 [&>svg]:ml-auto [&>svg]:mt-0.5 [&>svg]:shrink-0">
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
                                    <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 whitespace-nowrap shrink-0">
                                        Sandbox
                                    </span>
                                )}
                            </div>
                        </div>
                    </SelectTrigger>
                )}
                <SelectContent
                    sideOffset={4}
                    className="d-app max-h-[min(70vh,24rem)] min-w-[var(--radix-select-trigger-width)] max-w-[min(100vw-1.5rem,18rem)] overflow-y-auto overflow-x-hidden rounded border border-[#e5e7eb] bg-white p-0 shadow-md"
                    viewportClassName="space-y-0 px-0 pb-2 pt-0"
                    data-firm-selector
                >
                    {showAddFirmUpgradeHint ? (
                        <div
                            className="w-full max-w-full border-b border-[#e5e7eb] bg-[#f3f4f6] px-3 py-2.5"
                            onPointerDown={(e) => e.stopPropagation()}
                            role="presentation"
                        >
                            <div className="flex items-start gap-2 min-w-0">
                                <SquarePlus className="h-4 w-4 shrink-0 text-[#45474c] translate-y-0.5" aria-hidden />
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="text-sm font-medium text-[#1b1b1d] leading-snug">
                                        {upgradeCopy.dropdownHeadline}
                                    </p>
                                    <p className="text-xs text-[#45474c] leading-snug mt-1.5">
                                        {upgradeCopy.dropdownBody}
                                    </p>
                                    <Link
                                        href={buildBillingPageHref({
                                            firmSlug: firmForBilling?.slug ?? null,
                                            pathname: pathname ?? null,
                                        })}
                                        className="mt-2 inline-block text-xs font-semibold text-[#069668] hover:text-[#065f46] underline-offset-2 hover:underline text-left"
                                    >
                                        {upgradeCopy.dropdownAction}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <SelectItem
                            value={ADD_FIRM_VALUE}
                            disabled={addFirmDisabled}
                            className="w-full cursor-pointer items-stretch rounded-none border-0 bg-[#ecfdf5] px-3 py-3 text-left text-[0.8125rem] text-[#069668] outline-none ring-0 ring-offset-0 focus:bg-[#d1fae5] focus:text-[#065f46] focus-visible:ring-0 data-[highlighted]:bg-[#d1fae5] data-[highlighted]:text-[#065f46] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&>span:last-child]:block [&>span:last-child]:min-w-0 [&>span:last-child]:w-full"
                        >
                            <div className="flex w-full min-w-0 items-center gap-2.5">
                                <SquarePlus className="h-4 w-4 shrink-0 text-[#069668]" aria-hidden />
                                <span className="font-semibold text-[#069668]">Add Firm</span>
                            </div>
                        </SelectItem>
                    )}
                    <div className="h-px w-full shrink-0 bg-[#e5e7eb]" role="separator" aria-hidden />
                    {firms.map((org, index) => (
                        <React.Fragment key={org.id}>
                            {index > 0 ? (
                                <div className="h-px w-full shrink-0 bg-[#e5e7eb]" role="separator" aria-hidden />
                            ) : null}
                            <SelectItem
                                value={org.slug}
                                textValue={org.name}
                                className="min-w-0 w-full cursor-pointer items-stretch rounded-none border-0 px-3 py-2.5 text-left text-[0.8125rem] text-[#45474c] outline-none ring-0 ring-offset-0 focus:bg-[#f9f9fb] focus:text-[#1b1b1d] focus-visible:ring-0 data-[highlighted]:bg-[#f9f9fb] data-[highlighted]:text-[#1b1b1d] data-[state=checked]:text-[#069668] [&>span:last-child]:block [&>span:last-child]:min-w-0 [&>span:last-child]:w-full"
                            >
                                <div className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
                                    <div className="flex min-w-0 w-full items-center gap-2">
                                        <Building2 className="h-4 w-4 shrink-0 text-[#45474c]" aria-hidden />
                                        <span className="line-clamp-1 min-w-0 flex-1 font-medium text-[#1b1b1d]" title={org.name}>
                                            {org.name}
                                        </span>
                                    </div>
                                    <div className="flex w-full items-center justify-between gap-2 pl-6">
                                        <span className="truncate font-mono text-[10px] text-[#45474c]">
                                            /{org.slug}
                                        </span>
                                        {org.sandboxOnly && (
                                            <span className="inline-flex shrink-0 items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                                Sandbox
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </SelectItem>
                        </React.Fragment>
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
