'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { BillingCatalogPlan } from '@/lib/billing/billing-catalog.types'
import {
    canonicalPlanGroupKey,
    effectiveCatalogInterval,
} from '@/lib/billing/catalog-plan-helpers'
import { openPolarCustomerPortalSession } from '@/lib/billing/open-polar-customer-portal'
import { buildPolarCheckoutHref } from '@/lib/billing/polar-checkout-href'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { BRAND_NAME } from '@/config/brand'
import { getPricingComparisonBulletsForPlan, getSandboxPlanHighlights, type PricingPlanColumnId } from '@/config/pricing'
import { BillingPolarExplainInline } from '@/components/billing/billing-polar-inline'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { LoadingAnnouncement, ShimmerBar } from '@/components/ui/shimmer'
import { Tag } from '@/components/ui/tag'

import { persistCheckoutIntent, readCheckoutIntent, type CheckoutPlanName } from '@/lib/marketing/checkout-intent'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, ChevronDown, ChevronUp, CreditCard, ExternalLink, Lock, Rows3 } from 'lucide-react'
import { EVENTS, Joyride, STATUS, type Controls, type EventData } from 'react-joyride'

type CatalogJson = { items?: BillingCatalogPlan[]; error?: string }
export type BillingPlanEntitlements = {
    firms: number | null
    clients: number | null
    clientContacts: number | null
    engagements: number | null
    documents: number | null
    auditDays: number | null
    commentHistoryDays: number | null
    isFreePlan: boolean
}

export type BillingPlanUsage = {
    firms: number | null
    clients: number | null
    engagements: number | null
    documents: number | null
    clientContacts: number | null
    aiCredits?: {
        used: number
        byFeature: Record<'brief' | 'summary' | 'chat' | 'searchInterpret' | 'filesAgent', number>
        periodStartIso: string
        /** Period allowance from `entitledAiCredits`; null when none resolved. */
        allowance: number | null
        /** False when a cap exists but `ENFORCE_BILLING_GATES` is off, so nothing is refused. */
        enforced: boolean
    } | null
}

export type BillingCurrentPlanState = {
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    subscriptionProductId?: string | null
    pricingModel: 'recurring_subscription' | 'one_time_purchase' | null
    periodEndIso: string | null
    scheduledCancelAtIso?: string | null
    canOpenCustomerPortal?: boolean
    isFirmBillingAdmin?: boolean
    entitlements?: BillingPlanEntitlements | null
    usage?: BillingPlanUsage | null
}

interface PolarPlansPickerProps {
    firmId: string
    returnPath: string
    /** Path + query for Polar portal return (must validate as /d/... on the server). */
    portalReturnPath: string
    currentPlanState?: BillingCurrentPlanState | null
    /** Tighter spacing when embedded in a dialog */
    density?: 'default' | 'compact'
    className?: string
    /**
     * @deprecated No visual effect. Was a peach (#ECC0AA) accent trial for the billing page; the New
     * UI has one accent (.claude/plans/ui-ux-overhaul.md), so the plan cards ignore it. Kept so
     * existing callers still type-check.
     */
    blueAccentTrial?: boolean
    /** Hide the catalog free (one-time) product row when current plan is shown elsewhere. */
    hideStandaloneFreePlan?: boolean
    /**
     * Show a first-visit guided tour on the billing page. When a `firma.checkoutIntent` is present
     * the tour spotlights that specific plan card; otherwise it spotlights the recommended plan.
     * Seen-state is tracked in localStorage (`firma.billingTourSeen`) so the tour only runs once.
     * Dismissal within the session also applies (ref-based, clears on unmount/refresh).
     */
    enableBillingTour?: boolean
    /** @deprecated Use enableBillingTour — kept for callers that still pass the old name. */
    enableCheckoutIntentJoyride?: boolean
    /**
     * Optional permissions precheck from `/api/permissions/firm`.
     * Used as fallback while `current-plan` is loading or temporarily unavailable.
     */
    fallbackCanManageBilling?: boolean
}

/*
 * Plan cards follow Linear / Notion pricing (.claude/plans/ui-ux-overhaul.md, Phase 6): flat cards
 * with a hairline border, the current (or intent-highlighted) plan marked by a stronger outline and
 * a tag rather than a fill, quiet feature lists and one call to action per card.
 */

/** Annual / Monthly segmented control — the same control as Doc Search's Filters / Ask. */
const PERIOD_TRACK_CLASS =
    'inline-flex shrink-0 items-center rounded-control border border-line bg-surface-subtle p-0.5'

function periodSegmentClass(active: boolean) {
    return cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] px-2 py-0.5 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30',
        active ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
    )
}

function planCardHeadingClass(compact: boolean) {
    return cn('min-w-0 text-fg', compact ? 'text-ui font-semibold' : 'text-h3')
}

/** "Billed annually" / "Billed monthly" under a price. */
const BILLED_CAPTION_CLASS = 'mt-1 text-caption font-normal text-fg-muted'

type CatalogPlanRow =
    | { kind: 'single'; plan: BillingCatalogPlan }
    | { kind: 'group'; groupKey: string; name: string; variants: BillingCatalogPlan[] }

function hasMonthAndYearVariants(variants: BillingCatalogPlan[]): boolean {
    const s = new Set(
        variants
            .map((v) => effectiveCatalogInterval(v))
            .filter((x): x is 'month' | 'year' => x === 'month' || x === 'year')
    )
    return s.has('month') && s.has('year')
}

function buildCatalogPlanRows(sortedPlans: BillingCatalogPlan[]): CatalogPlanRow[] {
    const paidRecurring = sortedPlans.filter((p) => p.pricingModel === 'recurring_subscription')
    const byName = new Map<string, BillingCatalogPlan[]>()
    for (const p of paidRecurring) {
        const k = canonicalPlanGroupKey(p.name)
        const arr = byName.get(k) ?? []
        arr.push(p)
        byName.set(k, arr)
    }

    const mergedNames = new Set<string>()
    for (const [name, arr] of Array.from(byName.entries())) {
        if (arr.length >= 2 && hasMonthAndYearVariants(arr)) mergedNames.add(name)
    }

    const rows: CatalogPlanRow[] = []
    const emitted = new Set<string>()
    for (const p of sortedPlans) {
        if (p.pricingModel !== 'recurring_subscription') {
            rows.push({ kind: 'single', plan: p })
            continue
        }
        const name = canonicalPlanGroupKey(p.name)
        if (!mergedNames.has(name)) {
            rows.push({ kind: 'single', plan: p })
            continue
        }
        if (emitted.has(name)) continue
        emitted.add(name)
        const variants = byName.get(name)!
        const displayName = variants[0]?.name?.trim() ?? name
        rows.push({ kind: 'group', groupKey: name, name: displayName, variants })
    }

    return rows
}

