'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { AlertTriangle, Building2, CalendarClock, Settings, CreditCard } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import type { BillingCurrentPlanState, BillingPlanEntitlements, BillingPlanUsage } from '@/components/billing/polar-plans-picker'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PropertyList, PropertyRow } from '@/components/ui/property-list'
import { LoadingAnnouncement, ShimmerBar } from '@/components/ui/shimmer'
import { Tag } from '@/components/ui/tag'
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

    // Status colors come from the tag palette: orange as the cap nears, danger once it is reached.
    const barColor = isAtCap
        ? 'bg-danger'
        : isNearCap
        ? 'bg-tag-orange-fg'
        : 'bg-action'

    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-small text-fg-muted">{label}</span>
            <span className={cn('text-ui font-medium tabular-nums', isAtCap ? 'text-danger' : 'text-fg')}>
                {isUnlimited ? '∞' : used === null ? '—' : `${used} / ${cap}`}
            </span>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                {!isUnlimited && (
                    <div
                        className={cn('h-full rounded-full transition-[width] duration-300', barColor)}
                        style={{ width: `${pct}%` }}
                    />
                )}
            </div>
        </div>
    )
}

function RetentionStat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-small text-fg-muted">{label}</span>
            <span className="text-ui font-medium tabular-nums text-fg">{value}</span>
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
        <div className="mt-4 border-t border-line pt-4">
            <SectionLabel>Plan usage</SectionLabel>
            {/* One grid for everything, so bars and retention share the same columns instead of a
                five-across row competing with a side rail. Two columns on narrow screens. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {/* Clients and AI credits only — see PUBLISHED_ENTITLEMENTS. Firms, engagements,
                    contacts, deliverables and documents remain enforced, just not advertised. */}
                <UsageBar label={e.clients === 1 ? 'Client' : 'Clients'} cap={e.clients} used={usage?.clients ?? null} />
                {/* Retention has no usage concept — just the policy — so it renders as a value,
                    not a bar, but still occupies a grid cell to keep the alignment. */}
                <RetentionStat value={e.auditDays === 0 ? 'No' : daysLabel(e.auditDays)} label="Audit trail" />
                <RetentionStat value={daysLabel(e.commentHistoryDays)} label="Comments" />
            </div>
        </div>
    )
}

