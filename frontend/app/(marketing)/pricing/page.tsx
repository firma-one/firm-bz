"use client"

import { ArrowRight, CalendarDays, Check, HelpCircle, MessageSquareMore, SquareFunction } from "lucide-react"
import Link from "next/link"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    PRICING_COMPARISON,
    PRICING_PLANS,
    PRICING_SANDBOX_COLUMN_ID,
    planCardUsageSummary,
    sandboxPlanUsageSummary,
} from "@/config/pricing"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { Fragment, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { PlanValue, PricingPlan, PricingPlanColumnId } from "@/config/pricing"
import { platformEmail } from "@/config/platform-domain"
import { BRAND_NAME } from "@/config/brand"
import { CONTACT_HREF_SALES_INQUIRY } from "@/lib/marketing/contact-inquiry"
import { persistCheckoutIntent, type CheckoutPlanName } from "@/lib/marketing/checkout-intent"
import { CALENDLY_DEMO_URL, MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { MarketingBreadcrumb } from "@/components/marketing/marketing-breadcrumb"
import { PricingEngagementPersonasTooltip } from "@/components/marketing/pricing-engagement-personas-tooltip"
import { PricingFirmClientEngagementHierarchyVisual } from "@/components/marketing/pricing-firm-client-engagement-hierarchy-visual"
import { KineticMarketingBadge, kineticSectionLeadClassName } from "@/components/kinetic/kinetic-section-intro"
import { FaqGrid } from "@/components/faq/FaqGrid"

const H = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
const B = "[font-family:var(--font-kinetic-body),system-ui,sans-serif]"

/** Soft yellow highlighter for hero lead copy (marker pen, not lime CTA). */
const KINETIC_LEAD_MARKER =
    "box-decoration-clone rounded-sm bg-[#fdf6df] px-[0.22em] py-[0.06em] font-bold text-[#2a261c]"

/** Three-line headline: kinetic hero scale but capped at `xl:text-7xl` (not `8xl`) and no max-width so each line stays one row. */
const PRICING_HERO_H1 =
    "flex flex-col gap-0 font-bold leading-[0.92] tracking-tighter text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] xl:text-7xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

/** Matches kinetic hero primary CTA — `components/landing/landing-page.tsx` (Build Your Portal). */
const LANDING_LIME_CTA =
    "group inline-flex items-center justify-center gap-2 rounded bg-[#72ff70] px-8 py-3 text-base font-bold tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

/** Same as landing secondary (Book a Demo shell). */
const LANDING_DARK_CTA =
    "group inline-flex h-14 items-center justify-center gap-2 rounded-md border border-transparent bg-[#141c2a] px-8 text-base font-bold tracking-widest text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

/** Full-width plan card CTAs — same shadow/hover/active as landing, compact type. */
const LANDING_LIME_CTA_CARD =
    "group inline-flex w-full items-center justify-center gap-2 rounded bg-[#72ff70] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

const LANDING_DARK_CTA_CARD =
    "group inline-flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-[#141c2a] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

function PricingMatrixCell({ value, standardHighlight }: { value: PlanValue; standardHighlight: boolean }) {
    if (value === true) {
        return (
            <span className="inline-flex justify-center text-[#006e16]">
                <Check className="h-5 w-5" strokeWidth={2.5} aria-label="Included" />
            </span>
        )
    }
    if (value === false) {
        return <span className="text-[#c6c6cc]">—</span>
    }
    return (
        <span
            className={cn(
                "text-sm font-medium",
                standardHighlight ? "text-[#002203]" : "text-[#45474c]",
            )}
        >
            {value}
        </span>
    )
}

function checkoutPlanFromPricingPlanId(id: string): CheckoutPlanName {
    if (id === "Standard") return "Standard"
    if (id === "Pro") return "Pro"
    if (id === "Business") return "Business"
    if (id === "Enterprise") return "Enterprise"
    return "Standard"
}

type PricingComparisonRow = (typeof PRICING_COMPARISON)[number]["rows"][number]

function PricingComparisonTooltipBody({ row }: { row: PricingComparisonRow }) {
    if (row.tooltipLayout === "hierarchy-sample") {
        return (
            <div className="space-y-2">
                <PricingFirmClientEngagementHierarchyVisual />
                <p className="whitespace-pre-line text-sm">{row.tooltip}</p>
            </div>
        )
    }
    if (row.tooltipLayout === "engagement-personas") {
        return <PricingEngagementPersonasTooltip />
    }
    return row.tooltip ? (
        <p className="whitespace-pre-line text-sm">{row.tooltip}</p>
    ) : null
}

type MobileMatrixColumnId = typeof PRICING_SANDBOX_COLUMN_ID | PricingPlanColumnId

function getDisplayPrice(plan: PricingPlan, billingPeriod: "monthly" | "annual"): string | null {
    if (!plan.price || plan.price === "Contact Us") return null
    if (billingPeriod === "annual") {
        if (plan.priceBilledAnnually != null) return `$${plan.priceBilledAnnually}`
        const n = parseInt(plan.price.replace("$", ""), 10)
        if (!Number.isNaN(n)) return `$${Math.round(n * 0.84)}`
    }
    return plan.price
}

export default function PricingPage() {
    const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual")
    const [activeTab, setActiveTab] = useState<"pricing" | "faq">("pricing")
    /** Last plan the visitor expressed interest in — Title Case in localStorage via {@link persistCheckoutIntent}. */
    const [checkoutPlanFocus, setCheckoutPlanFocus] = useState<CheckoutPlanName>("Standard")
    const [mobileMatrixColumn, setMobileMatrixColumn] = useState<MobileMatrixColumnId>("Standard")

    useEffect(() => {
        persistCheckoutIntent({ plan: checkoutPlanFocus, interval: billingPeriod })
    }, [checkoutPlanFocus, billingPeriod])

    useEffect(() => {
        if (mobileMatrixColumn !== PRICING_SANDBOX_COLUMN_ID) {
            setCheckoutPlanFocus(checkoutPlanFromPricingPlanId(mobileMatrixColumn))
        }
    }, [mobileMatrixColumn])

    const highlightPlanId = "Standard"

    return (
        <div
            className={cn(
                "min-h-screen bg-[#fcf8fa] text-[#1b1b1d] antialiased selection:bg-[#72ff70] selection:text-[#002203]",
                B,
            )}
        >
            <Header />

            <div className={MARKETING_PAGE_SHELL}>
                <MarketingBreadcrumb items={[{ label: "Pricing" }]} className="mb-6 pt-1" />
            </div>

            <main className="pb-16 md:pb-24">
                {/* Hero — kinetic color pop aligned with landing (lime badge, green + electric blue accents) */}
                <section className={cn(MARKETING_PAGE_SHELL, "mb-14 md:mb-20")}>
                    <div className="relative overflow-hidden border border-[#c6c6cc]/20 bg-gradient-to-br from-[#fcf8fa] via-white to-[#eef2ff]/70 px-5 py-8 shadow-[0_24px_60px_-28px_rgba(90,120,255,0.12),0_12px_40px_-20px_rgba(0,110,22,0.08)] md:px-8 md:py-10 lg:px-10 lg:py-12">
                        <div
                            className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-[#72ff70]/[0.12] blur-3xl"
                            aria-hidden
                        />
                        <div
                            className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-[#5a78ff]/[0.08] blur-3xl"
                            aria-hidden
                        />
                        <div className="relative">
                            <KineticMarketingBadge
                                variant="lime"
                                className="mb-4 md:mb-5"
                                icon={<SquareFunction className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />}
                                tracking="tight"
                            >
                                Avoid per-seat surcharge — scales with engagements
                            </KineticMarketingBadge>
                            <h1 className={cn("mb-0", PRICING_HERO_H1)}>
                                <span className="text-[#1b1b1d]">Firm-scale delivery.</span>
                                <span className="text-[#006e16]">Unlimited members.</span>
                                <span className="text-[#5a78ff]">Firm-based tiers.</span>
                            </h1>
                            <div className="mt-10 flex flex-col gap-8 lg:mt-12 lg:flex-row lg:items-end lg:justify-between">
                                <div className={cn("max-w-3xl space-y-3", kineticSectionLeadClassName)}>
                                    <p>
                                        <span className={KINETIC_LEAD_MARKER}>Avoid per-seat surcharge</span>
                                        . Add firm admins, engagement leads, clients, and external collaborators at no extra per-user cost.{" "}
                                    </p>
                                    <p>
                                        Pricing follows active engagements and your firm tier—not headcount. Your whole
                                        team stays on the same price.
                                    </p>
                                    <p>
                                        <span className={KINETIC_LEAD_MARKER}>
                                            Bring your own Google Drive—non-custodial
                                        </span>
                                        . Your documents stay where they are; we add the portal. No migration, no new
                                        storage. Professional client portal with engagement personas and feedback
                                        tracking.
                                    </p>

                                </div>
                                <div
                                    className="inline-flex w-fit shrink-0 items-stretch gap-1 rounded-none border border-[#9ea0a8]/45 bg-[#cfd1d9] p-1 shadow-[inset_0_1px_3px_rgba(15,23,42,0.12)]"
                                    role="group"
                                    aria-label="Billing period"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setBillingPeriod("annual")}
                                        className={cn(
                                            "rounded-none px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-200 min-h-[44px]",
                                            H,
                                            billingPeriod === "annual"
                                                ? "bg-white text-[#1b1b1d] shadow-[0_2px_8px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.06)]"
                                                : "text-[#3f4149] hover:bg-white/35 hover:text-[#1b1b1d]",
                                        )}
                                    >
                                        Annual{" "}
                                        <span className="ml-1 font-bold text-[#006e16]" aria-hidden>
                                            20% off
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBillingPeriod("monthly")}
                                        className={cn(
                                            "rounded-none px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-200 min-h-[44px]",
                                            H,
                                            billingPeriod === "monthly"
                                                ? "bg-white text-[#1b1b1d] shadow-[0_2px_8px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.06)]"
                                                : "text-[#3f4149] hover:bg-white/35 hover:text-[#1b1b1d]",
                                        )}
                                    >
                                        Monthly
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* PRICING / FAQs toggle */}
                <div className={cn(MARKETING_PAGE_SHELL, "mb-10 flex justify-center")}>
                    <div className="inline-flex items-center gap-1 rounded border border-[#c6c6cc]/40 bg-white p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setActiveTab("pricing")}
                            className={cn(
                                "px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-widest transition-all duration-150 min-h-[36px]",
                                H,
                                activeTab === "pricing"
                                    ? "bg-[#1b1b1d] text-white shadow-sm"
                                    : "text-[#45474c] hover:text-[#1b1b1d]",
                            )}
                        >
                            Pricing
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("faq")}
                            className={cn(
                                "px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-widest transition-all duration-150 min-h-[36px]",
                                H,
                                activeTab === "faq"
                                    ? "bg-[#1b1b1d] text-white shadow-sm"
                                    : "text-[#45474c] hover:text-[#1b1b1d]",
                            )}
                        >
                            FAQs
                        </button>
                    </div>
                </div>

                {activeTab === "pricing" && <>

                {/* Plan cards — sandbox first, then paid tiers */}
                <section className={cn(MARKETING_PAGE_SHELL, "mb-20 md:mb-28")}>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5 xl:gap-5 xl:items-stretch">
                        {/* Free sandbox card — light theme matches Standard (featured) card */}
                        <div
                            className={cn(
                                "relative z-[1] flex flex-col rounded-none border border-[#006e16]/35 bg-white/90 p-7 backdrop-blur-md shadow-[0_6px_24px_-6px_rgba(0,110,22,0.07),0_4px_14px_-4px_rgba(27,27,29,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_32px_-8px_rgba(0,110,22,0.1),0_6px_18px_-6px_rgba(27,27,29,0.08)] md:p-8",
                            )}
                        >
                            <div
                                className={cn(
                                    "mb-1 text-sm font-bold uppercase tracking-[0.18em] text-[#1b1b1d]",
                                    H,
                                )}
                            >
                                Sandbox
                            </div>
                            <p className={cn("mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#006e16]", H)}>
                                Free · No card required
                            </p>
                            <div className="mb-2 flex items-baseline gap-1">
                                <span className={cn("text-4xl font-bold tracking-tight text-[#1b1b1d]", H)}>Free</span>
                            </div>
                            <p className="mb-4 text-xs text-[#45474c]">Explore {BRAND_NAME} on your terms</p>
                            <div className="mb-5 space-y-1">
                                {sandboxPlanUsageSummary().map((line, idx) => (
                                    <p key={idx} className="text-sm text-[#45474c]">
                                        {line}
                                    </p>
                                ))}
                            </div>
                            <p className="mb-8 flex-grow text-sm leading-relaxed text-[#45474c]">
                                Explore the portal, firm hierarchy, and engagements on your Drive—no card. Step up to a{" "}
                                <strong className="font-semibold text-[#1b1b1d]">30-day Standard trial</strong> when you
                                are ready.
                            </p>
                            <div className="mt-auto">
                                <Link
                                    href="/signup"
                                    className={LANDING_LIME_CTA_CARD}
                                    onClick={() => setCheckoutPlanFocus("Free Sandbox")}
                                >
                                    Get Started
                                    <ArrowRight
                                        className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </Link>
                            </div>
                        </div>

                        {PRICING_PLANS.map((plan) => {
                            const displayPrice = getDisplayPrice(plan, billingPeriod)
                            const isEnterprise = plan.id === "Enterprise"
                            const isFeatured = plan.popular === true || plan.id === highlightPlanId
                            const summary = planCardUsageSummary(plan)

                            return (
                                <div
                                    key={plan.id}
                                    className={cn(
                                        "relative flex flex-col rounded-none p-7 md:p-8 transition-all duration-200",
                                        isFeatured
                                            ? "z-[1] border border-[#006e16]/35 bg-white/90 backdrop-blur-md shadow-[0_6px_24px_-6px_rgba(0,110,22,0.07),0_4px_14px_-4px_rgba(27,27,29,0.06)] hover:-translate-y-0.5 hover:shadow-[0_10px_32px_-8px_rgba(0,110,22,0.1),0_6px_18px_-6px_rgba(27,27,29,0.08)]"
                                            : "border border-[#c6c6cc]/20 bg-[#f6f3f4] shadow-[0_12px_32px_-10px_rgba(27,27,29,0.12),0_4px_14px_-6px_rgba(27,27,29,0.08)] hover:-translate-y-1 hover:shadow-[0_20px_44px_-12px_rgba(27,27,29,0.16),0_8px_20px_-8px_rgba(27,27,29,0.1)]",
                                    )}
                                >
                                    {isFeatured && (
                                        <div
                                            className={cn(
                                                "absolute -top-3 left-1/2 -translate-x-1/2 rounded-none bg-[#006e16] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white",
                                                H,
                                            )}
                                        >
                                            Recommended
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#45474c]",
                                            H,
                                            isFeatured && "text-[#1b1b1d]",
                                        )}
                                    >
                                        {plan.title}
                                    </div>
                                    {displayPrice != null ? (
                                        <div className="mb-2 flex items-baseline gap-1">
                                            <span className={cn("text-4xl font-bold tracking-tight text-[#1b1b1d]", H)}>
                                                {displayPrice}
                                            </span>
                                            <span className="text-sm text-[#45474c]">{plan.duration}</span>
                                        </div>
                                    ) : (
                                        <div className="mb-2">
                                            <p className={cn("text-2xl font-bold text-[#1b1b1d]", H)}>Custom</p>
                                            <p className="text-sm text-[#45474c]">{platformEmail("sales")}</p>
                                        </div>
                                    )}
                                    {displayPrice != null && (
                                        <p className="mb-4 text-xs text-[#45474c]">
                                            {billingPeriod === "annual" ? "Billed annually" : "Billed monthly"}
                                        </p>
                                    )}
                                    {summary.length > 0 && (
                                        <div className="mb-5 space-y-1">
                                            {summary.map((line, idx) => (
                                                <p key={idx} className="text-sm text-[#45474c]">
                                                    {line}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                    <p className="mb-8 flex-grow text-sm leading-relaxed text-[#45474c]">{plan.description}</p>
                                    <div className="mt-auto">
                                        <Link
                                            href={
                                                plan.id === "Standard"
                                                    ? `/signup?intent=standard&interval=${billingPeriod}&paid_plan=true`
                                                    : (plan.href ?? "/contact") === "/contact"
                                                      ? CONTACT_HREF_SALES_INQUIRY
                                                      : (plan.href ?? "/contact")
                                            }
                                            className={isFeatured ? LANDING_LIME_CTA_CARD : LANDING_DARK_CTA_CARD}
                                            onClick={() => setCheckoutPlanFocus(checkoutPlanFromPricingPlanId(plan.id))}
                                        >
                                            {isEnterprise ? "Contact sales" : plan.cta ?? "Get started"}
                                            {isEnterprise ? (
                                                <MessageSquareMore
                                                    className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                                    strokeWidth={2}
                                                    aria-hidden
                                                />
                                            ) : (
                                                <ArrowRight
                                                    className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                                    strokeWidth={2}
                                                    aria-hidden
                                                />
                                            )}
                                        </Link>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* Comparison: plan-picker matrix on small screens; full table from `lg` */}
                <section className={cn(MARKETING_PAGE_SHELL, "mb-20 md:mb-28")}>
                    <h2
                        className={cn(
                            "mb-6 text-3xl font-bold tracking-tight text-[#1b1b1d] md:mb-10 md:text-4xl",
                            H,
                        )}
                    >
                        Technical comparison
                    </h2>

                    <TooltipProvider delayDuration={0}>
                        <div className="lg:hidden">
                            <p className={cn("mb-4 text-sm leading-relaxed text-[#45474c]", B)}>
                                Select a column to compare. Sandbox is always shown as a reference when a paid plan is
                                selected.
                            </p>
                            <div
                                className="mb-6 flex flex-wrap gap-2"
                                role="tablist"
                                aria-label="Comparison column"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={mobileMatrixColumn === PRICING_SANDBOX_COLUMN_ID}
                                    onClick={() => setMobileMatrixColumn(PRICING_SANDBOX_COLUMN_ID)}
                                    className={cn(
                                        "rounded-none border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors min-h-[44px]",
                                        H,
                                        mobileMatrixColumn === PRICING_SANDBOX_COLUMN_ID
                                            ? "border-[#006e16] bg-[#72ff70]/25 text-[#002203]"
                                            : "border-[#c6c6cc]/40 bg-white text-[#45474c] hover:border-[#006e16]/40",
                                    )}
                                >
                                    Sandbox
                                </button>
                                {PRICING_PLANS.map((plan) => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={mobileMatrixColumn === plan.id}
                                        onClick={() => setMobileMatrixColumn(plan.id)}
                                        className={cn(
                                            "rounded-none border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors min-h-[44px]",
                                            H,
                                            mobileMatrixColumn === plan.id
                                                ? "border-[#006e16] bg-[#72ff70]/25 text-[#002203]"
                                                : "border-[#c6c6cc]/40 bg-white text-[#45474c] hover:border-[#006e16]/40",
                                            plan.id === highlightPlanId &&
                                                mobileMatrixColumn !== plan.id &&
                                                "ring-1 ring-[#72ff70]/40",
                                        )}
                                    >
                                        {plan.title}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-8 rounded-none border border-[#c6c6cc]/20 bg-[#fcf8fa] p-4 shadow-[0_20px_40px_rgba(27,27,29,0.06)] sm:p-5">
                                {PRICING_COMPARISON.map((category) => (
                                    <div key={category.name}>
                                        <div
                                            className={cn(
                                                "mb-3 border-b border-[#c6c6cc]/20 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]",
                                                H,
                                            )}
                                        >
                                            {category.name}
                                        </div>
                                        <div className="space-y-3">
                                            {category.rows.map((row) => {
                                                const primary: PlanValue = row.values[mobileMatrixColumn] ?? false
                                                const sandboxValue: PlanValue =
                                                    row.values[PRICING_SANDBOX_COLUMN_ID] ?? false
                                                const primaryHi =
                                                    mobileMatrixColumn !== PRICING_SANDBOX_COLUMN_ID &&
                                                    mobileMatrixColumn === highlightPlanId
                                                return (
                                                    <div
                                                        key={`${category.name}-${row.feature}`}
                                                        className="rounded-none border border-[#c6c6cc]/15 bg-white p-4 shadow-sm"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="font-medium leading-snug text-[#1b1b1d]">
                                                                {row.feature}
                                                            </span>
                                                            {row.tooltip ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="mt-0.5 shrink-0 cursor-help touch-manipulation">
                                                                            <HelpCircle className="h-4 w-4 text-[#76777d]" />
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="max-w-md border-[#c6c6cc]/30 bg-white px-3 py-2 text-[#45474c] shadow-lg">
                                                                        <PricingComparisonTooltipBody row={row} />
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            ) : null}
                                                        </div>
                                                        <div className="mt-3 flex flex-col gap-1 border-t border-[#eae7e9] pt-3">
                                                            <span className={cn("text-[10px] font-bold uppercase tracking-widest text-[#45474c]", H)}>
                                                                {mobileMatrixColumn === PRICING_SANDBOX_COLUMN_ID
                                                                    ? "Sandbox"
                                                                    : PRICING_PLANS.find((p) => p.id === mobileMatrixColumn)
                                                                          ?.title ?? mobileMatrixColumn}
                                                            </span>
                                                            <div className="flex justify-start">
                                                                <PricingMatrixCell
                                                                    value={primary}
                                                                    standardHighlight={primaryHi}
                                                                />
                                                            </div>
                                                        </div>
                                                        {mobileMatrixColumn !== PRICING_SANDBOX_COLUMN_ID ? (
                                                            <div className="mt-3 flex flex-col gap-1 border-t border-dashed border-[#c6c6cc]/30 pt-3">
                                                                <span
                                                                    className={cn(
                                                                        "text-[10px] font-bold uppercase tracking-widest text-[#45474c]",
                                                                        H,
                                                                    )}
                                                                >
                                                                    vs Sandbox
                                                                </span>
                                                                <div className="flex justify-start">
                                                                    <PricingMatrixCell
                                                                        value={sandboxValue}
                                                                        standardHighlight={false}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="hidden overflow-x-auto rounded-none border border-[#c6c6cc]/20 bg-[#fcf8fa] shadow-[0_20px_40px_rgba(27,27,29,0.06)] lg:block">
                            <div className="min-w-[880px]">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-[#eae7e9]">
                                            <th
                                                className={cn(
                                                    "border-r border-[#c6c6cc]/15 p-4 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[#45474c] md:p-6",
                                                    H,
                                                )}
                                            >
                                                Capability
                                            </th>
                                            <th
                                                className={cn(
                                                    "border-r border-[#c6c6cc]/15 p-4 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#45474c] md:p-6",
                                                    H,
                                                )}
                                            >
                                                Free sandbox
                                            </th>
                                            {PRICING_PLANS.map((plan) => (
                                                <th
                                                    key={plan.id}
                                                    className={cn(
                                                        "border-r border-[#c6c6cc]/15 p-4 text-center text-[10px] font-bold uppercase tracking-[0.18em] last:border-r-0 md:p-6",
                                                        H,
                                                        plan.id === highlightPlanId && "bg-[#72ff70]/10 text-[#002203]",
                                                        plan.id !== highlightPlanId && "text-[#45474c]",
                                                    )}
                                                >
                                                    {plan.title}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-[#1b1b1d]">
                                        {PRICING_COMPARISON.map((category) => (
                                            <Fragment key={category.name}>
                                                <tr>
                                                    <td
                                                        colSpan={6}
                                                        className={cn(
                                                            "bg-[#f6f3f4] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c] md:px-6",
                                                            H,
                                                        )}
                                                    >
                                                        {category.name}
                                                    </td>
                                                </tr>
                                                {category.rows.map((row) => {
                                                    const sandboxValue: PlanValue =
                                                        row.values[PRICING_SANDBOX_COLUMN_ID] ?? false
                                                    return (
                                                        <tr
                                                            key={`${category.name}-${row.feature}`}
                                                            className="border-b border-[#c6c6cc]/15 last:border-b-0"
                                                        >
                                                            <td className="border-r border-[#c6c6cc]/15 p-4 align-middle md:p-6">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <span className="font-medium leading-snug text-[#1b1b1d]">
                                                                        {row.feature}
                                                                    </span>
                                                                    {row.tooltip && (
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <span className="mt-0.5 shrink-0 cursor-help touch-manipulation">
                                                                                    <HelpCircle className="h-4 w-4 text-[#76777d]" />
                                                                                </span>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent className="max-w-md border-[#c6c6cc]/30 bg-white px-3 py-2 text-[#45474c] shadow-lg">
                                                                                <PricingComparisonTooltipBody row={row} />
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td
                                                                className={cn(
                                                                    "border-r border-[#c6c6cc]/15 p-4 text-center align-middle md:p-6",
                                                                    "bg-[#f0edee]/50",
                                                                )}
                                                            >
                                                                <PricingMatrixCell
                                                                    value={sandboxValue}
                                                                    standardHighlight={false}
                                                                />
                                                            </td>
                                                            {PRICING_PLANS.map((plan) => {
                                                                const value: PlanValue = row.values[plan.id] ?? false
                                                                const isHi = plan.id === highlightPlanId
                                                                return (
                                                                    <td
                                                                        key={plan.id}
                                                                        className={cn(
                                                                            "border-r border-[#c6c6cc]/15 p-4 text-center align-middle last:border-r-0 md:p-6",
                                                                            isHi ? "bg-[#72ff70]/[0.07]" : "bg-[#fcf8fa]",
                                                                        )}
                                                                    >
                                                                        <PricingMatrixCell
                                                                            value={value}
                                                                            standardHighlight={isHi}
                                                                        />
                                                                    </td>
                                                                )
                                                            })}
                                                        </tr>
                                                    )
                                                })}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </TooltipProvider>
                </section>

                </>}

                {/* FAQ tab view */}
                {activeTab === "faq" && (
                    <section className="border-t border-[#c6c6cc]/20 bg-[#f6f3f4] py-14 md:py-20">
                        <div className={MARKETING_PAGE_SHELL}>
                            <FaqGrid defaultFilter="Billing" />
                        </div>
                    </section>
                )}

                {/* CTA band */}
                <section className={cn(MARKETING_PAGE_SHELL, "mt-16 md:mt-20")}>
                    <div className="relative overflow-hidden bg-[#141c2a] px-8 py-14 md:px-14 md:py-20">
                        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-20">
                            <div className="h-full w-full bg-gradient-to-l from-[#72ff70] to-transparent" />
                        </div>
                        <div className="relative z-[1] flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
                            <div className="max-w-2xl">
                                <h2
                                    className={cn(
                                        "text-3xl font-bold leading-[1.05] tracking-tighter text-white md:text-5xl lg:text-6xl",
                                        H,
                                    )}
                                >
                                    Bring your own Drive. Setup your client portal atop your Drive.
                                </h2>
                                <p className="mt-4 text-lg text-[#bfc6da]">
                                    Open a sandbox in minutes, then move to a Standard trial when your firm is ready to
                                    ship.
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-4 sm:flex-row sm:w-auto">
                                <Link href="/signup" className={cn(LANDING_LIME_CTA, "w-full sm:w-auto")}>
                                    Get Started
                                    <ArrowRight
                                        className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </Link>
                                <a
                                    href={CALENDLY_DEMO_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(LANDING_DARK_CTA, "w-full sm:w-auto cursor-pointer")}
                                >
                                    <CalendarDays
                                        className="h-5 w-5 shrink-0 stroke-[1.5] text-[#72ff70] opacity-90"
                                        aria-hidden
                                    />
                                    Book demo
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    )
}
