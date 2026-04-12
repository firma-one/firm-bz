'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { getPricingComparisonBulletsForPlan, type PricingPlanColumnId } from '@/config/pricing'
import { BillingCheckoutFootnote, BillingPolarExplainInline } from '@/components/billing/billing-polar-inline'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { EmailInline } from '@/components/ui/email-inline'
import { PLATFORM_SUPPORT_EMAIL } from '@/config/platform-emails'
import { formatSubscriptionStatus } from '@/lib/billing/subscription-display'
import { readCheckoutIntent, type CheckoutPlanName } from '@/lib/marketing/checkout-intent'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, ChevronUp, Clock, CreditCard, ExternalLink, Loader2, Rows3, Ticket } from 'lucide-react'
import { EVENTS, Joyride, STATUS, type Controls, type EventData } from 'react-joyride'

type CatalogJson = { items?: BillingCatalogPlan[]; error?: string }
export type BillingCurrentPlanState = {
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    subscriptionProductId?: string | null
    pricingModel: 'recurring_subscription' | 'one_time_purchase' | null
    periodEndIso: string | null
    canOpenCustomerPortal?: boolean
    isFirmBillingAdmin?: boolean
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
     * Billing page trial: accent #ECC0AA (links, help panel, current-plan chrome).
     * Omit in dialogs / embeds until promoted to design tokens.
     */
    blueAccentTrial?: boolean
    /** Hide the catalog free (one-time) product row when current plan is shown elsewhere. */
    hideStandaloneFreePlan?: boolean
    /**
     * Onboarding billing: run a react-joyride spotlight + tooltip on the plan card that matches
     * `firma.checkoutIntent`. Dismissal applies until this component unmounts (full refresh clears it).
     */
    enableCheckoutIntentJoyride?: boolean
}

const PRICING_PAGE_BILLING_TOGGLE_BTN =
    'inline-flex items-center justify-center gap-0.5 whitespace-nowrap rounded-sm px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide transition-all duration-200 leading-none sm:px-2 sm:py-1.5 sm:text-[10px] sm:tracking-wider'

/** Track + segment chrome: billing peach trial vs neutral slate (matches checkout / trust cards). */
function billingToggleTrackClass(peachAccent: boolean) {
    return cn(
        'inline-flex w-max max-w-[calc(100%-4.5rem)] shrink-0 items-stretch gap-0.5 rounded-md p-0.5',
        peachAccent
            ? 'border border-[#c49a82]/55 bg-gradient-to-b from-[#ECC0AA]/38 to-[#ECC0AA]/14 shadow-[inset_0_1px_3px_rgba(61,42,34,0.09)]'
            : 'border border-[#9ea0a8]/50 bg-[#cfd1d9] shadow-[inset_0_1px_2px_rgba(15,23,42,0.1)]'
    )
}

function billingToggleSegmentActive(peachAccent: boolean) {
    return peachAccent
        ? 'bg-white text-[#3d2a22] shadow-[0_2px_10px_rgba(236,192,170,0.45)] ring-1 ring-[#c49a82]/50'
        : 'bg-white text-[#1b1b1d] shadow-[0_2px_8px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.06)]'
}

function billingToggleSegmentInactive(peachAccent: boolean) {
    return peachAccent
        ? 'text-[#7a5343]/88 hover:bg-white/40 hover:text-[#3d2a22]'
        : 'text-[#3f4149] hover:bg-white/35 hover:text-[#1b1b1d]'
}

function planCardHeadingClass(compact: boolean) {
    return cn('font-semibold tracking-tight text-slate-900', compact ? 'text-sm' : 'text-base')
}

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

/** Shared panel: Polar trust copy + portal actions or Compare plans (inside Billing & plans card). */
const billingTrustPanelClass = (compact: boolean, blueAccentTrial?: boolean) =>
    cn(
        'rounded-2xl shadow-sm',
        blueAccentTrial
            ? 'border border-[#ECC0AA]/55 bg-gradient-to-br from-[#ECC0AA]/32 via-white to-slate-50/80 ring-1 ring-[#ECC0AA]/42'
            : 'border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-slate-50/80 ring-1 ring-slate-100/80',
        compact ? 'p-4' : 'p-4 sm:p-5'
    )

/** Solid slate + clip-path hover (Manage Subscription & plan checkout CTAs). */
const polarBillingCtaButtonClass = cn(
    'group relative overflow-hidden text-sm font-semibold',
    'bg-slate-900 text-white hover:bg-slate-900 hover:text-white',
    'before:absolute before:inset-0 before:rounded-[inherit] before:bg-slate-700 before:content-[""]',
    'before:[clip-path:circle(0%_at_85%_50%)] before:transition-[clip-path] before:duration-300 before:ease-out',
    'hover:before:[clip-path:circle(150%_at_85%_50%)]'
)

/** Billing page trial: primary checkout filled with #ECC0AA */
const polarBillingPeachCtaClass = cn(
    'rounded-lg text-sm font-semibold',
    '!border-2 !border-[#c49a82]/70 !bg-[#ECC0AA] !text-[#3d2a22]',
    'shadow-[0_2px_6px_rgba(61,42,34,0.1),0_8px_24px_-8px_rgba(236,192,170,0.55)]',
    'transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-out',
    'hover:-translate-y-px hover:!border-[#b07d62] hover:!bg-[#f2d5c4] hover:!text-[#241814]',
    'active:translate-y-0 active:scale-[0.995]'
)

/** Match profile billing inner / account cards */
const planCardBase = cn(
    'relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90',
    'bg-white',
    'shadow-[0_2px_8px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.12)]',
    'ring-1 ring-slate-900/[0.04]',
    'transition-all duration-300 ease-out'
)

const sandboxPlanHighlights = [
    '1 sandbox firm workspace included',
    'Demo clients and engagements preloaded',
    'Document storage and folder structure previews',
    'Safe environment for testing workflows',
    'No production custom firms on free tier',
]

