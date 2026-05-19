'use client'

import { useCallback, useState } from 'react'
import { Loader2, Settings } from 'lucide-react'

import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { Button } from '@/components/ui/button'
import { openPolarCustomerPortalSession } from '@/lib/billing/open-polar-customer-portal'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { planNameForSummary, validUntilForSummary } from '@/lib/billing/subscription-display'
import { cn } from '@/lib/utils'

type Props = {
    currentPlanState: BillingCurrentPlanState | null
    loading: boolean
    /** `embedded` = inside workspace card (tighter chrome, dashboard-neutral). */
    variant?: 'default' | 'embedded'
    /** When set with `portalReturnPath`, billing admins can open Polar customer portal from this card. */
    firmId?: string
    portalReturnPath?: string
}

export function CurrentPlanSummary({
    currentPlanState,
    loading,
    variant = 'embedded',
    firmId,
    portalReturnPath,
}: Props) {
    const [portalLoading, setPortalLoading] = useState(false)
    const [portalError, setPortalError] = useState<string | null>(null)

    const openBillingPortal = useCallback(async () => {
        if (!firmId) return
        setPortalError(null)
        setPortalLoading(true)
        try {
            const result = await openPolarCustomerPortalSession({
                firmId,
                returnTo: portalReturnPath?.trim() || '/d/billing',
            })
            if (result.ok) {
                window.location.href = result.url
                return
            }
            setPortalError(result.error)
        } finally {
            setPortalLoading(false)
        }
    }, [firmId, portalReturnPath])

    const labelClass = 'text-[#45474c]'
    const valueClass = 'font-bold text-[#1b1b1d]'
    const shell = cn(
        variant === 'embedded'
            ? 'rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb] px-3.5 py-3 sm:px-4'
            : 'rounded-[2px] border border-[#e5e7eb] bg-white px-4 py-4 sm:px-5'
    )

    if (loading) {
        return (
            <div
                className={shell}
                aria-busy="true"
                aria-live="polite"
            >
                <div className="flex items-center gap-2 text-xs text-[#45474c]">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#45474c]/60" aria-hidden />
                    <span>Loading plan…</span>
                </div>
            </div>
        )
    }

    if (!currentPlanState) {
        return (
            <div className={shell}>
                <p className="text-xs text-[#45474c]">{upgradeCopy.currentPlanSummaryUnavailable}</p>
            </div>
        )
    }

    const planName = planNameForSummary(currentPlanState)
    const validUntil = validUntilForSummary(currentPlanState)
    const isFirmBillingAdmin = Boolean(currentPlanState.isFirmBillingAdmin)
    const canOpenCustomerPortal = Boolean(currentPlanState.canOpenCustomerPortal)
    const showManageSubscription =
        Boolean(firmId) && isFirmBillingAdmin && canOpenCustomerPortal

    return (
        <div
            className={cn(
                shell,
                showManageSubscription &&
                    'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5'
            )}
        >
            <div className="min-w-0 flex-1">
                <p className={cn('text-xs leading-relaxed', labelClass)}>
                    <span className="font-medium">{upgradeCopy.currentPlanLabelPlan}:</span>{' '}
                    <span className={valueClass}>{planName}</span>
                </p>
                <p className={cn('mt-2 text-xs leading-relaxed', labelClass)}>
                    <span className="font-medium">{upgradeCopy.currentPlanLabelValidUntil}:</span>{' '}
                    <span className={cn('tabular-nums', valueClass)}>{validUntil}</span>
                </p>
            </div>
            {showManageSubscription ? (
                <div className="flex w-full shrink-0 flex-col sm:w-auto sm:items-end">
                    <Button
                        type="button"
                        variant="greenCta"
                        className="h-auto py-1.5 px-4 w-full min-w-[6.5rem] gap-2 rounded-[2px] sm:w-auto text-[10px] font-headline font-bold tracking-widest uppercase"
                        disabled={portalLoading}
                        onClick={() => void openBillingPortal()}
                    >
                        {portalLoading ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-90" aria-hidden />
                        ) : (
                            <Settings className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                        )}
                        {portalLoading ? upgradeCopy.billingPortalOpening : upgradeCopy.billingPortalManageShortCta}
                    </Button>
                    {portalError ? <p className="mt-2 max-w-[14rem] text-right text-sm text-red-600">{portalError}</p> : null}
                </div>
            ) : null}
        </div>
    )
}