function formatMoneyCents(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(cents / 100)
    } catch {
        return `$${(cents / 100).toFixed(2)}`
    }
}

/** Monthly equivalent in smallest currency units (for display as $X + Polar ` /mo`). */
function monthlyEquivalentCents(plan: BillingCatalogPlan): number | null {
    const n = plan.recurringAmountCents
    if (n == null) return null
    const iv = effectiveCatalogInterval(plan)
    if (iv === 'month') return n
    if (iv === 'year') return Math.round(n / 12)
    return null
}

function isCatalogFreePlan(p: BillingCatalogPlan): boolean {
    return p.priceLabel === 'Free'
}

/** Lowest monthly-equivalent cents per plan name group (monthly + annual variants share one rank). */
function buildTierMinMonthlyCents(plans: BillingCatalogPlan[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const p of plans) {
        if (p.pricingModel !== 'recurring_subscription') continue
        const eq = monthlyEquivalentCents(p)
        if (eq == null) continue
        const k = canonicalPlanGroupKey(p.name)
        const cur = m.get(k)
        if (cur == null || eq < cur) m.set(k, eq)
    }
    return m
}

function intervalTierSortOrder(p: BillingCatalogPlan): number {
    const iv = effectiveCatalogInterval(p)
    if (iv === 'month') return 0
    if (iv === 'year') return 1
    return 9
}

/**
 * Free plans first, then paid recurring tiers by lowest monthly equivalent (Standard before Pro),
 * then other one-time products. Within a tier: monthly variant before annual.
 */
function compareCatalogPlans(
    a: BillingCatalogPlan,
    b: BillingCatalogPlan,
    tierMinMonthly: Map<string, number>
): number {
    const aFree = isCatalogFreePlan(a)
    const bFree = isCatalogFreePlan(b)
    if (aFree !== bFree) return aFree ? -1 : 1

    const paidRank = (p: BillingCatalogPlan): number => {
        if (isCatalogFreePlan(p)) return -1
        if (p.pricingModel === 'recurring_subscription') {
            const k = canonicalPlanGroupKey(p.name)
            return tierMinMonthly.get(k) ?? Number.MAX_SAFE_INTEGER
        }
        // Non-free one-time (unusual): after all recurring tiers
        const cents = p.recurringAmountCents
        return 1_000_000_000 + (cents != null && cents >= 0 ? cents : 0)
    }

    const ra = paidRank(a)
    const rb = paidRank(b)
    if (ra !== rb) return ra - rb

    const ga = canonicalPlanGroupKey(a.name)
    const gb = canonicalPlanGroupKey(b.name)
    const nameCmp = ga.localeCompare(gb)
    if (nameCmp !== 0) return nameCmp

    return intervalTierSortOrder(a) - intervalTierSortOrder(b)
}

function savingsPercentAnnualVsMonthly(monthlyCents: number, annualPeriodCents: number): number | null {
    if (monthlyCents <= 0 || annualPeriodCents <= 0) return null
    const annualPerMonth = Math.round(annualPeriodCents / 12)
    if (annualPerMonth >= monthlyCents) return null
    return Math.max(0, Math.round((1 - annualPerMonth / monthlyCents) * 100))
}

/** One plan card: flat, hairline, one level deep. `emphasized` marks the current or picked plan. */
function planCardClass(emphasized: boolean, compact: boolean) {
    return cn(
        'relative flex h-full w-full flex-col rounded-card border bg-surface transition-colors',
        emphasized ? 'border-line-strong ring-1 ring-action/30' : 'border-line hover:border-line-strong',
        compact ? 'p-4' : 'p-5'
    )
}

/** Status tag for the active plan card: "Active · Oct 15, 2026" (replaces the old corner ribbon). */
function ActivePlanTag({ periodEnd, isTrialing }: { periodEnd: string | null; isTrialing: boolean }) {
    return (
        <Tag color="green" dot>
            {isTrialing ? 'Trialing' : 'Active'}
            {periodEnd ? <span className="tabular-nums"> · {periodEnd}</span> : null}
        </Tag>
    )
}

/** Shown instead of a button on the plan you're already on, when you can't open the portal. */
function PlanStatusBlock({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-9 w-full items-center justify-center rounded-control bg-surface-muted text-ui text-fg-muted">
            {children}
        </div>
    )
}

const sandboxPlanHighlights = getSandboxPlanHighlights()

/** How many features a card shows before "Show all". */
const FEATURE_PREVIEW_COUNT = 6

/**
 * Quiet feature list: a muted check and muted text. Long lists show the first few with a
 * "Show all" toggle instead of a fixed-height scroll box, so there is no scroll area inside a card.
 */
function PlanFeatureList({ lines }: { lines: string[] }) {
    const [expanded, setExpanded] = useState(false)
    const collapsible = lines.length > FEATURE_PREVIEW_COUNT + 1
    const visible = collapsible && !expanded ? lines.slice(0, FEATURE_PREVIEW_COUNT) : lines

    return (
        <div>
            <ul className="space-y-2">
                {visible.map((line, index) => (
                    <li key={`plan-highlight-${index}`} className="flex gap-2 text-small text-fg-muted">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden />
                        <span>{line}</span>
                    </li>
                ))}
            </ul>
            {collapsible ? (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="-ml-1 mt-2 inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    )}
                    {expanded ? 'Show fewer' : `Show all ${lines.length} features`}
                </button>
            ) : null}
        </div>
    )
}

function normalizePlanName(name: string | null | undefined): string {
    return (name ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim()
}

function namesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
    const na = normalizePlanName(a)
    const nb = normalizePlanName(b)
    if (!na || !nb) return false
    return na === nb || na.includes(nb) || nb.includes(na)
}

function pricingPlanIdFromCatalogName(name: string): PricingPlanColumnId | null {
    const normalized = normalizePlanName(name)
    if (normalized.includes('standard')) return 'Standard'
    if (normalized.includes('pro')) return 'Pro'
    if (normalized.includes('business')) return 'Business'
    if (normalized.includes('enterprise')) return 'Enterprise'
    return null
}

/** Align `/pricing` {@link readCheckoutIntent} `plan` with Polar catalog row labels. */
function checkoutPlanMatchesCatalogDisplay(
    plan: CheckoutPlanName,
    catalogName: string,
    isFreeTier: boolean
): boolean {
    if (plan === 'Free Sandbox') {
        return isFreeTier || normalizePlanName(catalogName).includes('sandbox')
    }
    const column = pricingPlanIdFromCatalogName(catalogName)
    return column === plan
}

