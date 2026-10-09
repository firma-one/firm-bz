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

/**
 * PUBLISHED ENTITLEMENTS — clients and AI credits.
 *
 * Every other entitlement stays configured in Polar, parsed, stored and ENFORCED; it is simply not
 * advertised. Firms, engagements, contacts, deliverables and documents are anti-abuse floors that
 * keep the free tier a trial, and on paid tiers most are unlimited. Publishing them invites people
 * to compare plans on numbers that only ever bind on free, and makes every future limit change a
 * pricing-page edit.
 *
 * Clients and AI credits are what genuinely differentiate the tiers, so they are what we show.
 */
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
                {/* Clients and AI credits only — see PUBLISHED_ENTITLEMENTS. Firms, engagements,
                    contacts, deliverables and documents remain enforced, just not advertised. */}
                <UsageBar label={e.clients === 1 ? 'client' : 'clients'} cap={e.clients} used={usage?.clients ?? null} />
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
 * The per-feature bars are proportions of this period's own total, not progress toward the limit —
 * they answer "where did the credits go". The allowance is reported separately, on the heading row,
 * because that is the number a user checks before deciding whether to upgrade.
 *
 * The caption is derived, never fixed. It previously read "no limit applied" unconditionally, which
 * silently became false when enforcement was turned on: the API would refuse a call with "you have
 * used your 500 AI credits" while this page said nothing was capped.
 *
 * Every tier configures an allowance (Free 25, Standard 500), so there is no "unlimited plan" to
 * describe. The caption therefore only ever states a real number — counting down when the cap is
 * enforced, naming what is included when it is not — and falls silent if the allowance did not
 * resolve at all. Silence is the honest option there: a null allowance is a fault in the data, not
 * a generous plan, and this page is the wrong place to diagnose it.
 */
function AiCreditsRow({ usage }: { usage: BillingPlanUsage | null | undefined }) {
    const ai = usage?.aiCredits ?? null
    if (!ai) return null

    // Ordered firm-scoped first, then engagement-scoped, so the two halves of the product read
    // as groups rather than an arbitrary list. Labels name the surface the credit was spent on.
    //
    // Colors are four steps of the brand green rather than a categorical palette: these segments
    // are parts of ONE measure (credits against one allowance), so varying lightness reads as a
    // single bar divided up, where four unrelated hues would read as four competing series.
    // Descending lightness also keeps the order legible at the 6px height this bar renders at.
    const AI_FEATURES: Array<{ key: keyof typeof ai.byFeature; label: string; fill: string }> = [
        { key: 'brief', label: 'Firm briefs', fill: 'hsl(var(--primary))' },
        { key: 'searchInterpret', label: 'Firm Doc Search', fill: 'hsl(161 70% 45%)' },
        { key: 'summary', label: 'Engagement summaries', fill: 'hsl(161 55% 62%)' },
        { key: 'chat', label: 'Engagement assistant chat', fill: 'hsl(161 45% 78%)' },
        { key: 'filesAgent', label: 'Files agent', fill: 'hsl(161 35% 88%)' },
    ]
    const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1))
    const since = new Date(ai.periodStartIso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

    // A cap only counts down when it is both configured and enforced; anything else is usage
    // reporting. Keeping these distinct is the whole point — see the note above.
    const hasLiveCap = ai.allowance != null && ai.enforced
    const remaining = ai.allowance != null ? Math.max(0, ai.allowance - ai.used) : null
    const usedPct = ai.allowance ? Math.min(100, (ai.used / ai.allowance) * 100) : 0
    // Warn before the refusal lands, not after: a user who sees "0 left" has already been blocked.
    const nearlyOut = hasLiveCap && usedPct >= 80

    return (
        <div className="mt-3 pt-3 border-t border-primary/15">
            <div className="mb-2 flex items-baseline gap-2 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#45474c]">
                    AI credits
                </p>
                <span className="text-[10px] text-[#45474c]">
                    {hasLiveCap
                        ? `${fmt(ai.used)} of ${fmt(ai.allowance!)} used since ${since}`
                        : `${fmt(ai.used)} used since ${since}`}
                </span>
                {/* Every tier configures `entitledAiCredits` in its Polar product — Free 25,
                    Standard 500 — so a null allowance is never "this plan is unlimited". It means
                    the value did not resolve: a stale snapshot, a misspelled metadata key, or
                    enforcement switched off. Saying "no limit applied" there would repeat the
                    original bug, telling a capped customer they are uncapped. Say nothing about
                    limits instead, and let the system admin tools report the fault. */}
                {hasLiveCap ? (
                    <span className={`text-[10px] font-medium ${nearlyOut ? 'text-amber-700' : 'text-[#45474c]'}`}>
                        · {fmt(remaining!)} left
                    </span>
                ) : ai.allowance != null ? (
                    <span className="text-[10px] text-gray-400">· {fmt(ai.allowance)} included</span>
                ) : null}
            </div>
            {/* One stacked bar: each segment is a feature's share, and when a cap is live the
                segments are scaled against the ALLOWANCE so the unfilled remainder is the credits
                still available. Without a cap there is no remainder to show, so the segments fill
                the track and the bar reads as a pure composition of what was spent. */}
            <TooltipProvider delayDuration={150}>
                <div
                    className="mb-2.5 flex h-2 w-full overflow-hidden rounded-full bg-primary/10"
                    role="img"
                    aria-label={AI_FEATURES.map(({ key, label }) => `${label}: ${fmt(ai.byFeature[key] ?? 0)}`).join(', ')}
                >
                    {AI_FEATURES.map(({ key, label, fill }) => {
                        const value = ai.byFeature[key] ?? 0
                        if (value <= 0) return null
                        const denominator = hasLiveCap ? ai.allowance! : ai.used
                        const pct = denominator > 0 ? (value / denominator) * 100 : 0
                        return (
                            // The shared Radix tooltip rather than `title=`: on a 8px-tall segment
                            // the native tooltip's delay makes the bar feel inert, and it is the
                            // only way to read a segment too thin to label.
                            <Tooltip key={key}>
                                <TooltipTrigger asChild>
                                    <div
                                        className="h-full transition-all first:rounded-l-full last:rounded-r-full"
                                        style={{ width: `${pct}%`, backgroundColor: fill }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {label}: {fmt(value)} credit{value === 1 ? '' : 's'}
                                </TooltipContent>
                            </Tooltip>
                        )
                    })}
                </div>
            </TooltipProvider>
            {/* Legend doubles as the per-feature readout, so the numbers that used to sit above
                four separate bars are still here — one row instead of a grid of tracks. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {AI_FEATURES.map(({ key, label, fill }) => {
                    const value = ai.byFeature[key] ?? 0
                    return (
                        <div key={key} className="flex items-center gap-1.5 min-w-0">
                            <span
                                className="h-2 w-2 shrink-0 rounded-[2px]"
                                style={{ backgroundColor: fill }}
                                aria-hidden="true"
                            />
                            <span className="text-[10px] text-[#45474c] whitespace-nowrap">{label}</span>
                            <span className="text-[10px] tabular-nums font-medium text-[#1b1b1d] whitespace-nowrap">
                                {fmt(value)}
                            </span>
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
    // Only the published entitlements decide whether the section renders. An unpublished cap being
    // set must not open an otherwise-empty block.
    const hasCaps = entitlements && (
        entitlements.clients !== null ||
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
