'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, Minus, CreditCard, Check } from 'lucide-react'
import { useOnboarding } from '@/lib/onboarding-context'
import { useAuth } from '@/lib/auth-context'
import { getUserFirms, shouldShowSwitchWorkspace } from '@/lib/actions/firms'
import { buildBillingPageHref } from '@/lib/billing/build-billing-page-href'
import { fetchBillingCurrentPlan } from '@/lib/billing/fetch-billing-current-plan'
import { formatProfilePlanSubtitle } from '@/lib/billing/format-profile-plan-subtitle'
import { planNameForSummary } from '@/lib/billing/subscription-display'
import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { ProfileSection } from '@/components/ui/profile-section'
import { Tag } from '@/components/ui/tag'
import { cn } from '@/lib/utils'

type Requirement = 'mandatory' | 'optional'

/** Order: 1) Initialize → 2) Subscribe (optional). Drive is connected per-client in Client Settings. */
const ONBOARDING_STEPS: {
    id: number
    name: string
    requirement: Requirement
    description: string
    Icon: typeof Lock
}[] = [
    { id: 1, name: 'Initialize workspace', requirement: 'mandatory', description: 'Anchor the firm in your account', Icon: Lock },
    { id: 2, name: 'Subscribe to a plan', requirement: 'optional', description: 'Compare and choose a plan', Icon: CreditCard },
]

/** Sentence-case requirement tag (New UI): neutral, so it reads as metadata rather than a warning. */
function RequirementPill({ requirement }: { requirement: Requirement }) {
    return <Tag color="gray">{requirement === 'mandatory' ? 'Required' : 'Optional'}</Tag>
}

type StepState = 'completed' | 'skipped' | 'active' | 'pending'

/** 20px step marker, Linear-checklist style: a filled accent check when done, a dash when skipped, else the number. */
function StepMarker({ state, number }: { state: StepState; number: number }) {
    return (
        <span
            aria-hidden
            className={cn(
                'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption tabular-nums transition-colors duration-100',
                state === 'completed' && 'bg-action text-action-fg',
                state === 'skipped' && 'border border-line-strong text-fg-subtle',
                state === 'active' && 'border border-action text-action',
                state === 'pending' && 'border border-line-strong text-fg-subtle'
            )}
        >
            {state === 'completed' ? (
                <Check className="h-3 w-3" strokeWidth={2.5} />
            ) : state === 'skipped' ? (
                <Minus className="h-3 w-3" strokeWidth={2.5} />
            ) : (
                number
            )}
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
    const [showSwitchWorkspace, setShowSwitchWorkspace] = useState(false)

    const billingFirmSlug =
        firms.find((o) => o.isDefault)?.slug ?? firms[0]?.slug ?? null
    const billingGroupSlug = useMemo(() => {
        if (!billingFirmSlug) return null
        return firms.find((f) => f.slug === billingFirmSlug)?.groupSlug ?? null
    }, [firms, billingFirmSlug])
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
        let cancelled = false
        shouldShowSwitchWorkspace()
            .then((show) => { if (!cancelled) setShowSwitchWorkspace(show) })
            .catch(() => { if (!cancelled) setShowSwitchWorkspace(false) })
        return () => { cancelled = true }
    }, [])

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
        <div className="flex h-full flex-col overflow-hidden bg-surface">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4">
                <p className="px-2 pb-2 text-caption text-fg-subtle">Set up your workspace</p>
                <ol className="flex flex-col gap-0.5">
                    {steps.map((s, idx) => {
                        const isActive = currentStep === s.id
                        const isPast = currentStep !== null && currentStep > s.id
                        const isSkipped = isPast && skippedSteps.has(s.id)
                        const isCompleted = isPast && !isSkipped
                        const state: StepState = isCompleted
                            ? 'completed'
                            : isSkipped
                              ? 'skipped'
                              : isActive
                                ? 'active'
                                : 'pending'

                        return (
                            <li key={s.id} aria-current={isActive ? 'step' : undefined}>
                                <div
                                    ref={isActive ? activeStepRef : undefined}
                                    className={cn(
                                        'flex items-start gap-2.5 rounded-control px-2 py-2 transition-colors duration-100',
                                        isActive && 'bg-surface-selected'
                                    )}
                                >
                                    <StepMarker state={state} number={idx + 1} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                            <h3
                                                className={cn(
                                                    'text-ui font-medium',
                                                    isActive || isPast ? 'text-fg' : 'text-fg-muted'
                                                )}
                                            >
                                                {s.name}
                                            </h3>
                                            <RequirementPill requirement={s.requirement} />
                                        </div>
                                        <p
                                            className={cn(
                                                'mt-0.5 text-small',
                                                isCompleted ? 'text-action' : isActive ? 'text-fg-muted' : 'text-fg-subtle'
                                            )}
                                        >
                                            {isCompleted ? 'Completed' : isSkipped ? 'Skipped' : s.description}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            </div>

            {user && (
                <ProfileSection
                    user={user}
                    signOut={signOut}
                    isCollapsed={false}
                    showBillingLink
                    billingHref={buildBillingPageHref({ firmSlug: billingFirmSlug, groupSlug: billingGroupSlug, pathname })}
                    supportHref={billingFirmSlug ? `/d/support?firmSlug=${billingFirmSlug}` : undefined}
                    showSwitchWorkspace={showSwitchWorkspace}
                    {...(firms.length > 0 && billingFirmId
                        ? { planSubtitle: profilePlanSubtitle, planSubtitleLoading: billingPlanLoading }
                        : {})}
                />
            )}
        </div>
    )
}