/**
 * Same as {@link checkoutPlanMatchesCatalogDisplay}, plus tier recovery when Polar titles drift.
 * Used for onboarding Joyride targets (`data-checkout-intent-tour`) so the guide still attaches.
 */
function checkoutIntentMatchesCatalogRow(
    intentPlan: CheckoutPlanName,
    catalogName: string,
    isFreeTier: boolean,
    allowLooseTierMatch: boolean
): boolean {
    if (checkoutPlanMatchesCatalogDisplay(intentPlan, catalogName, isFreeTier)) return true
    if (!allowLooseTierMatch) return false
    const column = pricingPlanIdFromCatalogName(catalogName)
    if (column === intentPlan) return true
    return namesLikelyMatch(intentPlan, catalogName)
}

function withBrandName(text: string | null | undefined): string {
    if (!text) return ''
    return text.replace(/\bfirma\b/gi, BRAND_NAME)
}

function checkoutCtaLabel(plan: BillingCatalogPlan, isPaidRecurringCurrent: boolean): string {
    if (isPaidRecurringCurrent) return upgradeCopy.planPickerSwitchPlanCta
    return upgradeCopy.planPickerCta
}

/** Polar-style monthly suffix (space + `/mo`, same as Polar checkout UI). */
const POLAR_MONTHLY_FREQ_LABEL = ' / mo'

/** Map `/month`, `/mo`, `per month`, etc. → Polar-style {@link POLAR_MONTHLY_FREQ_LABEL}. */
function normalizeMonthlyIntervalSuffix(intervalTail: string): string {
    const raw = intervalTail.trim()
    if (!raw) return raw
    const compact = raw.replace(/\s+/g, ' ')
    const lower = compact.toLowerCase()
    if (lower.includes('/month')) return POLAR_MONTHLY_FREQ_LABEL
    if (/\/\s*mo\b/i.test(compact) || /\/\s*m\b/i.test(compact)) return POLAR_MONTHLY_FREQ_LABEL
    if (/\bper\s*month\b/i.test(compact) || /\bmonthly\b/i.test(compact)) return POLAR_MONTHLY_FREQ_LABEL
    return raw
}

/** Price figure: large tabular numerals, no monospace. */
function priceFigureClass(compact: boolean) {
    return cn('tabular-nums text-fg', compact ? 'text-h2' : 'text-h1')
}

/** Split Polar price labels like "$49 /mo" for clearer numeric hierarchy. */
function PlanPriceDisplay({
    label,
    compact,
}: {
    label: string
    compact: boolean
}) {
    const t = label.trim()
    const priced = t.match(/^(\$)\s*([\d,.]+)\s+(\/.+|per\s+.+|\/\s*.+)$/i)
    if (t === 'Free') {
        return <span className={priceFigureClass(compact)}>Free</span>
    }
    if (priced) {
        const [, currency, amount, intervalTail] = priced
        const intervalDisplay = normalizeMonthlyIntervalSuffix(intervalTail)
        const intervalGap =
            intervalDisplay.startsWith(' ') || intervalDisplay === POLAR_MONTHLY_FREQ_LABEL ? '' : 'ml-1'
        return (
            <span className="inline-flex flex-wrap items-baseline">
                <span className={priceFigureClass(compact)}>
                    {currency}
                    {amount}
                </span>
                <span className={cn('whitespace-pre text-small tabular-nums text-fg-muted', intervalGap)}>
                    {intervalDisplay}
                </span>
            </span>
        )
    }
    return <span className={cn('tabular-nums text-fg', compact ? 'text-ui font-semibold' : 'text-h3')}>{label}</span>
}

/**
 * Polar catalog grouped plans: always show a **monthly** headline (annual = total÷12),
 * plus marketing-style “Billed annually” under the price when Annual is selected
 * (same pattern as static `/pricing`).
 */
function CatalogGroupedPriceDisplay({
    monthlyEquivCents,
    currency,
    billingPeriod,
    compact,
}: {
    monthlyEquivCents: number
    currency: string
    billingPeriod: 'monthly' | 'annual'
    compact: boolean
}) {
    const full = formatMoneyCents(monthlyEquivCents, currency)
    return (
        <div className="min-w-0">
            <span className="inline-flex flex-wrap items-baseline">
                <span className={priceFigureClass(compact)}>{full}</span>
                <span className="whitespace-pre text-small tabular-nums text-fg-muted">{POLAR_MONTHLY_FREQ_LABEL}</span>
            </span>
            <p className={BILLED_CAPTION_CLASS}>{billingPeriod === 'annual' ? 'Billed annually' : 'Billed monthly'}</p>
        </div>
    )
}

/** Outline link button to an external page (Compare plans, FAQs). */
function externalLinkButtonClass(density: 'default' | 'compact', className?: string) {
    return cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full shrink-0 sm:w-auto', className)
}

function ComparePlansPricingLink({
    density,
    className,
}: {
    density: 'default' | 'compact'
    className?: string
}) {
    return (
        <Link
            href="/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className={externalLinkButtonClass(density, className)}
        >
            <Rows3 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {upgradeCopy.ctaComparePlans}
            <ExternalLink className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} aria-hidden />
        </Link>
    )
}

function BillingFaqInlineLink({
    density,
    className,
}: {
    density: 'default' | 'compact'
    className?: string
}) {
    return (
        <Link
            href="/resources/faq"
            target="_blank"
            rel="noopener noreferrer"
            className={externalLinkButtonClass(density, className)}
        >
            <ExternalLink className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} aria-hidden />
            FAQs
        </Link>
    )
}

const BILLING_TOUR_SEEN_KEY = 'firma.billingTourSeen'

function readBillingTourSeen(): boolean {
    if (typeof window === 'undefined') return true
    try {
        return window.localStorage.getItem(BILLING_TOUR_SEEN_KEY) === '1'
    } catch {
        return false
    }
}

function markBillingTourSeen(): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(BILLING_TOUR_SEEN_KEY, '1')
    } catch {
        /* ignore quota */
    }
}

