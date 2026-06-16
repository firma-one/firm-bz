'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, CreditCard, ExternalLink, HelpCircle, Loader2, Receipt, Rows3 } from 'lucide-react'
import { getUserFirms } from '@/lib/actions/firms'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { BillingPolarExplainInline, BillingRefundPolicyNote, PolarBillingLogo } from '@/components/billing/billing-polar-inline'
import { CurrentPlanSummary } from '@/components/billing/current-plan-summary'
import { PolarPlansPicker, type BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { fetchBillingCurrentPlan } from '@/lib/billing/fetch-billing-current-plan'
import { shouldShowSandboxUpgradeMarketing } from '@/lib/billing/subscription-display'
import { PageBreadcrumb } from '@/components/ui/page-breadcrumb'
import { cn } from '@/lib/utils'


const cardSurface = cn(
    'rounded-[2px] border border-[#e5e7eb] bg-white shadow-sm'
)

const trustIconTileClass = cn(
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px]',
    'border border-[#e5e7eb] bg-[#f9f9fb] text-[#45474c]'
)

export type BillingPageClientProps = {
    /**
     * Embedded in onboarding step 2: full billing UI with checkout, plus Skip → connect Drive.
     * Query `onboarding_billing=1` on `/d/billing` also enables the same behavior when not passed as props.
     */
    variant?: 'page' | 'onboardingSubscribe'
    onSkipToConnectDrive?: () => void | Promise<void>
    /** Polar `returnTo` after checkout (must pass `validateCheckoutReturnTo`). */
    embeddedCheckoutReturnTo?: string
}

