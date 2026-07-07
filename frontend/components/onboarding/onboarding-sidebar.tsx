'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, Minus, CreditCard } from 'lucide-react'
import { useOnboarding } from '@/lib/onboarding-context'
import { useAuth } from '@/lib/auth-context'
import { getUserFirms } from '@/lib/actions/firms'
import { buildBillingPageHref } from '@/lib/billing/build-billing-page-href'
import { fetchBillingCurrentPlan } from '@/lib/billing/fetch-billing-current-plan'
import { formatProfilePlanSubtitle } from '@/lib/billing/format-profile-plan-subtitle'
import { planNameForSummary } from '@/lib/billing/subscription-display'
import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { ProfileSection } from '@/components/ui/profile-section'

type Requirement = 'mandatory' | 'optional'

/** Order: 1) Initialize → 2) Subscribe (optional). Drive is connected per-client in Client Settings. */
const ONBOARDING_STEPS: {
    id: number
    name: string
    requirement: Requirement
    description: string
    Icon: typeof Lock
}[] = [
    { id: 1, name: 'Initialize Workspace', requirement: 'mandatory', description: 'Anchor firm in your account', Icon: Lock },
    { id: 2, name: 'Subscribe to a plan', requirement: 'optional', description: 'Compare & choose a plan', Icon: CreditCard },
]

function RequirementPill({ requirement }: { requirement: Requirement }) {
    if (requirement === 'mandatory') {
        return (
            <span className="font-mono inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide tabular-nums leading-none bg-[#1b1b1d]/10 text-[#1b1b1d]">
                Mandatory
            </span>
        )
    }
    return (
        <span className="font-mono inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide tabular-nums leading-none bg-amber-50 text-amber-900 border border-amber-200/80">
            Optional
        </span>
    )
}