export function PolarPlansPicker({
    firmId,
    returnPath,
    portalReturnPath,
    currentPlanState,
    density = 'default',
    className,
    hideStandaloneFreePlan = false,
    enableBillingTour = false,
    enableCheckoutIntentJoyride = false,
    fallbackCanManageBilling,
}: PolarPlansPickerProps) {
    const enableTour = enableBillingTour || enableCheckoutIntentJoyride
    const [plans, setPlans] = useState<BillingCatalogPlan[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [portalLoading, setPortalLoading] = useState(false)
    const [portalError, setPortalError] = useState<string | null>(null)
    /** Same semantics as static `/pricing`: `annual` = show monthly equivalent + “Billed annually”. */
    const [groupBilling, setGroupBilling] = useState<Record<string, 'monthly' | 'annual'>>({})
    /** From `firma.checkoutIntent` once per mount — highlights the card the visitor picked on `/pricing`. */
    const [intentHighlightPlan, setIntentHighlightPlan] = useState<CheckoutPlanName | null>(null)
    const checkoutIntentAppliedRef = useRef(false)
    const [checkoutIntentJoyrideRun, setCheckoutIntentJoyrideRun] = useState(false)
    /** True when neither a checkout intent nor a first-visit is detected — tour is generic mode. */
    const [genericTourMode, setGenericTourMode] = useState(false)
    /** Avoid sessionStorage here — it survives refresh and made the tour impossible to re-test. */
    const checkoutIntentJoyrideDismissedRef = useRef(false)

    /** Legacy key no longer read — remove so DevTools / expectations match behavior after refresh. */
    useEffect(() => {
        if (!enableTour || typeof window === 'undefined') return
        try {
            sessionStorage.removeItem('firma.checkoutIntentJoyrideDismissed')
        } catch {
            /* ignore */
        }
    }, [enableTour])

    const checkoutJoyrideAutoAdvanceRef = useRef<number | null>(null)
    const joyrideTargetRetryRef = useRef<number | null>(null)
    const joyrideTargetNotFoundCountRef = useRef(0)
    const joyrideStepCountRef = useRef(0)

    const clearCheckoutJoyrideAutoAdvance = useCallback(() => {
        if (checkoutJoyrideAutoAdvanceRef.current != null) {
            window.clearTimeout(checkoutJoyrideAutoAdvanceRef.current)
            checkoutJoyrideAutoAdvanceRef.current = null
        }
    }, [])

    const clearJoyrideTargetRetry = useCallback(() => {
        if (joyrideTargetRetryRef.current != null) {
            window.clearTimeout(joyrideTargetRetryRef.current)
            joyrideTargetRetryRef.current = null
        }
    }, [])

    /**
     * Runs before the plan card tooltip: scroll it into view, then wait so Joyride measures after layout
     * (calling go(1) immediately after scrollIntoView(smooth) left the spotlight at the pre-scroll position).
     */
    const waitForPlanCardScrollIntoView = useCallback((): Promise<void> => {
        return new Promise((resolve) => {
            const el =
                document.querySelector('[data-checkout-intent-tour]') ??
                document.querySelector('[data-billing-tour-recommended]')
            if (!el) {
                resolve()
                return
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
            window.setTimeout(resolve, 700)
        })
    }, [])

    const onCheckoutIntentJoyrideEvent = useCallback(
        (data: EventData, controls: Controls) => {
            const { status, type, index } = data
            if (type === EVENTS.TARGET_NOT_FOUND) {
                clearCheckoutJoyrideAutoAdvance()
                clearJoyrideTargetRetry()
                setCheckoutIntentJoyrideRun(false)
                if (joyrideTargetNotFoundCountRef.current < 6) {
                    joyrideTargetNotFoundCountRef.current += 1
                    joyrideTargetRetryRef.current = window.setTimeout(() => {
                        joyrideTargetRetryRef.current = null
                        const planTarget = intentHighlightPlan
                            ? '[data-checkout-intent-tour]'
                            : '[data-billing-tour-recommended]'
                        if (document.querySelector(planTarget)) {
                            setCheckoutIntentJoyrideRun(true)
                        }
                    }, 450)
                }
                return
            }
            if (
                type === EVENTS.TOUR_END ||
                status === STATUS.FINISHED ||
                status === STATUS.SKIPPED
            ) {
                clearCheckoutJoyrideAutoAdvance()
                clearJoyrideTargetRetry()
                joyrideTargetNotFoundCountRef.current = 0
                checkoutIntentJoyrideDismissedRef.current = true
                markBillingTourSeen()
                setCheckoutIntentJoyrideRun(false)
                return
            }
            /** After Skip step is shown, auto-advance to plan card — only when tour has 2 steps. */
            if (type === EVENTS.STEP_BEFORE && index === 0 && joyrideStepCountRef.current > 1) {
                clearCheckoutJoyrideAutoAdvance()
                checkoutJoyrideAutoAdvanceRef.current = window.setTimeout(() => {
                    checkoutJoyrideAutoAdvanceRef.current = null
                    controls.go(1)
                }, 1800)
            }
            if (type === EVENTS.STEP_AFTER && index === 0) {
                clearCheckoutJoyrideAutoAdvance()
            }
        },
        [clearCheckoutJoyrideAutoAdvance, clearJoyrideTargetRetry, intentHighlightPlan]
    )

    useEffect(
        () => () => {
            clearCheckoutJoyrideAutoAdvance()
            clearJoyrideTargetRetry()
        },
        [clearCheckoutJoyrideAutoAdvance, clearJoyrideTargetRetry]
    )

    const checkoutIntentJoyrideSteps = useMemo(() => {
        if (!enableTour) return []
        const hasSkipBtn = Boolean(
            typeof document !== 'undefined' &&
                document.querySelector('[data-onboarding-billing-skip-tour]')
        )
        const planTarget = intentHighlightPlan
            ? '[data-checkout-intent-tour]'
            : '[data-billing-tour-recommended]'
        const planStepContent = intentHighlightPlan ? (
            <p className="m-0 text-left text-small text-fg-muted">
                {upgradeCopy.checkoutIntentJoyrideLead}
                <strong className="font-medium text-fg">{intentHighlightPlan}</strong>
                {upgradeCopy.checkoutIntentJoyrideTrail}
            </p>
        ) : (
            <p className="m-0 text-left text-small text-fg-muted">
                {upgradeCopy.billingTourGenericBody}
            </p>
        )
        const planStep = {
            target: planTarget,
            title: intentHighlightPlan
                ? upgradeCopy.checkoutIntentJoyrideTitle
                : upgradeCopy.billingTourGenericTitle,
            content: planStepContent,
            placement: 'auto' as const,
            before: waitForPlanCardScrollIntoView,
            skipScroll: true,
            scrollOffset: 72,
        }
        if (hasSkipBtn) {
            return [
                {
                    target: '[data-onboarding-billing-skip-tour]',
                    title: upgradeCopy.checkoutIntentJoyrideSkipTitle,
                    content: (
                        <p className="m-0 text-left text-small text-fg-muted">
                            {upgradeCopy.checkoutIntentJoyrideSkipBody}
                        </p>
                    ),
                    placement: 'bottom' as const,
                },
                planStep,
            ]
        }
        return [planStep]
    }, [enableTour, intentHighlightPlan, genericTourMode, waitForPlanCardScrollIntoView])
    joyrideStepCountRef.current = checkoutIntentJoyrideSteps.length

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        fetch('/api/billing/catalog')
            .then(async (res) => {
                const body = (await res.json().catch(() => ({}))) as CatalogJson
                if (!res.ok) {
                    throw new Error(body.error || `Could not load plans (${res.status})`)
                }
                return body.items ?? []
            })
            .then((items) => {
                if (!cancelled) setPlans(items)
            })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load plans')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const sortedPlans = useMemo(() => {
        if (!plans?.length) return null
        const tierMinMonthly = buildTierMinMonthlyCents(plans)
        return [...plans].sort((a, b) => compareCatalogPlans(a, b, tierMinMonthly))
    }, [plans])
    const planRows = useMemo(
        () => (sortedPlans?.length ? buildCatalogPlanRows(sortedPlans) : null),
        [sortedPlans]
    )

    const visiblePlanRows = useMemo(() => {
        if (!planRows?.length) return null
        if (!hideStandaloneFreePlan) return planRows
        return planRows.filter((row) => {
            if (row.kind !== 'single') return true
            const p = row.plan
            if (p.pricingModel !== 'one_time_purchase') return true
            return p.priceLabel !== 'Free'
        })
    }, [planRows, hideStandaloneFreePlan])

    const currentPlanId = useMemo(() => {
        if (!sortedPlans?.length || !currentPlanState) return null
        const normalizedStatus = (currentPlanState.subscriptionStatus ?? '').toLowerCase()
        const paidPlans = sortedPlans.filter((p) => p.pricingModel === 'recurring_subscription')
        const freeLikePlans = sortedPlans.filter((p) => p.pricingModel === 'one_time_purchase')
        const paidIdMatch = paidPlans.find((p) => p.id === currentPlanState.subscriptionProductId)
        const paidMatch = paidPlans.find((p) => namesLikelyMatch(p.name, currentPlanState.subscriptionPlan))
        const hasPaidMatch = Boolean(paidIdMatch || paidMatch)
        const isActiveLikeStatus = ['active', 'trialing', 'past_due'].includes(normalizedStatus)
        const isPaidRecurringCurrent =
            (currentPlanState.pricingModel === 'recurring_subscription' && isActiveLikeStatus) ||
            (hasPaidMatch && !['canceled', 'none'].includes(normalizedStatus))
        return isPaidRecurringCurrent
            ? (paidIdMatch?.id ?? paidMatch?.id ?? (paidPlans.length === 1 ? paidPlans[0]?.id : null))
            : currentPlanState.pricingModel === 'one_time_purchase'
              ? (freeLikePlans.find((p) => p.priceLabel === 'Free')?.id ?? freeLikePlans[0]?.id ?? null)
              : null
    }, [sortedPlans, currentPlanState])

    /** Default new groups to Annual (matches marketing pricing page default). */
    useEffect(() => {
        if (!planRows?.length) return
        setGroupBilling((prev) => {
            let changed = false
            const next = { ...prev }
            for (const row of planRows) {
                if (row.kind !== 'group') continue
                if (next[row.groupKey] != null) continue
                next[row.groupKey] = 'annual'
                changed = true
            }
            return changed ? next : prev
        })
    }, [planRows])

    /** Apply marketing checkout intent (plan + interval) before subscription-driven toggle sync overwrites it. */
    useEffect(() => {
        if (!planRows?.length || checkoutIntentAppliedRef.current) return
        checkoutIntentAppliedRef.current = true
        const intent = readCheckoutIntent()
        if (intent) {
            setIntentHighlightPlan(intent.plan)
            const seg = intent.interval === 'monthly' ? 'monthly' : 'annual'
            setGroupBilling((prev) => {
                let changed = false
                const next = { ...prev }
                for (const row of planRows) {
                    if (row.kind !== 'group') continue
                    if (!checkoutIntentMatchesCatalogRow(intent.plan, row.name, false, true)) continue
                    if (next[row.groupKey] === seg) continue
                    next[row.groupKey] = seg
                    changed = true
                }
                return changed ? next : prev
            })
        } else if (enableTour) {
            // No checkout intent — mark generic mode so tour targets the recommended plan card
            setGenericTourMode(true)
        }
    }, [planRows, enableTour])

    /** Sync toggle when the active subscription matches one of the Polar products in a group. */
    useEffect(() => {
        if (!planRows?.length || !currentPlanId) return
        for (const row of planRows) {
            if (row.kind !== 'group') continue
            const hit = row.variants.find((v) => v.id === currentPlanId)
            if (!hit?.recurringInterval) continue
            const hitIv = effectiveCatalogInterval(hit)
            const seg =
                hitIv === 'year' ? 'annual' : hitIv === 'month' ? 'monthly' : null
            if (!seg) continue
            setGroupBilling((prev) => {
                if (prev[row.groupKey] === seg) return prev
                return { ...prev, [row.groupKey]: seg }
            })
        }
    }, [currentPlanId, planRows])

    /** Start joyride once the target plan card is in the DOM (first visit only). */
    useEffect(() => {
        if (!enableTour) {
            setCheckoutIntentJoyrideRun(false)
            return
        }
        // Wait until intent resolution is done (either intent found or generic mode set)
        const intentResolved = intentHighlightPlan != null || genericTourMode
        if (!intentResolved || loading) return
        if (checkoutIntentJoyrideDismissedRef.current) return
        // Only show on first visit
        if (readBillingTourSeen()) return

        const planTarget = intentHighlightPlan
            ? '[data-checkout-intent-tour]'
            : '[data-billing-tour-recommended]'

        let cancelled = false
        let timeoutId: number | undefined
        let raf1 = 0
        let raf2 = 0

        const tryStart = () => {
            if (cancelled) return false
            const planCard = document.querySelector(planTarget)
            if (planCard) {
                joyrideTargetNotFoundCountRef.current = 0
                setCheckoutIntentJoyrideRun(true)
                return true
            }
            return false
        }

        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                if (tryStart() || cancelled) return
                timeoutId = window.setTimeout(() => {
                    void tryStart()
                }, 420)
            })
        })

        return () => {
            cancelled = true
            cancelAnimationFrame(raf1)
            cancelAnimationFrame(raf2)
            if (timeoutId != null) window.clearTimeout(timeoutId)
        }
    }, [enableTour, intentHighlightPlan, genericTourMode, loading, visiblePlanRows])

    if (!firmId) {
        return <p className="text-small text-fg-muted">{upgradeCopy.planPickerMissingFirm}</p>
    }

    if (loading) {
        // Skeleton plan cards, shaped like the cards that are coming (Linear / Notion loading).
        return (
            <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', className)} aria-busy="true">
                <LoadingAnnouncement label="Loading plans…" />
                {[0, 1].map((i) => (
                    <div
                        key={i}
                        className={cn(
                            'flex flex-col rounded-card border border-line bg-surface',
                            density === 'compact' ? 'p-4' : 'p-5'
                        )}
                    >
                        <ShimmerBar className="h-3.5 w-24" />
                        <ShimmerBar className="mt-4 h-6 w-28 rounded-control" />
                        <ShimmerBar className="mt-2 h-2 w-20" />
                        <ShimmerBar className="mt-4 w-4/5" />
                        {density !== 'compact' ? (
                            <div className="mt-4 space-y-3 border-t border-line pt-4">
                                {[0, 1, 2, 3].map((j) => (
                                    <ShimmerBar key={j} className={j % 2 ? 'w-3/5' : 'w-4/5'} />
                                ))}
                            </div>
                        ) : null}
                        <ShimmerBar className="mt-5 h-9 w-full rounded-control" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div
                role="alert"
                className={cn(
                    'flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3 text-small text-fg',
                    className
                )}
            >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0">{error}</span>
            </div>
        )
    }

    if (!sortedPlans?.length) {
        return (
            <EmptyPanel
                compact
                className={cn('rounded-card border border-line', className)}
                icon={<Rows3 strokeWidth={1.75} />}
                title="No plans available"
                description={upgradeCopy.planPickerEmpty}
                action={
                    <Link
                        href="/pricing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                        {upgradeCopy.ctaComparePlans}
                        <ExternalLink className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} aria-hidden />
                    </Link>
                }
            />
        )
    }

    const compact = density === 'compact'
    const normalizedStatus = (currentPlanState?.subscriptionStatus ?? '').toLowerCase()
    const paidPlans = sortedPlans.filter((p) => p.pricingModel === 'recurring_subscription')
    const paidIdMatch = paidPlans.find((p) => p.id === currentPlanState?.subscriptionProductId)
    const paidMatch = paidPlans.find((p) => namesLikelyMatch(p.name, currentPlanState?.subscriptionPlan))
    const hasPaidMatch = Boolean(paidIdMatch || paidMatch)
    const isActiveLikeStatus = ['active', 'trialing', 'past_due'].includes(normalizedStatus)
    const isPaidRecurringCurrent =
        (currentPlanState?.pricingModel === 'recurring_subscription' && isActiveLikeStatus) ||
        (hasPaidMatch && !['canceled', 'none'].includes(normalizedStatus))
    const portalSwitchUi = isPaidRecurringCurrent
    const explicitAdminFlag = currentPlanState?.isFirmBillingAdmin
    const isFirmBillingAdmin = explicitAdminFlag ?? Boolean(fallbackCanManageBilling)
    const canOpenCustomerPortal = Boolean(currentPlanState?.canOpenCustomerPortal)
    const showPortalButton = isFirmBillingAdmin && portalSwitchUi && canOpenCustomerPortal
    const showAdminOnlyBlock = explicitAdminFlag === false && !fallbackCanManageBilling

    const openBillingPortal = async () => {
        setPortalError(null)
        setPortalLoading(true)
        try {
            const result = await openPolarCustomerPortalSession({
                firmId,
                returnTo: portalReturnPath || '/d/billing',
            })
            if (result.ok) {
                window.location.href = result.url
                return
            }
            setPortalError(result.error)
        } finally {
            setPortalLoading(false)
        }
    }

    return (
        <div className={cn('space-y-4', className)}>
            {showAdminOnlyBlock ? (
                <div className="flex items-start gap-2 rounded-card border border-line bg-surface-subtle px-4 py-3 text-small text-fg-muted">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0">{upgradeCopy.billingPortalAdminOnlyHint}</span>
                </div>
            ) : null}
            {showPortalButton ? (
                <div>
                    <p className={cn('max-w-3xl text-fg-muted', compact ? 'text-caption font-normal' : 'text-small')}>
                        <span>{upgradeCopy.billingPortalCombinedIntroPrefix}</span>
                        <BillingPolarExplainInline className="mx-0.5" />
                        <span>{upgradeCopy.billingPortalCombinedIntroSuffix}</span>
                    </p>
                    {portalError ? <p className="mt-2 text-small text-danger">{portalError}</p> : null}
                </div>
            ) : null}
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
                {visiblePlanRows?.map((row) => {
                    if (row.kind === 'group') {
                        const period = groupBilling[row.groupKey] ?? 'annual'
                        const monthlyV = row.variants.find((v) => effectiveCatalogInterval(v) === 'month')
                        const annualV = row.variants.find((v) => effectiveCatalogInterval(v) === 'year')
                        const selectedPlan =
                            period === 'annual' ? annualV ?? monthlyV : monthlyV ?? annualV
                        if (!selectedPlan) return null
                        const savings =
                            monthlyV?.recurringAmountCents != null &&
                            annualV?.recurringAmountCents != null
                                ? savingsPercentAnnualVsMonthly(
                                      monthlyV.recurringAmountCents,
                                      annualV.recurringAmountCents
                                  )
                                : null
                        const eqCents = monthlyEquivalentCents(selectedPlan)
                        const isCurrentPlan = currentPlanId === selectedPlan.id
                        const isIntentHighlight =
                            intentHighlightPlan != null &&
                            checkoutIntentMatchesCatalogRow(
                                intentHighlightPlan,
                                row.name,
                                false,
                                enableTour
                            ) &&
                            (!isCurrentPlan ||
                                (enableTour && !isPaidRecurringCurrent))
                        // Generic tour target: recommended plan card (or first standard tier)
                        const isGenericTourTarget =
                            genericTourMode &&
                            !isCurrentPlan &&
                            (selectedPlan.isRecommended ||
                                normalizePlanName(row.name).includes('standard'))
                        const isTrialingCurrentPlan =
                            isCurrentPlan &&
                            (currentPlanState?.subscriptionStatus ?? '').toLowerCase() === 'trialing' &&
                            Boolean(currentPlanState?.periodEndIso)
                        const currentPlanPeriodEnd = currentPlanState?.periodEndIso
                            ? new Date(currentPlanState.periodEndIso).toLocaleDateString(undefined, {
                                  dateStyle: 'medium',
                              })
                            : null
                        const pricingPlanId = pricingPlanIdFromCatalogName(row.name)
                        const planHighlights = pricingPlanId
                            ? getPricingComparisonBulletsForPlan(pricingPlanId)
                            : []
                        const checkoutHref = buildPolarCheckoutHref({
                            firmId,
                            returnTo: returnPath,
                            productId: selectedPlan.id,
                        })
                        // The plan you're on (or picked on /pricing) gets the stronger outline; the
                        // recommended plan's checkout is the one accent button.
                        const emphasized = isCurrentPlan || (isIntentHighlight && !enableTour)
                        const primaryCta = Boolean(selectedPlan.isRecommended) || isIntentHighlight
                        return (
                            <li key={`group:${row.groupKey}`} className="flex min-w-0">
                                <article
                                    {...(isIntentHighlight ? { 'data-checkout-intent-tour': true } : {})}
                                    {...(isGenericTourTarget ? { 'data-billing-tour-recommended': true } : {})}
                                    className={planCardClass(emphasized, compact)}
                                >
                                    {/* Name with its status tag underneath, the period toggle fixed top-right: a
                                        longer tag ("Active · Oct 24, 2026") never pushes the toggle to a new row. */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-col items-start gap-1.5">
                                            <h3 className={planCardHeadingClass(compact)}>{row.name}</h3>
                                            {isCurrentPlan ? (
                                                <ActivePlanTag
                                                    periodEnd={currentPlanPeriodEnd}
                                                    isTrialing={isTrialingCurrentPlan}
                                                />
                                            ) : selectedPlan.isRecommended ? (
                                                <Tag color="blue">{upgradeCopy.billingRecommendedBadge}</Tag>
                                            ) : null}
                                        </div>
                                        <div
                                            className={PERIOD_TRACK_CLASS}
                                            role="group"
                                            aria-label={`Billing period for ${row.name}`}
                                        >
                                            <button
                                                type="button"
                                                aria-pressed={period === 'annual'}
                                                onClick={() =>
                                                    setGroupBilling((p) => ({
                                                        ...p,
                                                        [row.groupKey]: 'annual',
                                                    }))
                                                }
                                                className={periodSegmentClass(period === 'annual')}
                                            >
                                                <span>Annual</span>
                                                {savings != null && savings > 0 ? (
                                                    <span
                                                        className="text-caption tabular-nums text-tag-green-fg"
                                                        aria-hidden
                                                    >{`${savings}% off`}</span>
                                                ) : null}
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={period === 'monthly'}
                                                onClick={() =>
                                                    setGroupBilling((p) => ({
                                                        ...p,
                                                        [row.groupKey]: 'monthly',
                                                    }))
                                                }
                                                className={periodSegmentClass(period === 'monthly')}
                                            >
                                                Monthly
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 min-w-0">
                                        {eqCents != null ? (
                                            <CatalogGroupedPriceDisplay
                                                monthlyEquivCents={eqCents}
                                                currency={selectedPlan.priceCurrency}
                                                billingPeriod={annualV != null ? period : 'monthly'}
                                                compact={compact}
                                            />
                                        ) : (
                                            <div className="min-w-0">
                                                <PlanPriceDisplay label={selectedPlan.priceLabel} compact={compact} />
                                                <p className={BILLED_CAPTION_CLASS}>Billed monthly</p>
                                            </div>
                                        )}
                                    </div>

                                    {selectedPlan.description ? (
                                        <p
                                            className={cn(
                                                'mt-3 text-fg-muted',
                                                compact ? 'line-clamp-3 text-caption font-normal sm:text-small' : 'text-small'
                                            )}
                                        >
                                            {withBrandName(selectedPlan.description)}
                                        </p>
                                    ) : null}

                                    {!compact && planHighlights.length > 0 ? (
                                        <div className="mt-4 border-t border-line pt-4">
                                            <PlanFeatureList lines={planHighlights} />
                                        </div>
                                    ) : null}

                                    <div className="mt-auto pt-5">
                                        {isCurrentPlan ? (
                                            showPortalButton ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-9 w-full"
                                                    disabled={portalLoading}
                                                    onClick={() => void openBillingPortal()}
                                                >
                                                    <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                                    {portalLoading
                                                        ? upgradeCopy.billingPortalOpening
                                                        : upgradeCopy.billingPortalManageSubscriptionCta}
                                                </Button>
                                            ) : (
                                                <PlanStatusBlock>{upgradeCopy.planPickerCurrentPlanBadge}</PlanStatusBlock>
                                            )
                                        ) : isPaidRecurringCurrent ? null : isFirmBillingAdmin ? (
                                            <Button
                                                type="button"
                                                variant={primaryCta ? 'greenCta' : 'outline'}
                                                className="h-9 w-full"
                                                onClick={() => {
                                                    persistCheckoutIntent({
                                                        plan: row.name as CheckoutPlanName,
                                                        interval: period === 'annual' ? 'annual' : 'monthly',
                                                    })
                                                    window.location.assign(checkoutHref)
                                                }}
                                            >
                                                <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                                {checkoutCtaLabel(selectedPlan, isPaidRecurringCurrent)}
                                            </Button>
                                        ) : null}
                                    </div>
                                </article>
                            </li>
                        )
                    }
                    const plan = row.plan
                    const isFreeTier = plan.priceLabel === 'Free'
                    const isCurrentPlan = currentPlanId === plan.id
                    const isIntentHighlight =
                        intentHighlightPlan != null &&
                        checkoutIntentMatchesCatalogRow(
                            intentHighlightPlan,
                            plan.name,
                            isFreeTier,
                            enableCheckoutIntentJoyride
                        ) &&
                        (!isCurrentPlan || (enableCheckoutIntentJoyride && !isPaidRecurringCurrent))
                    const isTrialingCurrentPlan =
                        isCurrentPlan &&
                        (currentPlanState?.subscriptionStatus ?? '').toLowerCase() === 'trialing' &&
                        Boolean(currentPlanState?.periodEndIso)
                    const currentPlanPeriodEnd = currentPlanState?.periodEndIso
                        ? new Date(currentPlanState.periodEndIso).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                          })
                        : null
                    const pricingPlanId = pricingPlanIdFromCatalogName(plan.name)
                    const planHighlights = pricingPlanId
                        ? getPricingComparisonBulletsForPlan(pricingPlanId)
                        : []
                    const checkoutHref = buildPolarCheckoutHref({
                        firmId,
                        returnTo: returnPath,
                        productId: plan.id,
                    })
                    const emphasized =
                        (isCurrentPlan && !isFreeTier) || (isIntentHighlight && !enableCheckoutIntentJoyride)
                    const primaryCta = Boolean(plan.isRecommended) || isIntentHighlight
                    return (
                        <li key={plan.id} className="flex min-w-0">
                            <article
                                {...(isIntentHighlight ? { 'data-checkout-intent-tour': true } : {})}
                                className={planCardClass(emphasized, compact)}
                            >
                                <div className="flex min-w-0 flex-col items-start gap-1.5">
                                    <h3 className={planCardHeadingClass(compact)}>{plan.name}</h3>
                                    {isCurrentPlan && !isFreeTier ? (
                                        <ActivePlanTag periodEnd={currentPlanPeriodEnd} isTrialing={isTrialingCurrentPlan} />
                                    ) : !isCurrentPlan && !isFreeTier && plan.isRecommended ? (
                                        <Tag color="blue">{upgradeCopy.billingRecommendedBadge}</Tag>
                                    ) : null}
                                </div>
                                <div className="mt-3 min-w-0">
                                    <PlanPriceDisplay label={plan.priceLabel} compact={compact} />
                                    {!isFreeTier ? <p className={BILLED_CAPTION_CLASS}>Billed monthly</p> : null}
                                </div>

                                {plan.description ? (
                                    <p
                                        className={cn(
                                            'mt-3 text-fg-muted',
                                            compact ? 'line-clamp-3 text-caption font-normal sm:text-small' : 'text-small'
                                        )}
                                    >
                                        {withBrandName(plan.description)}
                                    </p>
                                ) : null}

                                {!isFreeTier && !compact && planHighlights.length > 0 ? (
                                    <div className="mt-4 border-t border-line pt-4">
                                        <PlanFeatureList lines={planHighlights} />
                                    </div>
                                ) : null}
                                {isFreeTier && !compact ? (
                                    <div className="mt-4 border-t border-line pt-4">
                                        <PlanFeatureList lines={sandboxPlanHighlights} />
                                    </div>
                                ) : null}

                                <div className="mt-auto pt-5">
                                    {isCurrentPlan ? (
                                        showPortalButton ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-9 w-full"
                                                disabled={portalLoading}
                                                onClick={() => void openBillingPortal()}
                                            >
                                                <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                                {portalLoading
                                                    ? upgradeCopy.billingPortalOpening
                                                    : upgradeCopy.billingPortalManageSubscriptionCta}
                                            </Button>
                                        ) : (
                                            <PlanStatusBlock>{upgradeCopy.planPickerCurrentPlanBadge}</PlanStatusBlock>
                                        )
                                    ) : isFreeTier ? (
                                        <div className="space-y-1.5">
                                            <PlanStatusBlock>{upgradeCopy.billingIncludedLabel}</PlanStatusBlock>
                                            <p className="text-center text-caption font-normal text-fg-muted">
                                                {upgradeCopy.freeSandboxFootnote}
                                            </p>
                                        </div>
                                    ) : isPaidRecurringCurrent ? null : isFirmBillingAdmin ? (
                                        <Button
                                            type="button"
                                            variant={primaryCta ? 'greenCta' : 'outline'}
                                            className="h-9 w-full"
                                            onClick={() => {
                                                persistCheckoutIntent({
                                                    plan: plan.name as CheckoutPlanName,
                                                    interval: effectiveCatalogInterval(plan) === 'year' ? 'annual' : 'monthly',
                                                })
                                                window.location.assign(checkoutHref)
                                            }}
                                        >
                                            <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                            {checkoutCtaLabel(plan, isPaidRecurringCurrent)}
                                        </Button>
                                    ) : null}
                                </div>
                            </article>
                        </li>
                    )
                })}
            </ul>
            {enableTour && checkoutIntentJoyrideSteps.length > 0 ? (
                <Joyride
                    run={checkoutIntentJoyrideRun}
                    steps={checkoutIntentJoyrideSteps}
                    continuous={checkoutIntentJoyrideSteps.length > 1}
                    scrollToFirstStep
                    onEvent={onCheckoutIntentJoyrideEvent}
                    locale={{
                        last: upgradeCopy.checkoutIntentJoyridePrimaryCta,
                        next: 'Next',
                    }}
                    // Joyride parses `primaryColor` as a hex (it derives rgba() from it), so the
                    // options keep literal New UI values; the rendered pieces below read the tokens.
                    options={{
                        primaryColor: '#047857',
                        textColor: '#37352f',
                        backgroundColor: '#ffffff',
                        arrowColor: '#ffffff',
                        overlayColor: 'rgba(15, 15, 15, 0.6)',
                        spotlightPadding: 10,
                        spotlightRadius: 6,
                        zIndex: 10050,
                        skipBeacon: true,
                        showProgress: false,
                        buttons: ['close', 'primary'],
                        scrollDuration: 400,
                        scrollOffset: 40,
                    }}
                    styles={{
                        floater: {
                            filter: 'none',
                        },
                        tooltip: {
                            borderRadius: 'var(--ui-radius-card)',
                            padding: '14px 16px 12px',
                            fontSize: 13,
                            maxWidth: 300,
                            color: 'var(--ui-fg)',
                            backgroundColor: 'var(--ui-surface)',
                            border: 'none',
                            boxShadow: 'var(--ui-shadow-popover)',
                            fontFamily: 'inherit',
                        },
                        tooltipContainer: {
                            textAlign: 'left',
                            lineHeight: '18px',
                        },
                        tooltipTitle: {
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: '20px',
                            color: 'var(--ui-fg)',
                            marginTop: 0,
                            marginBottom: 0,
                            marginLeft: 0,
                            marginRight: 0,
                        },
                        tooltipContent: {
                            padding: '4px 0 2px',
                            fontSize: 13,
                            color: 'var(--ui-fg-muted)',
                            lineHeight: '18px',
                        },
                        tooltipFooter: {
                            marginTop: 10,
                            paddingTop: 0,
                            borderTop: 'none',
                        },
                        buttonPrimary: {
                            borderRadius: 'var(--ui-radius-control)',
                            fontSize: 13,
                            fontWeight: 500,
                            letterSpacing: 'normal',
                            textTransform: 'none',
                            padding: '5px 10px',
                            backgroundColor: 'hsl(var(--ui-action))',
                            color: 'hsl(var(--ui-action-fg))',
                            fontFamily: 'inherit',
                        },
                        buttonClose: {
                            color: 'var(--ui-fg-muted)',
                            width: 10,
                            height: 10,
                            padding: 8,
                            top: 4,
                            right: 4,
                        },
                    }}
                />
            ) : null}
        </div>
    )
}
