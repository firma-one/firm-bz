'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, CreditCard, Loader2, Lock, Receipt } from 'lucide-react'
import { getUserFirms } from '@/lib/actions/firms'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { CurrentPlanSummary } from '@/components/billing/current-plan-summary'
import { PolarPlansPicker, type BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { fetchBillingCurrentPlan } from '@/lib/billing/fetch-billing-current-plan'
import { shouldShowSandboxUpgradeMarketing } from '@/lib/billing/subscription-display'
import { cn } from '@/lib/utils'

const trustItems = [
    {
        icon: Lock,
        title: upgradeCopy.billingTrustLine1,
        detail: upgradeCopy.billingTrustLine1Detail,
    },
    {
        icon: Building2,
        title: upgradeCopy.billingTrustLine2,
        detail: upgradeCopy.billingTrustLine2Detail,
    },
    {
        icon: Receipt,
        title: upgradeCopy.billingTrustLine3,
        detail: upgradeCopy.billingTrustLine3Detail,
    },
] as const

/** Profile / profile-billing card elevation */
const cardSurface = cn(
    'rounded-2xl border border-slate-200/90 bg-white',
    'shadow-[0_2px_8px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.12)]',
    'ring-1 ring-slate-900/[0.04]'
)

/** Trust row icon — matches /d dashboard cards (slate, neutral). */
const trustIconTileClass = cn(
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
    'border border-slate-200 bg-white text-slate-600 shadow-sm'
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
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
                            className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
        <div className="relative mx-auto max-w-5xl space-y-10 pb-10 px-4 sm:px-5 md:px-6">
            {!isOnboardingSubscribe ? (
                <Link
                    href={returnPath}
                    className="group inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition duration-300 group-hover:-translate-x-0.5 group-hover:border-slate-300">
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                    </span>
                    Back to workspace
                </Link>
            ) : null}

            <header className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 className="min-w-0 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                        {upgradeCopy.billingPageTitle}
                    </h1>
                    {isOnboardingSubscribe && onSkipToConnectDrive ? (
                        <button
                            type="button"
                            data-onboarding-billing-skip-tour
                            onClick={() => void onSkipToConnectDrive()}
                            className={cn(
                                'inline-flex shrink-0 items-center justify-center rounded-lg px-6 py-3 text-base font-semibold shadow-md transition',
                                'bg-slate-900 text-white hover:bg-slate-800',
                                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400'
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
                        <p className="text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
                            {upgradeCopy.billingHeadline}
                        </p>
                        <p className="text-sm font-medium text-slate-600">{upgradeCopy.billingTitle}</p>
                        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{upgradeCopy.billingBody}</p>
                    </>
                ) : null}
                {paidPlanIntent && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        You currently have an active Free plan. You can upgrade now, or skip and continue.
                    </div>
                )}
                {skipMessage && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {skipMessage}
                    </div>
                )}
            </header>

            <ul className="grid gap-4 sm:grid-cols-3">
                {trustItems.map(({ icon: Icon, title, detail }) => (
                    <li key={title} className={cn('flex gap-3 p-4 sm:p-5', cardSurface)}>
                        <span className={trustIconTileClass}>
                            <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{detail}</p>
                        </div>
                    </li>
                ))}
            </ul>

            <section className={cn('overflow-hidden', cardSurface)}>
                <div className="border-b border-slate-100 bg-slate-50/40 px-5 py-5 sm:px-7 sm:py-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 lg:gap-8">
                        <div className="flex min-w-0 flex-1 items-start gap-3.5">
                            <span className={trustIconTileClass}>
                                <CreditCard className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                                    {upgradeCopy.billingCardWorkspaceHeading}
                                </h2>
                                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                                    Workspace
                                </p>
                                {loadError ? (
                                    <p className="mt-1 text-sm text-red-600">{loadError}</p>
                                ) : !firms.length ? (
                                    <p className="mt-1 text-sm text-slate-600">
                                        No workspaces found. Open the app from a firm first.
                                    </p>
                                ) : selectedFirm ? (
                                    <p className="mt-0.5 text-sm text-slate-700">
                                        <span className="font-medium">{selectedFirm.name}</span>
                                        <span className="font-mono text-xs text-slate-400">
                                            {' '}
                                            /{selectedFirm.slug}
                                        </span>
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        {selectedFirm ? (
                            <div className="w-full shrink-0 sm:max-w-[min(100%,30rem)] lg:max-w-[34rem] sm:pt-0">
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
                </div>

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
                            enableCheckoutIntentJoyride={isOnboardingSubscribe}
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
                        className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                        {skipSubmitting ? 'Saving…' : 'Skip for now'}
                    </button>
                </div>
            )}
        </div>
    )
}