export function OnboardingSidebar() {
    const pathname = usePathname()
    const { currentStep, skippedSteps } = useOnboarding()
    const { user, signOut } = useAuth()
    const activeStepRef = useRef<HTMLDivElement>(null)
    const [firms, setFirms] = useState<Awaited<ReturnType<typeof getUserFirms>>>([])
    const [billingPlanState, setBillingPlanState] = useState<BillingCurrentPlanState | null>(null)
    const [billingPlanLoading, setBillingPlanLoading] = useState(false)

    const billingFirmSlug =
        firms.find((o) => o.isDefault)?.slug ?? firms[0]?.slug ?? null
    const billingFirmId = useMemo(() => {
        if (!billingFirmSlug) return null
        return firms.find((f) => f.slug === billingFirmSlug)?.id ?? null
    }, [firms, billingFirmSlug])
    const billingSandboxOnly = useMemo(() => {
        if (!billingFirmSlug) return false
        return firms.find((f) => f.slug === billingFirmSlug)?.sandboxOnly ?? false
    }, [firms, billingFirmSlug])

    const profilePlanSubtitle = useMemo(() => {
        if (!billingPlanState) return formatProfilePlanSubtitle(null, { sandboxOnly: billingSandboxOnly })
        return `${planNameForSummary(billingPlanState)} plan`
    }, [billingPlanState, billingSandboxOnly])

    useEffect(() => {
        let cancelled = false
        getUserFirms()
            .then((list) => {
                if (!cancelled) setFirms(list)
            })
            .catch(() => {
                if (!cancelled) setFirms([])
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        activeStepRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }, [currentStep])

    useEffect(() => {
        if (!billingFirmId) {
            setBillingPlanState(null)
            setBillingPlanLoading(false)
            return
        }
        let cancelled = false
        setBillingPlanLoading(true)
        fetchBillingCurrentPlan(billingFirmId)
            .then((s) => {
                if (!cancelled) {
                    setBillingPlanState(s)
                    setBillingPlanLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setBillingPlanState(null)
                    setBillingPlanLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [billingFirmId])

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState !== 'visible') return
            if (!billingFirmId) return
            void fetchBillingCurrentPlan(billingFirmId).then(setBillingPlanState)
        }
        document.addEventListener('visibilitychange', refresh)
        window.addEventListener('focus', refresh)
        return () => {
            document.removeEventListener('visibilitychange', refresh)
            window.removeEventListener('focus', refresh)
        }
    }, [billingFirmId])

    const steps = ONBOARDING_STEPS.filter((s) => s.id !== 0)

    return (
        <div className="flex flex-col h-full bg-white border-r border-[#e5e7eb] rounded overflow-hidden">
            {/* Steps: fixed-height connectors in the timeline column (not stretched by copy height). */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 pt-4">
                <div className="flex flex-col gap-0">
                    {steps.map((s, idx) => {
                        const StepIcon = s.Icon
                        const isActive = currentStep === s.id
                        const isPast = currentStep !== null && currentStep > s.id
                        const isSkipped = isPast && skippedSteps.has(s.id)
                        const isCompleted = isPast && !isSkipped
                        const isLast = idx === steps.length - 1
                        const segmentPast = currentStep !== null && currentStep > s.id

                        const iconForStep = () => {
                            if (isCompleted) return <StepIcon className="h-4 w-4 text-primary" />
                            if (isSkipped) return <Minus className="h-4 w-4 text-[#45474c]/50" strokeWidth={2.5} />
                            return <StepIcon className={`h-4 w-4 ${isActive ? 'text-[#45474c]' : 'text-[#45474c]/50'}`} />
                        }

                        return (
                            <div
                                key={s.id}
                                ref={isActive ? activeStepRef : undefined}
                                className="flex items-stretch gap-3"
                            >
                                {/* Timeline: stretch to text column height so the bar runs bubble → bubble with no dead gap */}
                                <div className="flex w-10 shrink-0 flex-col items-center self-stretch">
                                    <div
                                        className={`relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-white transition-all ${isCompleted
                                            ? 'border-primary'
                                            : isSkipped
                                              ? 'border-[#e5e7eb] bg-white'
                                              : isActive
                                                ? 'border-primary/40 bg-white'
                                                : 'border-[#e5e7eb] bg-white'
                                            }`}
                                    >
                                        {iconForStep()}
                                    </div>
                                    {!isLast ? (
                                        <div
                                            className={`relative z-0 -mt-px w-0.5 flex-1 min-h-[0.75rem] rounded-none ${segmentPast ? 'bg-primary/30' : 'bg-[#e5e7eb]'}`}
                                            aria-hidden
                                        />
                                    ) : null}
                                </div>
                                <div
                                    className={`min-w-0 min-h-[5.75rem] flex-1 pt-0.5 ${isLast ? 'pb-1' : 'pb-5'}`}
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                                        <h3
                                            className={`text-xs font-semibold leading-tight ${isActive
                                                ? 'text-[#1b1b1d]'
                                                : isPast
                                                  ? 'text-[#45474c]'
                                                  : 'text-[#45474c]/50'
                                                }`}
                                        >
                                            {s.name}
                                        </h3>
                                        <RequirementPill requirement={s.requirement} />
                                    </div>
                                    {/* Same min-height so “Completed” vs description rows align across steps */}
                                    <div className="mt-0.5 min-h-[2.75rem]">
                                        {isCompleted ? (
                                            <p className="text-xs font-medium text-primary">Completed</p>
                                        ) : isSkipped ? (
                                            <p className="flex items-center gap-0.5 text-xs text-[#45474c]/50">
                                                <Minus className="h-3 w-3" />
                                                Skipped
                                            </p>
                                        ) : (
                                            <p
                                                className={`text-xs leading-snug ${isActive ? 'text-[#45474c]' : 'text-[#45474c]/50'}`}
                                            >
                                                {s.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {user && (
                <ProfileSection
                    user={user}
                    signOut={signOut}
                    isCollapsed={false}
                    showBillingLink
                    billingHref={buildBillingPageHref({ firmSlug: billingFirmSlug, pathname })}
                    supportHref={billingFirmSlug ? `/d/support?firmSlug=${billingFirmSlug}` : undefined}
                    {...(firms.length > 0 && billingFirmId
                        ? { planSubtitle: profilePlanSubtitle, planSubtitleLoading: billingPlanLoading }
                        : {})}
                />
            )}
        </div>
    )
}