/** Sentence-case label shared by the usage subsections. */
function SectionLabel({ children }: { children: ReactNode }) {
    return <p className="mb-3 text-small font-medium text-fg-muted">{children}</p>
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
    // One categorical color per feature (the chart palette in ui-tokens.css), like a context-usage
    // breakdown: the question this answers is "which feature spent the credits", so each one needs
    // its own hue. What's left of the allowance is the gray track, listed last as "Remaining".
    const chart = (c: string) => `var(--ui-chart-${c})`
    const AI_FEATURES: Array<{ key: keyof typeof ai.byFeature; label: string; fill: string }> = [
        { key: 'brief', label: 'Firm briefs', fill: chart('blue') },
        { key: 'searchInterpret', label: 'Firm Doc Search', fill: chart('orange') },
        { key: 'summary', label: 'Engagement summaries', fill: chart('green') },
        { key: 'chat', label: 'Engagement assistant chat', fill: chart('yellow') },
        { key: 'filesAgent', label: 'Files agent', fill: chart('purple') },
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
        <div className="mt-4 border-t border-line pt-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-small font-medium text-fg-muted">
                    AI credits
                </p>
                <span className="text-caption tabular-nums text-fg-muted">
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
                    <span className={cn('text-caption tabular-nums', nearlyOut ? 'text-tag-orange-fg' : 'text-fg-muted')}>
                        · {fmt(remaining!)} left
                    </span>
                ) : ai.allowance != null ? (
                    <span className="text-caption tabular-nums text-fg-subtle">· {fmt(ai.allowance)} included</span>
                ) : null}
            </div>
            {/* One stacked bar: each segment is a feature's share, and when a cap is live the
                segments are scaled against the ALLOWANCE so the unfilled remainder is the credits
                still available. Without a cap there is no remainder to show, so the segments fill
                the track and the bar reads as a pure composition of what was spent. */}
            <TooltipProvider delayDuration={150}>
                <div
                    className="mb-3 flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-muted"
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
                                        className="h-full transition-[width] duration-300 first:rounded-l-full last:rounded-r-full"
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
            {/* Legend doubles as the per-feature readout: swatch, feature, credits and its share —
                of the allowance when a cap is live (so the rows plus Remaining add up to 100%),
                otherwise of what was spent. */}
            {(() => {
                const denominator = hasLiveCap ? ai.allowance! : ai.used
                const share = (n: number) => (denominator > 0 ? `${((n / denominator) * 100).toFixed(1)}%` : '—')
                const rows = [
                    ...AI_FEATURES.map(({ key, label, fill }) => ({ key: String(key), label, fill, value: ai.byFeature[key] ?? 0 })),
                    ...(hasLiveCap ? [{ key: 'remaining', label: 'Remaining', fill: 'var(--ui-surface-muted)', value: remaining! }] : []),
                ]
                return (
                    <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                        {rows.map(({ key, label, fill, value }) => (
                            <div key={key} className="flex min-w-0 items-center gap-2 text-small">
                                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', key === 'remaining' && 'ring-1 ring-inset ring-line-strong')} style={{ backgroundColor: fill }} aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate text-fg-muted">{label}</span>
                                <span className="tabular-nums text-fg">{fmt(value)}</span>
                                <span className="w-12 text-right tabular-nums text-fg-subtle">{share(value)}</span>
                            </div>
                        ))}
                    </div>
                )
            })()}
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

    // One flat card (the plan plus who is billed), like the firm Overview cards: hairline, no shadow.
    const shell = cn(
        'rounded-card border border-line bg-surface',
        variant === 'embedded' ? 'p-5' : 'p-5 sm:p-6'
    )
    const heading = <h2 className="text-h3 text-fg">Current plan</h2>

    if (loading) {
        return (
            <div className={shell} aria-busy="true" aria-live="polite">
                <LoadingAnnouncement label="Loading plan…" />
                {heading}
                {/* Shaped like the property rows that are coming, so nothing jumps when they land. */}
                <div className="mt-2 flex flex-col gap-0.5">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex h-9 items-center gap-2">
                            <ShimmerBar className="w-20 shrink-0 sm:w-24" />
                            <span className="w-8 shrink-0 sm:w-16" aria-hidden />
                            <ShimmerBar className={i === 0 ? 'w-44' : i === 1 ? 'w-24' : 'w-32'} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (!currentPlanState) {
        return (
            <div className={shell}>
                {heading}
                <p className="mt-1 text-small text-fg-muted">{upgradeCopy.currentPlanSummaryUnavailable}</p>
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
            <div className="flex items-start justify-between gap-4">
                {heading}
                {showManageSubscription ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={portalLoading}
                            onClick={() => void openBillingPortal()}
                        >
                            {portalLoading ? (
                                <LoadingSpinner size="sm" />
                            ) : (
                                <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            )}
                            {portalLoading ? upgradeCopy.billingPortalOpening : upgradeCopy.billingPortalManageShortCta}
                        </Button>
                        {portalError ? <p className="max-w-xs text-right text-small text-danger">{portalError}</p> : null}
                    </div>
                ) : null}
            </div>
            {/* Identity block as property rows: who is billed, then what they are on and until when.
                No divider between them — they describe the same subject. */}
            <PropertyList className="mt-2">
                {entity && (
                    <PropertyRow label="Billing entity" icon={<Building2 strokeWidth={1.75} aria-hidden />}>
                        {entity.name ? <span className="min-w-0 truncate font-medium">{entity.name}</span> : null}
                        <Tag color="gray">{entity.kind}</Tag>
                    </PropertyRow>
                )}
                <PropertyRow
                    label={upgradeCopy.currentPlanLabelPlan}
                    icon={<CreditCard strokeWidth={1.75} aria-hidden />}
                >
                    <span className="min-w-0 truncate font-medium">{planName}</span>
                </PropertyRow>
                <PropertyRow label={validUntilLabel} icon={<CalendarClock strokeWidth={1.75} aria-hidden />}>
                    <span className={cn('tabular-nums', scheduledCancel && 'font-medium text-danger')}>{validUntil}</span>
                    {scheduledCancel && (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        tabIndex={0}
                                        aria-label="Cancellation scheduled"
                                        className="inline-flex cursor-default items-center rounded-control text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                                    >
                                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[14rem] text-small">
                                    {upgradeCopy.scheduledCancelWarning}{' '}
                                    <span className="font-semibold">{validUntil}</span>
                                    {upgradeCopy.scheduledCancelWarningTrail}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </PropertyRow>
            </PropertyList>
            {/* Entitlement usage bars */}
            {hasCaps && entitlements && (
                <PlanEntitlementsSection e={entitlements} usage={usage} />
            )}
            {/* Outside the hasCaps guard: a free-plan group has no caps but still uses AI. */}
            <AiCreditsRow usage={usage} />
        </div>
    )
}