export function BillingPageClient({
    variant: variantProp,
    onSkipToConnectDrive,
    embeddedCheckoutReturnTo,
}: BillingPageClientProps = {}) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const firmSlugParam = searchParams.get('firmSlug')?.trim() || ''
    const returnToParam = searchParams.get('returnTo')
    const paidPlanIntent = searchParams.get('paid_plan') === 'true'
    const onboardingBillingQuery = searchParams.get('onboarding_billing') === '1'
    const variant = variantProp ?? (onboardingBillingQuery ? 'onboardingSubscribe' : 'page')
    const isOnboardingSubscribe = variant === 'onboardingSubscribe'

    const [firms, setFirms] = useState<Awaited<ReturnType<typeof getUserFirms>>>([])
    const [loadError, setLoadError] = useState<string | null>(null)
    const [currentPlanState, setCurrentPlanState] = useState<BillingCurrentPlanState | null>(null)
    const [currentPlanLoading, setCurrentPlanLoading] = useState(false)
    /** False until the first fetch for the selected firm finishes (avoids a flash of "unable to load"). */
    const [currentPlanFetchCompleted, setCurrentPlanFetchCompleted] = useState(false)
    const [firmManageOk, setFirmManageOk] = useState(false)
    const [firmManageChecked, setFirmManageChecked] = useState(false)
    const [skipSubmitting, setSkipSubmitting] = useState(false)
    const [skipMessage, setSkipMessage] = useState<string | null>(null)

    const portalReturnPath = useMemo(() => {
        const q = searchParams.toString()
        return q ? `${pathname}?${q}` : pathname
    }, [pathname, searchParams])

    useEffect(() => {
        let cancelled = false
        getUserFirms()
            .then((list) => {
                if (!cancelled) setFirms(list)
            })
            .catch(() => {
                if (!cancelled) setLoadError('Could not load your workspaces.')
            })
        return () => {
            cancelled = true
        }
    }, [])

    const selectedFirm = useMemo(() => {
        if (!firms.length) return null
        if (firmSlugParam) {
            const bySlug = firms.find((f) => f.slug === firmSlugParam)
            if (bySlug) return bySlug
        }
        return firms.find((f) => f.isDefault) ?? firms[0]
    }, [firms, firmSlugParam])

    useEffect(() => {
        let cancelled = false
        if (!selectedFirm?.id) {
            setCurrentPlanState(null)
            setCurrentPlanLoading(false)
            setCurrentPlanFetchCompleted(false)
            return
        }
        setCurrentPlanFetchCompleted(false)
        setCurrentPlanLoading(true)
        void fetchBillingCurrentPlan(selectedFirm.id)
            .then((current) => {
                if (!cancelled) setCurrentPlanState(current)
            })
            .catch(() => {
                if (!cancelled) setCurrentPlanState(null)
            })
            .finally(() => {
                if (!cancelled) {
                    setCurrentPlanLoading(false)
                    setCurrentPlanFetchCompleted(true)
                }
            })
        return () => {
            cancelled = true
        }
    }, [selectedFirm?.id])

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState !== 'visible') return
            const id = selectedFirm?.id
            if (!id) return
            void fetchBillingCurrentPlan(id)
                .then(setCurrentPlanState)
                .catch(() => {
                    setCurrentPlanState(null)
                })
        }
        document.addEventListener('visibilitychange', refresh)
        window.addEventListener('focus', refresh)
        return () => {
            document.removeEventListener('visibilitychange', refresh)
            window.removeEventListener('focus', refresh)
        }
    }, [selectedFirm?.id])

    const returnPath = useMemo(() => {
        if (isOnboardingSubscribe) {
            const fromProp = embeddedCheckoutReturnTo
                ? validateCheckoutReturnTo(embeddedCheckoutReturnTo)
                : null
            const fromUrl = validateCheckoutReturnTo(returnToParam)
            return fromProp ?? fromUrl ?? '/d/onboarding?after_checkout=1'
        }
        return (
            validateCheckoutReturnTo(returnToParam) ??
            (selectedFirm ? `/d/f/${selectedFirm.slug}` : '/d')
        )
    }, [
        isOnboardingSubscribe,
        embeddedCheckoutReturnTo,
        returnToParam,
        selectedFirm,
    ])

    const showFreeTierUpgradeCopy = useMemo(() => {
        if (!currentPlanFetchCompleted || !currentPlanState) return false
        return shouldShowSandboxUpgradeMarketing(currentPlanState)
    }, [currentPlanFetchCompleted, currentPlanState])

    const showOnboardingSkipHint = isOnboardingSubscribe && showFreeTierUpgradeCopy

    useEffect(() => {
        if (loadError || !firms.length || !selectedFirm?.id) {
            setFirmManageOk(false)
            setFirmManageChecked(true)
            return
        }
        let cancelled = false
        setFirmManageChecked(false)
        fetch(`/api/permissions/firm?firmId=${encodeURIComponent(selectedFirm.id)}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('perm'))))
            .then((data: { canManage?: boolean }) => {
                if (cancelled) return
                if (data?.canManage === true) {
                    setFirmManageOk(true)
                    setFirmManageChecked(true)
                    return
                }
                setFirmManageOk(false)
                setFirmManageChecked(true)
                if (!isOnboardingSubscribe) {
                    router.replace(returnPath)
                }
            })
            .catch(() => {
                if (cancelled) return
                setFirmManageOk(false)
                setFirmManageChecked(true)
                if (!isOnboardingSubscribe) {
                    router.replace(returnPath)
                }
            })
        return () => {
            cancelled = true
        }
    }, [loadError, firms.length, selectedFirm?.id, returnPath, router, isOnboardingSubscribe])

    if (firms.length > 0 && selectedFirm?.id && !firmManageChecked) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500/80" aria-hidden />
                <span>Loading billing…</span>
            </div>
        )
    }

    if (firms.length > 0 && selectedFirm?.id && firmManageChecked && !firmManageOk) {
        if (!isOnboardingSubscribe) {
            return null
        }
        return (
            <div className="relative mx-auto max-w-5xl space-y-6 pb-10 px-4 sm:px-5 md:px-6">
                <div className="rounded-[2px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                    <p className="font-medium">Billing isn&apos;t available for your role on this workspace.</p>
                    <p className="mt-1 text-amber-900/90">
                        Ask an owner to assign billing access, or continue onboarding to connect Google Drive.
                    </p>
                </div>
                {onSkipToConnectDrive ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => void onSkipToConnectDrive()}
                            className="inline-flex h-8 items-center rounded-[2px] border border-[#e5e7eb] bg-white px-3 text-xs font-medium text-[#45474c] transition hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                        >
                            Skip to Google Drive
                        </button>
                    </div>
                ) : null}
            </div>
        )
    }

    const handleSkipUpgrade = async () => {
        setSkipMessage(null)
        setSkipSubmitting(true)
        try {
            const response = await fetch('/api/billing/skip-upgrade', { method: 'POST' })
            if (!response.ok) {
                throw new Error('Failed to skip for now')
            }
            setSkipMessage('Saved. We will remind you to upgrade on future sign-ins.')
            router.replace(returnPath)
        } catch (error) {
            setSkipMessage(error instanceof Error ? error.message : 'Could not save skip preference')
        } finally {
            setSkipSubmitting(false)
        }
    }

    return (
        <div className="relative space-y-10 pb-10" data-demo-tour="billing-page">
            {!isOnboardingSubscribe && selectedFirm ? (
                <PageBreadcrumb
                    items={[
                        {
                            label: selectedFirm.name,
                            href: selectedFirm.slug ? `/d/f/${selectedFirm.slug}` : returnPath,
                            icon: <Building2 className="h-4 w-4" />,
                        },
                        { label: 'Billing & plans', icon: <CreditCard className="h-4 w-4" /> },
                    ]}
                />
            ) : null}

            <header className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 className="min-w-0 font-headline text-2xl font-bold text-[#1b1b1d]">
                        {upgradeCopy.billingPageTitle}
                    </h1>
                    {isOnboardingSubscribe && onSkipToConnectDrive ? (
                        <button
                            type="button"
                            data-onboarding-billing-skip-tour
                            onClick={() => void onSkipToConnectDrive()}
                            className={cn(
                                'h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex shrink-0 items-center justify-center'
                            )}
                            aria-label="Skip subscribing for now and continue to connect Google Drive"
                        >
                            {upgradeCopy.billingOnboardingSkipSubscribeCta}
                        </button>
                    ) : null}
                </div>

                {showOnboardingSkipHint ? (
                    <p className="text-sm leading-relaxed text-slate-600">
                        Compare plans below, or skip when you&apos;re ready to connect Google Drive. Billing stays
                        available from settings later.
                    </p>
                ) : null}

                {showFreeTierUpgradeCopy ? (
                    <>
                        <p className="text-[0.8125rem] font-bold text-[#1b1b1d]">
                            {upgradeCopy.billingHeadline}
                        </p>
                        <p className="max-w-2xl text-xs leading-relaxed text-[#45474c]">
                            {upgradeCopy.billingBody}<br />{upgradeCopy.billingBodyLine2}
                        </p>
                    </>
                ) : null}
                {paidPlanIntent && (
                    <div className="mt-3 rounded-[2px] border border-primary/25 bg-primary/8 px-3 py-2 text-xs text-[#1b1b1d]">
                        You currently have an active Free plan. You can upgrade now, or skip and continue.
                    </div>
                )}
                {skipMessage && (
                    <div className="rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb] px-3 py-2 text-xs text-[#45474c]">
                        {skipMessage}
                    </div>
                )}
            </header>

            <ul className="grid gap-4 sm:grid-cols-2">
                {/* Secure Checkout */}
                <li className={cn('flex gap-3 p-4 sm:p-5', cardSurface)}>
                    <span className={trustIconTileClass}>
                        <PolarBillingLogo className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="text-[0.8125rem] font-bold text-[#1b1b1d]">{upgradeCopy.billingTrustLine1}</p>
                            <p className="mt-1 text-xs leading-relaxed text-[#45474c]">{upgradeCopy.billingTrustLine1Detail}</p>
                        </div>
                        <div className="w-px self-stretch bg-[#e5e7eb] shrink-0" aria-hidden />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs leading-relaxed text-[#45474c]">
                                {upgradeCopy.billingCheckoutIntro}{' '}
                                <BillingPolarExplainInline className="mx-px" />
                                {upgradeCopy.billingCheckoutOutro}
                            </p>
                        </div>
                    </div>
                </li>
                {/* Pricing & Billing */}
                <li className={cn('flex gap-3 p-4 sm:p-5', cardSurface)}>
                    <span className={trustIconTileClass}>
                        <Receipt className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex gap-4">
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <p className="text-[0.8125rem] font-bold text-[#1b1b1d]">{upgradeCopy.billingTrustLine3}</p>
                            <p className="text-xs leading-relaxed text-[#45474c]">{upgradeCopy.billingTrustLine3Detail}</p>
                            <Link
                                href="/pricing"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-auto inline-flex w-full items-center gap-1.5 rounded-[2px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#1b1b1d] shadow-sm hover:bg-[#f9f9fb]"
                            >
                                <Rows3 className="h-3.5 w-3.5 opacity-70" aria-hidden />
                                {upgradeCopy.ctaComparePlans}
                                <ExternalLink className="ml-auto h-3 w-3 opacity-60" aria-hidden />
                            </Link>
                        </div>
                        <div className="w-px self-stretch bg-[#e5e7eb] shrink-0" aria-hidden />
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <div className="text-xs leading-relaxed text-[#45474c]">
                                <BillingRefundPolicyNote />
                            </div>
                            <Link
                                href="/resources/faq"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-auto inline-flex w-full items-center gap-1.5 rounded-[2px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#1b1b1d] shadow-sm hover:bg-[#f9f9fb]"
                            >
                                <HelpCircle className="h-3.5 w-3.5 opacity-70" aria-hidden />
                                FAQs
                                <ExternalLink className="ml-auto h-3 w-3 opacity-60" aria-hidden />
                            </Link>
                        </div>
                    </div>
                </li>
            </ul>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-4">
                <div className="flex min-w-0 items-start gap-3.5 sm:w-1/4 sm:shrink-0 rounded-[2px] border-2 border-primary/30 bg-primary/5 px-4 py-4 sm:px-5 shadow-md">
                    <span className={trustIconTileClass}>
                        <CreditCard className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-[0.8125rem] font-bold text-[#1b1b1d]">
                            {upgradeCopy.billingCardWorkspaceHeading}
                        </h2>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">
                            Firm Group
                        </p>
                        {loadError ? (
                            <p className="mt-1 text-sm text-red-600">{loadError}</p>
                        ) : !firms.length ? (
                            <p className="mt-1 text-sm text-slate-600">
                                No workspaces found. Open the app from a firm first.
                            </p>
                        ) : selectedFirm ? (
                            <p className="mt-0.5 text-[0.8125rem] font-bold text-[#1b1b1d]">
                                {selectedFirm.groupName ?? selectedFirm.name}
                            </p>
                        ) : null}
                    </div>
                </div>
                {selectedFirm ? (
                    <div className="flex-1 min-w-0">
                        <CurrentPlanSummary
                            firmId={selectedFirm.id}
                            portalReturnPath={portalReturnPath}
                            currentPlanState={currentPlanState}
                            loading={!currentPlanFetchCompleted || currentPlanLoading}
                            variant="embedded"
                        />
                    </div>
                ) : null}
            </div>

            <section className={cn('overflow-hidden', cardSurface)}>
                <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
                    {selectedFirm ? (
                        <PolarPlansPicker
                            firmId={selectedFirm.id}
                            returnPath={returnPath}
                            portalReturnPath={portalReturnPath}
                            density="default"
                            currentPlanState={currentPlanState}
                            fallbackCanManageBilling={firmManageChecked && firmManageOk}
                            blueAccentTrial={false}
                            hideStandaloneFreePlan
                            enableBillingTour
                        />
                    ) : null}
                </div>
            </section>
            {paidPlanIntent && !isOnboardingSubscribe && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleSkipUpgrade}
                        disabled={skipSubmitting}
                        className="inline-flex h-8 items-center rounded-[2px] border border-[#e5e7eb] bg-white px-3 text-xs font-medium text-[#45474c] transition hover:bg-[#f9f9fb] hover:text-[#1b1b1d] disabled:opacity-60"
                    >
                        {skipSubmitting ? 'Saving…' : 'Skip for now'}
                    </button>
                </div>
            )}
        </div>
    )
}
