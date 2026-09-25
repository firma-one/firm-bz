'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, Settings, CreditCard } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import type { BillingCurrentPlanState, BillingPlanEntitlements, BillingPlanUsage } from '@/components/billing/polar-plans-picker'
import { Button } from '@/components/ui/button'
import { openPolarCustomerPortalSession } from '@/lib/billing/open-polar-customer-portal'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { isScheduledToCancel, planNameForSummary, validUntilForSummary } from '@/lib/billing/subscription-display'
import { cn } from '@/lib/utils'

function daysLabel(value: number | null): string {
    if (value === null) return '∞'
    if (value === 0) return '—'
    return `${value}d`
}

function UsageBar({
    label,
    cap,
    used,
}: {
    label: string
    cap: number | null
    used: number | null
}) {
    const isUnlimited = cap === null
    const pct = isUnlimited || used === null ? 0 : Math.min(100, (used / cap!) * 100)
    const isAtCap = !isUnlimited && used !== null && used >= cap!
    const isNearCap = !isUnlimited && !isAtCap && used !== null && pct >= 80

    const barColor = isAtCap
        ? 'bg-rose-500'
        : isNearCap
        ? 'bg-amber-400'
        : 'bg-primary'

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-[#45474c] whitespace-nowrap">{label}</span>
                <span className={cn('text-[10px] tabular-nums font-medium whitespace-nowrap', isAtCap ? 'text-rose-600' : 'text-[#1b1b1d]')}>
                    {isUnlimited ? '∞' : used === null ? '—' : `${used} / ${cap}`}
                </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
                {!isUnlimited && (
                    <div
                        className={cn('h-full rounded-full transition-all', barColor)}
                        style={{ width: `${pct}%` }}
                    />
                )}
            </div>
        </div>
    )
}

function RetentionStat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] text-[#45474c] whitespace-nowrap">{label}</span>
            <span className="text-[13px] font-bold leading-none text-primary tabular-nums">{value}</span>
        </div>
    )
}

function PlanEntitlementsSection({
    e,
    usage,
}: {
    e: BillingPlanEntitlements
    usage: BillingPlanUsage | null | undefined
}) {
    return (
        <div className="mt-3 pt-3 border-t border-primary/15">
            <SectionLabel>Plan usage</SectionLabel>
            {/* One grid for everything, so bars and retention share the same columns instead of a
                five-across row competing with a side rail. Two columns on narrow screens. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
                <UsageBar label={e.firms === 1 ? 'firm' : 'firms'} cap={e.firms} used={usage?.firms ?? null} />
                <UsageBar label={e.clients === 1 ? 'client' : 'clients'} cap={e.clients} used={usage?.clients ?? null} />
                <UsageBar label={e.engagements === 1 ? 'engagement' : 'engagements'} cap={e.engagements} used={usage?.engagements ?? null} />
                <UsageBar label={e.documents === 1 ? 'document' : 'documents'} cap={e.documents} used={usage?.documents ?? null} />
                <UsageBar label={e.clientContacts === 1 ? 'contact' : 'contacts'} cap={e.clientContacts} used={usage?.clientContacts ?? null} />
                {/* Retention has no usage concept — just the policy — so it renders as a value,
                    not a bar, but still occupies a grid cell to keep the alignment. */}
                <RetentionStat value={e.auditDays === 0 ? 'No' : daysLabel(e.auditDays)} label="audit trail" />
                <RetentionStat value={daysLabel(e.commentHistoryDays)} label="comments" />
            </div>
        </div>
    )
}

/** Small caps heading shared by the usage subsections. */
function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#45474c]">
            {children}
        </p>
    )
}

/**
 * AI credit usage, as its own subsection matching the plan-usage grid.
 *
 * Separate from PlanEntitlementsSection because that only renders when a cap exists, and a group on
 * the free plan still uses AI and still needs to see it.
 *
 * The per-feature bars are proportions of this period's own total, NOT progress toward a limit —
 * there is no limit. They answer "where did the credits go", which is the question phase 2 needs
 * answered before a cap number can be chosen. The heading says "no limit applied" so the bars are
 * not read as an allowance running down.
 */