function PlanHighlightsScroll({
    lines,
    checkIconClassName = 'text-emerald-600/90',
    peachScrollbar,
}: {
    lines: string[]
    checkIconClassName?: string
    peachScrollbar?: boolean
}) {
    const ref = useRef<HTMLUListElement | null>(null)
    const [canScrollUp, setCanScrollUp] = useState(false)
    const [canScrollDown, setCanScrollDown] = useState(false)

    const recompute = useCallback(() => {
        const el = ref.current
        if (!el) return
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
        const top = el.scrollTop
        setCanScrollUp(top > 2)
        setCanScrollDown(top < maxScrollTop - 2)
    }, [])

    useEffect(() => {
        recompute()
    }, [lines.length, recompute])

    return (
        <div className="relative">
            <ul
                ref={ref}
                onScroll={recompute}
                className={cn(
                    'h-52 space-y-2.5 overflow-y-auto pr-1',
                    'scrollbar-thin scrollbar-track-transparent',
                    peachScrollbar
                        ? 'scrollbar-thumb-[#ECC0AA]/65 hover:scrollbar-thumb-[#d4a892]'
                        : 'scrollbar-thumb-slate-200/80 hover:scrollbar-thumb-slate-300/80'
                )}
            >
                {lines.map((line, index) => (
                    <li key={`plan-highlight-${index}`} className="flex gap-2.5 text-sm leading-snug text-slate-700">
                        <Check
                            className={cn('mt-0.5 h-4 w-4 shrink-0', checkIconClassName)}
                            strokeWidth={2.25}
                            aria-hidden
                        />
                        <span>{line}</span>
                    </li>
                ))}
            </ul>

            {/* Scroll affordance: fades + chevrons, driven by scroll position */}
            <div
                className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 z-10 h-10',
                    'bg-gradient-to-b from-white via-white/80 to-transparent',
                    'transition-opacity duration-200',
                    canScrollUp ? 'opacity-100' : 'opacity-0'
                )}
                aria-hidden
            />
            <div
                className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10',
                    'bg-gradient-to-t from-white via-white/80 to-transparent',
                    'transition-opacity duration-200',
                    canScrollDown ? 'opacity-100' : 'opacity-0'
                )}
                aria-hidden
            />
            <ChevronUp
                className={cn(
                    'pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 text-slate-400',
                    'transition-opacity duration-200',
                    canScrollUp ? 'opacity-100' : 'opacity-0'
                )}
                width={16}
                height={16}
                aria-hidden
            />
            <ChevronDown
                className={cn(
                    'pointer-events-none absolute left-1/2 bottom-1 z-20 -translate-x-1/2 text-slate-400',
                    'transition-opacity duration-200',
                    canScrollDown ? 'opacity-100' : 'opacity-0'
                )}
                width={16}
                height={16}
                aria-hidden
            />
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

/** Split Polar price labels like "$49 /mo" for clearer numeric hierarchy. */
function PlanPriceDisplay({
    label,
    compact,
    peachAmount,
}: {
    label: string
    compact: boolean
    peachAmount?: boolean
}) {
    const t = label.trim()
    const priced = t.match(/^(\$)\s*([\d,.]+)\s+(\/.+|per\s+.+|\/\s*.+)$/i)
    if (t === 'Free') {
        return (
            <span
                className={cn(
                    'font-bold tabular-nums font-mono tracking-tight',
                    peachAmount ? 'text-[#6b4538]' : 'text-slate-950',
                    compact ? 'text-lg' : 'text-2xl'
                )}
            >
                Free
            </span>
        )
    }
    if (priced) {
        const [, currency, amount, intervalTail] = priced
        const intervalDisplay = normalizeMonthlyIntervalSuffix(intervalTail)
        const intervalGap =
            intervalDisplay.startsWith(' ') || intervalDisplay === POLAR_MONTHLY_FREQ_LABEL
                ? ''
                : compact
                  ? 'ml-1'
                  : 'ml-1.5'
        return (
            <span className="inline-flex flex-wrap items-baseline">
                <span
                    className={cn(
                        'font-semibold tabular-nums font-mono',
                        peachAmount ? 'text-[#7a5343]' : 'text-slate-700',
                        compact ? 'text-sm' : 'text-base'
                    )}
                >
                    {currency}
                </span>
                <span
                    className={cn(
                        'font-bold tabular-nums font-mono tracking-tight',
                        peachAmount ? 'text-[#6b4538]' : 'text-slate-950',
                        compact ? 'ml-px text-xl' : 'ml-0.5 text-[1.625rem] leading-[1.1]'
                    )}
                >
                    {amount}
                </span>
                <span
                    className={cn(
                        'font-medium tabular-nums font-mono tracking-wide',
                        peachAmount ? 'text-[#7a5343]/85' : 'text-slate-600',
                        compact ? 'text-xs' : 'text-sm',
                        intervalGap
                    )}
                >
                    {intervalDisplay}
                </span>
            </span>
        )
    }
    return (
        <span
            className={cn(
                'font-semibold tabular-nums font-mono tracking-tight text-slate-900',
                compact ? 'text-base' : 'text-lg'
            )}
        >
            {label}
        </span>
    )
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
    peachAmount,
}: {
    monthlyEquivCents: number
    currency: string
    billingPeriod: 'monthly' | 'annual'
    compact: boolean
    peachAmount?: boolean
}) {
    const full = formatMoneyCents(monthlyEquivCents, currency)
    return (
        <div className="min-w-0">
            <span className="inline-flex flex-wrap items-baseline gap-0">
                <span
                    className={cn(
                        'font-bold tabular-nums tracking-tight',
                        peachAmount ? 'text-[#6b4538]' : 'text-slate-950',
                        compact ? 'text-xl' : 'text-[1.625rem] leading-[1.1]'
                    )}
                >
                    {full}
                </span>
                <span
                    className={cn(
                        'font-medium tabular-nums',
                        peachAmount ? 'text-[#7a5343]/85' : 'text-slate-600',
                        compact ? 'text-xs' : 'text-sm'
                    )}
                >
                    {POLAR_MONTHLY_FREQ_LABEL}
                </span>
            </span>
            {billingPeriod === 'annual' ? (
                <p className={cn('mt-1 text-xs', peachAmount ? 'text-[#7a5343]/85' : 'text-slate-500')}>
                    Billed annually
                </p>
            ) : (
                <div className={compact ? 'mt-1 h-3' : 'mt-1 h-4'} aria-hidden />
            )}
        </div>
    )
}

