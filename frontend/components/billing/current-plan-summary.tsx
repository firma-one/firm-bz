'use client'

import { useCallback, useState } from 'react'
import { AlertTriangle, Loader2, Settings } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { Button } from '@/components/ui/button'
import { openPolarCustomerPortalSession } from '@/lib/billing/open-polar-customer-portal'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { isScheduledToCancel, planNameForSummary, validUntilForSummary } from '@/lib/billing/subscription-display'
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
    const valueClass = 'font-bold text-primary'
    const shell = cn(
        variant === 'embedded'
            ? 'rounded-[2px] border-2 border-primary/30 bg-primary/5 px-4 py-4 sm:px-5 shadow-md'
            : 'rounded-[2px] border-2 border-primary/30 bg-primary/5 px-4 py-4 sm:px-5 shadow-md'
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
    const scheduledCancel = isScheduledToCancel(currentPlanState)
    const validUntilLabel = scheduledCancel
        ? upgradeCopy.currentPlanLabelAccessEnds
        : upgradeCopy.currentPlanLabelValidUntil
    const isFirmBillingAdmin = Boolean(currentPlanState.isFirmBillingAdmin)
    const canOpenCustomerPortal = Boolean(currentPlanState.canOpenCustomerPortal)
    const showManageSubscription =
        Boolean(firmId) && isFirmBillingAdmin && canOpenCustomerPortal

    return (
        <div className={shell}>
            <div
                className={cn(
                    showManageSubscription &&
                        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5'
                )}
            >
                <div className="min-w-0 flex-1">
                    <p className={cn('text-xs leading-relaxed', labelClass)}>
                        <span className="font-medium">{upgradeCopy.currentPlanLabelPlan}:</span>{' '}
                        <span className={valueClass}>{planName}</span>
                    </p>
                    <p className={cn('mt-2 text-xs leading-relaxed flex items-center gap-1.5', labelClass)}>
                        <span className="font-medium">{validUntilLabel}:</span>{' '}
                        <span className={cn('tabular-nums', scheduledCancel ? 'text-red-600 font-bold' : valueClass)}>{validUntil}</span>
                        {scheduledCancel && (
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="inline-flex items-center cursor-default">
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[14rem] text-xs leading-relaxed">
                                        {upgradeCopy.scheduledCancelWarning}{' '}
                                        <span className="font-semibold">{validUntil}</span>
                                        {upgradeCopy.scheduledCancelWarningTrail}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </p>
                </div>
                {showManageSubscription ? (
                    <div className="flex w-full shrink-0 flex-col sm:w-auto sm:items-end">
                        <Button
                            type="button"
                            variant="blackCta"
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
        </div>
    )
}