function AiCreditsRow({ usage }: { usage: BillingPlanUsage | null | undefined }) {
    const ai = usage?.aiCredits ?? null
    if (!ai) return null

    const AI_FEATURES: Array<{ key: keyof typeof ai.byFeature; label: string }> = [
        { key: 'summary', label: 'summaries' },
        { key: 'chat', label: 'chat answers' },
        { key: 'brief', label: 'firm briefs' },
        { key: 'searchInterpret', label: 'Ask searches' },
    ]
    const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1))
    const since = new Date(ai.periodStartIso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

    return (
        <div className="mt-3 pt-3 border-t border-primary/15">
            <div className="mb-2 flex items-baseline gap-2 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#45474c]">
                    AI credits
                </p>
                <span className="text-[10px] text-[#45474c]">
                    {fmt(ai.used)} used since {since}
                </span>
                <span className="text-[10px] text-gray-400">· no limit applied</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
                {AI_FEATURES.map(({ key, label }) => {
                    const value = ai.byFeature[key] ?? 0
                    // Share of this period's total, not of a cap.
                    const pct = ai.used > 0 ? Math.min(100, (value / ai.used) * 100) : 0
                    return (
                        <div key={key} className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[10px] text-[#45474c] whitespace-nowrap">{label}</span>
                                <span className="text-[10px] tabular-nums font-medium text-[#1b1b1d] whitespace-nowrap">
                                    {fmt(value)}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary/60 transition-all"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}


type Props = {
    currentPlanState: BillingCurrentPlanState | null
    loading: boolean
    /** `embedded` = inside workspace card (tighter chrome, dashboard-neutral). */
    variant?: 'default' | 'embedded'
    /** When set with `portalReturnPath`, billing admins can open Polar customer portal from this card. */
    firmId?: string
    portalReturnPath?: string
    /**
     * Billing entity shown as the card's first row. Previously a separate card beside this one,
     * which split one subject — who is billed and what they are on — across two boxes.
     */
    entity?: { kind: string; name: string | null } | null
}

export function CurrentPlanSummary({
    currentPlanState,
    loading,
    variant = 'embedded',
    firmId,
    portalReturnPath,
    entity,
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
            ? 'rounded border-2 border-primary/30 bg-primary/5 px-4 py-4 sm:px-5 shadow-md'
            : 'rounded border-2 border-primary/30 bg-primary/5 px-4 py-4 sm:px-5 shadow-md'
    )

    if (loading) {
        return (
            <div className={shell} aria-busy="true" aria-live="polite">
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
    const entitlements = currentPlanState.entitlements ?? null
    const usage = currentPlanState.usage ?? null
    const isFirmBillingAdmin = Boolean(currentPlanState.isFirmBillingAdmin)
    const canOpenCustomerPortal = Boolean(currentPlanState.canOpenCustomerPortal)
    const showManageSubscription = Boolean(firmId) && isFirmBillingAdmin && canOpenCustomerPortal

    // Show entitlements section whenever at least one cap is defined
    const hasCaps = entitlements && (
        entitlements.firms !== null ||
        entitlements.clients !== null ||
        entitlements.engagements !== null ||
        entitlements.documents !== null ||
        entitlements.clientContacts !== null ||
        entitlements.auditDays !== null ||
        entitlements.commentHistoryDays !== null
    )

    return (
        <div className={shell}>
            {/* Identity block: billing entity above plan, sharing one two-column grid so "Plan"
                sits under "Billing Entity Type" and "Valid until" under "Billing Entity Name".
                No divider between them — they describe the same subject, and a rule implied two
                unrelated sections. Manage spans both rows. */}
            {/* items-center so the icon sits across both rows rather than against the first. */}
            <div className="flex items-center justify-between gap-4">
                {/* Carried over from the standalone entity card this block replaced. */}
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-primary/25 bg-white text-primary shadow-sm">
                    <CreditCard className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 items-baseline">
                    {entity && (
                        <>
                            <p className={cn('text-xs whitespace-nowrap', labelClass)}>
                                <span className="font-medium">Billing Entity Type:</span>{' '}
                                <span className={valueClass}>{entity.kind}</span>
                            </p>
                            <p className={cn('text-xs min-w-0', labelClass)}>
                                {entity.name && (
                                    <>
                                        <span className="font-medium">Billing Entity Name:</span>{' '}
                                        <span className={valueClass}>{entity.name}</span>
                                    </>
                                )}
                            </p>
                        </>
                    )}

                    <p className={cn('text-xs whitespace-nowrap', labelClass)}>
                        <span className="font-medium">{upgradeCopy.currentPlanLabelPlan}:</span>{' '}
                        <span className={valueClass}>{planName}</span>
                    </p>
                    <p className={cn('text-xs flex items-center gap-1.5 min-w-0', labelClass)}>
                        <span className="font-medium whitespace-nowrap">{validUntilLabel}:</span>{' '}
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
                <div className="shrink-0">
                    <Button
                        type="button"
                        variant="blackCta"
                        className="h-auto py-1.5 px-4 gap-2 rounded text-[10px] font-headline font-bold tracking-widest uppercase"
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
                    {portalError ? <p className="mt-2 text-right text-sm text-red-600">{portalError}</p> : null}
                </div>
            ) : null}
            </div>
            {/* Entitlement usage bars */}
            {hasCaps && entitlements && (
                <PlanEntitlementsSection e={entitlements} usage={usage} />
            )}
            {/* Outside the hasCaps guard: a free-plan group has no caps but still uses AI. */}
            <AiCreditsRow usage={usage} />
        </div>
    )
}