function ComparePlansPricingLink({
    density,
    className,
    blueAccentTrial,
}: {
    density: 'default' | 'compact'
    className?: string
    blueAccentTrial?: boolean
}) {
    const compact = density === 'compact'
    return (
        <Link
            href="/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                buttonVariants({ variant: 'outline', size: compact ? 'sm' : 'default' }),
                'inline-flex shrink-0 items-center justify-center gap-2 bg-white font-medium shadow-sm transition-colors',
                blueAccentTrial
                    ? cn(
                          '!border-[#c49a82] !bg-[#ECC0AA] !text-[#3d2a22] !shadow-[0_2px_8px_-2px_rgba(236,192,170,0.45)]',
                          'hover:!border-[#b07d62] hover:!bg-[#f0d0be] hover:!text-[#241814]'
                      )
                    : 'border-slate-300 text-slate-800 hover:border-slate-400 hover:bg-slate-50',
                compact ? 'h-9 px-3 text-xs' : 'h-10 px-4 text-sm',
                'w-full sm:w-auto',
                className
            )}
        >
            <Rows3 className={cn('opacity-80', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
            {upgradeCopy.ctaComparePlans}
            <ExternalLink className={cn('opacity-70', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
        </Link>
    )
}

function BillingFaqInlineLink({ className, blueAccentTrial }: { className?: string; blueAccentTrial?: boolean }) {
    return (
        <Link
            href="/pricing#faq"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'inline-flex items-center gap-1 font-medium underline underline-offset-2',
                blueAccentTrial
                    ? 'text-[#7a5343] decoration-[#ECC0AA]/75 hover:text-[#5c3f32] hover:decoration-[#c49a82]'
                    : 'text-slate-600 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-400',
                className
            )}
        >
            FAQs
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Link>
    )
}

export function PolarPlansPicker({
    firmId,
    returnPath,
    portalReturnPath,
    currentPlanState,
    density = 'default',
    className,
    blueAccentTrial,
    hideStandaloneFreePlan = false,
    enableCheckoutIntentJoyride = false,
}: PolarPlansPickerProps) {
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
    /** Avoid sessionStorage here — it survives refresh and made the tour impossible to re-test. */
    const checkoutIntentJoyrideDismissedRef = useRef(false)

    /** Legacy key no longer read — remove so DevTools / expectations match behavior after refresh. */
    useEffect(() => {
        if (!enableCheckoutIntentJoyride || typeof window === 'undefined') return
        try {
            sessionStorage.removeItem('firma.checkoutIntentJoyrideDismissed')
        } catch {
            /* ignore */
        }
    }, [enableCheckoutIntentJoyride])

    const checkoutJoyrideAutoAdvanceRef = useRef<number | null>(null)
    const joyrideTargetRetryRef = useRef<number | null>(null)
    const joyrideTargetNotFoundCountRef = useRef(0)

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
     * Runs before step 2 tooltip: scroll plan card into view, then wait so Joyride measures after layout
     * (calling go(1) immediately after scrollIntoView(smooth) left the spotlight at the pre-scroll position).
     */
    const waitForPlanCardScrollIntoView = useCallback((): Promise<void> => {
        return new Promise((resolve) => {
            const el = document.querySelector('[data-checkout-intent-tour]')
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
                        if (
                            document.querySelector('[data-onboarding-billing-skip-tour]') &&
                            document.querySelector('[data-checkout-intent-tour]')
                        ) {
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
                setCheckoutIntentJoyrideRun(false)
                return
            }
            /** After Skip step is shown, auto-advance to plan card — step 2 `before` scrolls then tooltip opens. */
            if (type === EVENTS.STEP_BEFORE && index === 0) {
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
        [clearCheckoutJoyrideAutoAdvance, clearJoyrideTargetRetry]
    )

    useEffect(
        () => () => {
            clearCheckoutJoyrideAutoAdvance()
            clearJoyrideTargetRetry()
        },
        [clearCheckoutJoyrideAutoAdvance, clearJoyrideTargetRetry]
    )

    const checkoutIntentJoyrideSteps = useMemo(() => {
        if (!enableCheckoutIntentJoyride || !intentHighlightPlan) return []
        return [
            {
                target: '[data-onboarding-billing-skip-tour]',
                title: upgradeCopy.checkoutIntentJoyrideSkipTitle,
                content: (
                    <p className="m-0 text-left text-sm leading-relaxed text-slate-700">
                        {upgradeCopy.checkoutIntentJoyrideSkipBody}
                    </p>
                ),
                placement: 'bottom' as const,
            },
            {
                target: '[data-checkout-intent-tour]',
                title: upgradeCopy.checkoutIntentJoyrideTitle,
                content: (
                    <p className="m-0 text-left text-sm leading-relaxed text-slate-700">
                        {upgradeCopy.checkoutIntentJoyrideLead}
                        <strong className="font-semibold text-slate-900">{intentHighlightPlan}</strong>
                        {upgradeCopy.checkoutIntentJoyrideTrail}
                    </p>
                ),
                placement: 'auto' as const,
                /** Scroll + wait completes before Joyride measures the target (avoids stuck spotlight). */
                before: waitForPlanCardScrollIntoView,
                /** We handle scroll in `before`; skip Joyride’s own scroll to avoid double layout. */
                skipScroll: true,
                scrollOffset: 72,
            },
        ]
    }, [enableCheckoutIntentJoyride, intentHighlightPlan, waitForPlanCardScrollIntoView])

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
        const intent = readCheckoutIntent()
        if (!intent) return
        checkoutIntentAppliedRef.current = true
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
    }, [planRows])

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

    /** Start joyride once the intent-matched plan card is in the DOM (onboarding billing only). */
    useEffect(() => {
        if (!enableCheckoutIntentJoyride) {
            setCheckoutIntentJoyrideRun(false)
            return
        }
        if (intentHighlightPlan == null || loading) return
        if (checkoutIntentJoyrideDismissedRef.current) return

        let cancelled = false
        let timeoutId: number | undefined
        let raf1 = 0
        let raf2 = 0

        const tryStart = () => {
            if (cancelled) return false
            if (
                document.querySelector('[data-onboarding-billing-skip-tour]') &&
                document.querySelector('[data-checkout-intent-tour]')
            ) {
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
    }, [enableCheckoutIntentJoyride, intentHighlightPlan, loading, visiblePlanRows])

    if (!firmId) {
        return <p className="text-sm text-slate-600">{upgradeCopy.planPickerMissingFirm}</p>
    }

    if (loading) {
        return (
            <div className={cn('flex flex-col items-center justify-center gap-3 py-14 text-slate-500', className)}>
                <Loader2 className="h-7 w-7 animate-spin text-slate-500/80" aria-hidden />
                <span className="text-sm font-medium">Loading plans…</span>
            </div>
        )
    }

    if (error) {
        return (
            <div
                className={cn(
                    'rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/50 px-4 py-3.5 text-sm text-amber-950 shadow-sm',
                    className
                )}
            >
                {error}
            </div>
        )
    }

    if (!sortedPlans?.length) {
        return (
            <div className={cn('space-y-4 text-center sm:text-left', className)}>
                <p className="text-sm text-slate-600">{upgradeCopy.planPickerEmpty}</p>
                <Button
                    variant="outline"
                    className={cn(
                        'h-10 w-full shadow-sm sm:w-auto',
                        blueAccentTrial
                            ? '!border-[#c49a82] !bg-[#ECC0AA] hover:!bg-[#f0d0be]'
                            : 'border-slate-200 bg-white/80'
                    )}
                    asChild
                >
                    <Link
                        href="/pricing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('gap-2 font-medium', blueAccentTrial ? '!text-[#3d2a22]' : undefined)}
                    >
                        {upgradeCopy.ctaComparePlans}
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </Link>
                </Button>
            </div>
        )
    }

    const compact = density === 'compact'
    /** #B07D62: same hue family as #ECC0AA, enough contrast on white for small icons */
    const highlightCheckClass = blueAccentTrial ? 'text-[#c17a54]' : 'text-emerald-600/90'
    const normalizedStatus = (currentPlanState?.subscriptionStatus ?? '').toLowerCase()
    const paidPlans = sortedPlans.filter((p) => p.pricingModel === 'recurring_subscription')
    const freeLikePlans = sortedPlans.filter((p) => p.pricingModel === 'one_time_purchase')
    const paidIdMatch = paidPlans.find((p) => p.id === currentPlanState?.subscriptionProductId)
    const paidMatch = paidPlans.find((p) => namesLikelyMatch(p.name, currentPlanState?.subscriptionPlan))
    const hasPaidMatch = Boolean(paidIdMatch || paidMatch)
    const isActiveLikeStatus = ['active', 'trialing', 'past_due'].includes(normalizedStatus)
    const isPaidRecurringCurrent =
        (currentPlanState?.pricingModel === 'recurring_subscription' && isActiveLikeStatus) ||
        (hasPaidMatch && !['canceled', 'none'].includes(normalizedStatus))
    const portalSwitchUi = isPaidRecurringCurrent
    const isFirmBillingAdmin = Boolean(currentPlanState?.isFirmBillingAdmin)
    const canOpenCustomerPortal = Boolean(currentPlanState?.canOpenCustomerPortal)
    const showPortalButton = isFirmBillingAdmin && portalSwitchUi && canOpenCustomerPortal
    const showAdminOnlyBlock = !isFirmBillingAdmin

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
        <div className={cn('space-y-6', className)}>
            {showAdminOnlyBlock ? (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950 shadow-sm">
                    {upgradeCopy.billingPortalAdminOnlyHint}
                </div>
            ) : null}
            <div className={billingTrustPanelClass(compact, blueAccentTrial)}>
                {showPortalButton ? (
                    <p className={cn('text-sm leading-relaxed text-slate-700', compact && 'text-xs')}>
                        <span>{upgradeCopy.billingPortalCombinedIntroPrefix}</span>
                        <BillingPolarExplainInline className="mx-0.5" />
                        <span>{upgradeCopy.billingPortalCombinedIntroSuffix}</span>
                    </p>
                ) : (
                    <BillingCheckoutFootnote dense={compact} />
                )}
                <div
                    className={cn(
                        'mt-4 border-t pt-4',
                        compact && 'mt-3 pt-3',
                        blueAccentTrial
                            ? compact
                                ? 'border-[#ECC0AA]/30'
                                : 'border-[#ECC0AA]/35'
                            : compact
                              ? 'border-slate-200/50'
                              : 'border-slate-200/60'
                    )}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <p
                        className={cn(
                            'min-w-0 flex-1 text-left text-xs leading-relaxed',
                            blueAccentTrial ? 'text-[#7a5343]/80' : 'text-slate-500',
                            compact && 'text-[11px]'
                        )}
                    >
                        <span>{upgradeCopy.billingFooterHelp}</span>{' '}
                        <EmailInline email={PLATFORM_SUPPORT_EMAIL} className="mx-1" />
                        <span className="sr-only">.</span>{' '}
                        <BillingFaqInlineLink className="ml-1" blueAccentTrial={blueAccentTrial} />
                    </p>
                    <ComparePlansPricingLink
                        density={density}
                        className="w-full shrink-0 sm:w-auto sm:self-start"
                        blueAccentTrial={blueAccentTrial}
                    />
                </div>
                {showPortalButton && portalError ? (
                    <p className="mt-3 text-sm text-red-600">{portalError}</p>
                ) : null}
            </div>
            <ul className="grid grid-cols-1 gap-5 pt-2 lg:grid-cols-2 lg:items-stretch lg:gap-6">
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
                                enableCheckoutIntentJoyride
                            ) &&
                            (!isCurrentPlan ||
                                (enableCheckoutIntentJoyride && !isPaidRecurringCurrent))
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
                        return (
                            <li key={`group:${row.groupKey}`} className="relative pt-3">
                                {!isCurrentPlan && selectedPlan.isRecommended ? (
                                    <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2">
                                        <span
                                            className={cn(
                                                'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-md',
                                                blueAccentTrial
                                                    ? 'border-[#b88972]/60 bg-[#ECC0AA] text-[#3d2a22]'
                                                    : 'border-slate-300/80 bg-slate-700 text-white'
                                            )}
                                        >
                                            {upgradeCopy.billingRecommendedBadge}
                                        </span>
                                    </div>
                                ) : null}
                                <article
                                    {...(isIntentHighlight ? { 'data-checkout-intent-tour': true } : {})}
                                    className={cn(
                                        planCardBase,
                                        'hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1),0_20px_48px_-16px_rgba(15,23,42,0.12)]',
                                        blueAccentTrial
                                            ? 'border-[#ECC0AA]/42 ring-[#ECC0AA]/22 hover:border-[#d4a892] hover:ring-[#ECC0AA]/35'
                                            : 'border-slate-200/90 hover:border-slate-300/90 hover:ring-slate-200/40',
                                        blueAccentTrial && isCurrentPlan && 'bg-[#ECC0AA]/10',
                                        blueAccentTrial &&
                                            isCurrentPlan &&
                                            'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-1 before:rounded-t-[1rem] before:bg-[#ECC0AA]',
                                        isIntentHighlight &&
                                            !enableCheckoutIntentJoyride &&
                                            (blueAccentTrial
                                                ? 'ring-2 ring-[#b88972]/60 ring-offset-2 ring-offset-white'
                                                : 'ring-2 ring-emerald-600/40 ring-offset-2 ring-offset-white')
                                    )}
                                >
                                    <div className={cn('flex flex-1 flex-col', compact ? 'p-4' : 'p-5 sm:p-6')}>
                                        <div>
                                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                                                <h3
                                                    className={cn(
                                                        planCardHeadingClass(compact),
                                                        'min-w-0 flex-1 leading-snug'
                                                    )}
                                                >
                                                    {row.name}
                                                </h3>
                                                <div
                                                    className={cn(
                                                        billingToggleTrackClass(Boolean(blueAccentTrial)),
                                                        'shrink-0'
                                                    )}
                                                    role="group"
                                                    aria-label={`Billing period for ${row.name}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setGroupBilling((p) => ({
                                                                ...p,
                                                                [row.groupKey]: 'annual',
                                                            }))
                                                        }
                                                        className={cn(
                                                            PRICING_PAGE_BILLING_TOGGLE_BTN,
                                                            period === 'annual'
                                                                ? billingToggleSegmentActive(Boolean(blueAccentTrial))
                                                                : billingToggleSegmentInactive(Boolean(blueAccentTrial))
                                                        )}
                                                    >
                                                        <span>Annual</span>
                                                        {savings != null && savings > 0 ? (
                                                            <span
                                                                className={cn(
                                                                    'text-[8px] font-bold leading-none sm:text-[9px]',
                                                                    blueAccentTrial
                                                                        ? 'text-emerald-700'
                                                                        : 'text-[#006e16]'
                                                                )}
                                                                aria-hidden
                                                            >{`${savings}% off`}</span>
                                                        ) : null}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setGroupBilling((p) => ({
                                                                ...p,
                                                                [row.groupKey]: 'monthly',
                                                            }))
                                                        }
                                                        className={cn(
                                                            PRICING_PAGE_BILLING_TOGGLE_BTN,
                                                            period === 'monthly'
                                                                ? billingToggleSegmentActive(Boolean(blueAccentTrial))
                                                                : billingToggleSegmentInactive(Boolean(blueAccentTrial))
                                                        )}
                                                    >
                                                        Monthly
                                                    </button>
                                                </div>
                                            </div>
                                            <div
                                                className={cn(
                                                    'mt-2 items-start gap-x-4 gap-y-1',
                                                    isCurrentPlan
                                                        ? 'grid grid-cols-[minmax(0,1fr)_auto]'
                                                        : 'block'
                                                )}
                                            >
                                                    <div className="min-w-0 leading-none">
                                                        {eqCents != null ? (
                                                            <CatalogGroupedPriceDisplay
                                                                monthlyEquivCents={eqCents}
                                                                currency={selectedPlan.priceCurrency}
                                                                billingPeriod={period}
                                                                compact={compact}
                                                                peachAmount={blueAccentTrial}
                                                            />
                                                        ) : (
                                                            <PlanPriceDisplay
                                                                label={selectedPlan.priceLabel}
                                                                compact={compact}
                                                                peachAmount={blueAccentTrial}
                                                            />
                                                        )}
                                                    </div>
                                                    {isCurrentPlan ? (
                                                    <div className="flex min-w-[7.5rem] max-w-[11rem] shrink-0 flex-col gap-1.5 text-xs sm:min-w-[8.5rem] sm:text-sm">
                                                        <TooltipProvider delayDuration={200}>
                                                            <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                            <Ticket
                                                                                className={cn(
                                                                                    'h-4 w-4 shrink-0',
                                                                                    blueAccentTrial
                                                                                        ? 'text-[#c17a54]'
                                                                                        : 'text-slate-400'
                                                                                )}
                                                                                strokeWidth={2.25}
                                                                                aria-hidden
                                                                            />
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent
                                                                        variant="light"
                                                                        side="top"
                                                                        align="start"
                                                                    >
                                                                        Subscription status
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <span
                                                                    className={cn(
                                                                        'text-sm font-medium',
                                                                        blueAccentTrial
                                                                            ? 'text-[#7a5343]'
                                                                            : 'text-slate-600'
                                                                    )}
                                                                >
                                                                    {formatSubscriptionStatus(currentPlanState?.subscriptionStatus)}
                                                                </span>
                                                            </div>
                                                        </TooltipProvider>
                                                        {currentPlanPeriodEnd ? (
                                                            <TooltipProvider delayDuration={200}>
                                                                <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                                <Clock
                                                                                    className={cn(
                                                                                        'h-4 w-4 shrink-0',
                                                                                        blueAccentTrial
                                                                                            ? 'text-[#c17a54]'
                                                                                            : 'text-slate-400'
                                                                                    )}
                                                                                    strokeWidth={2.25}
                                                                                    aria-hidden
                                                                                />
                                                                            </span>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent
                                                                            variant="light"
                                                                            side="top"
                                                                            align="start"
                                                                        >
                                                                            {isTrialingCurrentPlan
                                                                                ? 'Trial ends on'
                                                                                : 'Renews on'}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                                                        {currentPlanPeriodEnd}
                                                                    </span>
                                                                </div>
                                                            </TooltipProvider>
                                                        ) : (
                                                            <div
                                                                className="grid grid-cols-[1rem_1fr] items-center gap-2 opacity-0"
                                                                aria-hidden
                                                            >
                                                                <span className="h-4 w-4" />
                                                                <span className="text-sm font-medium tabular-nums">
                                                                    —
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}
                                                </div>
                                        </div>

                                        {selectedPlan.description ? (
                                            <p
                                                className={cn(
                                                    'mt-2 leading-relaxed text-slate-600',
                                                    compact ? 'text-xs line-clamp-3 sm:text-sm' : 'text-sm'
                                                )}
                                            >
                                                {withBrandName(selectedPlan.description)}
                                            </p>
                                        ) : null}

                                        {!compact && planHighlights.length > 0 ? (
                                            <div
                                                className={cn(
                                                    'mt-5 border-t pt-5',
                                                    blueAccentTrial ? 'border-[#ECC0AA]/28' : 'border-slate-100'
                                                )}
                                            >
                                                <PlanHighlightsScroll
                                                    lines={planHighlights}
                                                    checkIconClassName={highlightCheckClass}
                                                    peachScrollbar={blueAccentTrial}
                                                />
                                            </div>
                                        ) : null}

                                        <div className="mt-auto pt-6">
                                            {isCurrentPlan ? (
                                                showPortalButton ? (
                                                    <Button
                                                        type="button"
                                                        variant="manageBillingCta"
                                                        className={cn(
                                                            'h-11 w-full rounded-lg',
                                                            blueAccentTrial &&
                                                                '!border-[#c49a82] !bg-[#ECC0AA]/40 !text-[#3d2a22] hover:!border-[#b07d62] hover:!bg-[#ECC0AA]/65 hover:!text-[#241814]'
                                                        )}
                                                        disabled={portalLoading}
                                                        onClick={() => void openBillingPortal()}
                                                    >
                                                        <span className="relative z-10">
                                                            <span className="inline-flex items-center justify-center gap-2">
                                                                <CreditCard className="h-4 w-4 opacity-90" aria-hidden />
                                                                {portalLoading
                                                                    ? upgradeCopy.billingPortalOpening
                                                                    : upgradeCopy.billingPortalManageSubscriptionCta}
                                                            </span>
                                                        </span>
                                                    </Button>
                                                ) : (
                                                    <div
                                                        className={cn(
                                                            'rounded-xl border px-4 py-3 text-center shadow-sm',
                                                            blueAccentTrial
                                                                ? 'border-[#ECC0AA]/60 bg-[#ECC0AA]/22 shadow-[0_2px_12px_-6px_rgba(236,192,170,0.45)]'
                                                                : 'border-slate-200/80 bg-white/90'
                                                        )}
                                                    >
                                                        <p
                                                            className={cn(
                                                                'text-sm font-medium',
                                                                blueAccentTrial ? 'text-[#7a5343]' : 'text-slate-800'
                                                            )}
                                                        >
                                                            {upgradeCopy.planPickerCurrentPlanBadge}
                                                        </p>
                                                    </div>
                                                )
                                            ) : isFirmBillingAdmin ? (
                                                <Button
                                                    type="button"
                                                    variant={blueAccentTrial ? 'outline' : 'blackCta'}
                                                    className={cn(
                                                        'h-11 w-full',
                                                        blueAccentTrial
                                                            ? polarBillingPeachCtaClass
                                                            : polarBillingCtaButtonClass
                                                    )}
                                                    onClick={() => {
                                                        window.location.assign(checkoutHref)
                                                    }}
                                                >
                                                    <span className="relative z-10">
                                                        <span className="inline-flex items-center justify-center gap-2">
                                                            <CreditCard className="h-4 w-4 opacity-90" aria-hidden />
                                                            {isPaidRecurringCurrent
                                                                ? upgradeCopy.planPickerSwitchPlanCta
                                                                : upgradeCopy.planPickerCta}
                                                        </span>
                                                    </span>
                                                </Button>
                                            ) : null}
                                        </div>
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
                    return (
                        <li key={plan.id} className="relative pt-3">
                            {!isCurrentPlan && !isFreeTier && plan.isRecommended ? (
                                <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2">
                                    <span
                                        className={cn(
                                            'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-md',
                                            blueAccentTrial
                                                ? 'border-[#b88972]/60 bg-[#ECC0AA] text-[#3d2a22]'
                                                : 'border-slate-300/80 bg-slate-700 text-white'
                                        )}
                                    >
                                        {upgradeCopy.billingRecommendedBadge}
                                    </span>
                                </div>
                            ) : null}
                            <article
                                {...(isIntentHighlight ? { 'data-checkout-intent-tour': true } : {})}
                                className={cn(
                                    planCardBase,
                                    isFreeTier
                                        ? blueAccentTrial
                                            ? 'border-[#ECC0AA]/45 bg-gradient-to-br from-[#ECC0AA]/18 via-slate-50/75 to-slate-50/95 hover:border-[#ECC0AA]/60 hover:shadow-[0_8px_28px_-8px_rgba(236,192,170,0.22)]'
                                            : 'bg-slate-50/70 hover:border-slate-200 hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1)]'
                                        : cn(
                                              'hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1),0_20px_48px_-16px_rgba(15,23,42,0.12)]',
                                              blueAccentTrial
                                                  ? 'border-[#ECC0AA]/42 ring-[#ECC0AA]/22 hover:border-[#d4a892] hover:ring-[#ECC0AA]/35'
                                                  : 'border-slate-200/90 hover:border-slate-300/90 hover:ring-slate-200/40'
                                          ),
                                    blueAccentTrial && isCurrentPlan && 'bg-[#ECC0AA]/10',
                                    blueAccentTrial &&
                                        isCurrentPlan &&
                                        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-1 before:rounded-t-[1rem] before:bg-[#ECC0AA]',
                                    isIntentHighlight &&
                                        !enableCheckoutIntentJoyride &&
                                        (blueAccentTrial
                                            ? 'ring-2 ring-[#b88972]/60 ring-offset-2 ring-offset-white'
                                            : 'ring-2 ring-emerald-600/40 ring-offset-2 ring-offset-white')
                                )}
                            >
                                <div className={cn('flex flex-1 flex-col', compact ? 'p-4' : 'p-5 sm:p-6')}>
                                    {isFreeTier ? (
                                        <>
                                            <h3 className={planCardHeadingClass(compact)}>
                                                {plan.name}
                                            </h3>
                                            <p className="mt-2">
                                                <PlanPriceDisplay
                                                    label={plan.priceLabel}
                                                    compact={compact}
                                                    peachAmount={blueAccentTrial}
                                                />
                                            </p>
                                        </>
                                    ) : (
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
                                            <h3
                                                className={cn(
                                                    planCardHeadingClass(compact),
                                                    'col-start-1 row-start-1 min-w-0'
                                                )}
                                            >
                                                {plan.name}
                                            </h3>
                                            <p className="col-start-1 row-start-2 min-w-0 leading-none">
                                                <PlanPriceDisplay
                                                    label={plan.priceLabel}
                                                    compact={compact}
                                                    peachAmount={blueAccentTrial}
                                                />
                                            </p>
                                            <div className="col-start-2 row-span-2 row-start-1 flex min-w-[140px] max-w-[11rem] shrink-0 flex-col gap-1.5 self-start text-sm">
                                                {isCurrentPlan ? (
                                                    <>
                                                        <TooltipProvider delayDuration={200}>
                                                            <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                            <Ticket
                                                                                className={cn(
                                                                                    'h-4 w-4 shrink-0',
                                                                                    blueAccentTrial ? 'text-[#c17a54]' : 'text-slate-400'
                                                                                )}
                                                                                strokeWidth={2.25}
                                                                                aria-hidden
                                                                            />
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent variant="light" side="top" align="start">
                                                                        Subscription status
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <span
                                                                    className={cn(
                                                                        'text-sm font-medium',
                                                                        blueAccentTrial ? 'text-[#7a5343]' : 'text-slate-600'
                                                                    )}
                                                                >
                                                                    {formatSubscriptionStatus(currentPlanState?.subscriptionStatus)}
                                                                </span>
                                                            </div>
                                                        </TooltipProvider>
                                                        {currentPlanPeriodEnd ? (
                                                            <TooltipProvider delayDuration={200}>
                                                                <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                                <Clock
                                                                                    className={cn(
                                                                                        'h-4 w-4 shrink-0',
                                                                                        blueAccentTrial
                                                                                            ? 'text-[#c17a54]'
                                                                                            : 'text-slate-400'
                                                                                    )}
                                                                                    strokeWidth={2.25}
                                                                                    aria-hidden
                                                                                />
                                                                            </span>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent variant="light" side="top" align="start">
                                                                            {isTrialingCurrentPlan ? 'Trial ends on' : 'Renews on'}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                                                        {currentPlanPeriodEnd}
                                                                    </span>
                                                                </div>
                                                            </TooltipProvider>
                                                        ) : (
                                                            <div className="grid grid-cols-[1rem_1fr] items-center gap-2 opacity-0" aria-hidden>
                                                                <span className="h-4 w-4" />
                                                                <span className="text-sm font-medium tabular-nums">—</span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div
                                                        className="invisible pointer-events-none select-none"
                                                        aria-hidden
                                                    >
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                    <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                                                                </span>
                                                                <span className="text-sm font-medium text-slate-600">
                                                                    Trialing
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-[1rem_1fr] items-center gap-2">
                                                                <span className="inline-flex h-4 w-4 items-center justify-center">
                                                                    <Clock className="h-4 w-4 shrink-0" aria-hidden />
                                                                </span>
                                                                <span className="text-sm font-medium text-slate-900 tabular-nums">
                                                                    Sep 30, 2099
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {plan.description ? (
                                        <p
                                            className={cn(
                                                'mt-2 leading-relaxed text-slate-600',
                                                compact ? 'text-xs line-clamp-3 sm:text-sm' : 'text-sm'
                                            )}
                                        >
                                            {withBrandName(plan.description)}
                                        </p>
                                    ) : null}

                                    {!isFreeTier && !compact && planHighlights.length > 0 ? (
                                        <div
                                            className={cn(
                                                'mt-5 border-t pt-5',
                                                blueAccentTrial ? 'border-[#ECC0AA]/28' : 'border-slate-100'
                                            )}
                                        >
                                            <PlanHighlightsScroll
                                                lines={planHighlights}
                                                checkIconClassName={highlightCheckClass}
                                                peachScrollbar={blueAccentTrial}
                                            />
                                        </div>
                                    ) : null}
                                    {isFreeTier && !compact ? (
                                        <div
                                            className={cn(
                                                'mt-5 border-t pt-5',
                                                blueAccentTrial ? 'border-[#ECC0AA]/28' : 'border-slate-100'
                                            )}
                                        >
                                            <ul className="space-y-2.5">
                                                {sandboxPlanHighlights.map((line, index) => (
                                                    <li
                                                        key={`sandbox-highlight-${index}`}
                                                        className="flex gap-2.5 text-sm leading-snug text-slate-700"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mt-0.5 h-4 w-4 shrink-0',
                                                                highlightCheckClass
                                                            )}
                                                            strokeWidth={2.25}
                                                            aria-hidden
                                                        />
                                                        <span>{line}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}

                                    <div className="mt-auto pt-6">
                                        {isCurrentPlan ? (
                                            showPortalButton ? (
                                                <Button
                                                    type="button"
                                                    variant="manageBillingCta"
                                                    className={cn(
                                                        'h-11 w-full rounded-lg',
                                                        blueAccentTrial &&
                                                            '!border-[#c49a82] !bg-[#ECC0AA]/40 !text-[#3d2a22] hover:!border-[#b07d62] hover:!bg-[#ECC0AA]/65 hover:!text-[#241814]'
                                                    )}
                                                    disabled={portalLoading}
                                                    onClick={() => void openBillingPortal()}
                                                >
                                                    <span className="relative z-10">
                                                        <span className="inline-flex items-center justify-center gap-2">
                                                            <CreditCard className="h-4 w-4 opacity-90" aria-hidden />
                                                            {portalLoading
                                                                ? upgradeCopy.billingPortalOpening
                                                                : upgradeCopy.billingPortalManageSubscriptionCta}
                                                        </span>
                                                    </span>
                                                </Button>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        'rounded-xl border px-4 py-3 text-center shadow-sm',
                                                        blueAccentTrial
                                                            ? 'border-[#ECC0AA]/60 bg-[#ECC0AA]/22 shadow-[0_2px_12px_-6px_rgba(236,192,170,0.45)]'
                                                            : 'border-slate-200/80 bg-white/90'
                                                    )}
                                                >
                                                    <p
                                                        className={cn(
                                                            'text-sm font-medium',
                                                            blueAccentTrial ? 'text-[#7a5343]' : 'text-slate-800'
                                                        )}
                                                    >
                                                        {upgradeCopy.planPickerCurrentPlanBadge}
                                                    </p>
                                                </div>
                                            )
                                        ) : isFreeTier ? (
                                            <div
                                                className={cn(
                                                    'rounded-xl border px-4 py-3 text-center shadow-sm',
                                                    blueAccentTrial
                                                        ? 'border-[#ECC0AA]/45 bg-[#ECC0AA]/14'
                                                        : 'border-slate-200/80 bg-white/90'
                                                )}
                                            >
                                                <p
                                                    className={cn(
                                                        'text-sm font-medium',
                                                        blueAccentTrial ? 'text-[#7a5343]' : 'text-slate-800'
                                                    )}
                                                >
                                                    {upgradeCopy.billingIncludedLabel}
                                                </p>
                                                <p
                                                    className={cn(
                                                        'mt-1 text-xs',
                                                        blueAccentTrial ? 'text-[#7a5343]/75' : 'text-slate-500'
                                                    )}
                                                >
                                                    {upgradeCopy.freeSandboxFootnote}
                                                </p>
                                            </div>
                                        ) : isFirmBillingAdmin ? (
                                            <Button
                                                type="button"
                                                variant={blueAccentTrial ? 'outline' : 'blackCta'}
                                                className={cn(
                                                    'h-11 w-full',
                                                    blueAccentTrial ? polarBillingPeachCtaClass : polarBillingCtaButtonClass
                                                )}
                                                onClick={() => {
                                                    window.location.assign(checkoutHref)
                                                }}
                                            >
                                                <span className="relative z-10">
                                                    <span className="inline-flex items-center justify-center gap-2">
                                                        <CreditCard className="h-4 w-4 opacity-90" aria-hidden />
                                                        {isPaidRecurringCurrent
                                                            ? upgradeCopy.planPickerSwitchPlanCta
                                                            : upgradeCopy.planPickerCta}
                                                    </span>
                                                </span>
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </article>
                        </li>
                    )
                })}
            </ul>
            {enableCheckoutIntentJoyride && checkoutIntentJoyrideSteps.length > 0 ? (
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
                    options={{
                        primaryColor: '#0f172a',
                        textColor: '#0f172a',
                        backgroundColor: '#ffffff',
                        arrowColor: '#ffffff',
                        overlayColor: 'rgba(15, 23, 42, 0.52)',
                        spotlightPadding: 12,
                        spotlightRadius: 16,
                        zIndex: 10050,
                        skipBeacon: true,
                        showProgress: false,
                        buttons: ['close', 'primary'],
                        scrollDuration: 400,
                        scrollOffset: 40,
                    }}
                />
            ) : null}
        </div>
    )
}
