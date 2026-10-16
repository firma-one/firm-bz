'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ExternalLink, HelpCircle, Info, Lock, Receipt, Rows3 } from 'lucide-react'
import { getUserFirms } from '@/lib/actions/firms'
import { firmPath } from '@/lib/navigation/firm-paths'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { BillingPolarExplainInline, BillingRefundPolicyNote, PolarBillingLogo } from '@/components/billing/billing-polar-inline'
import { CurrentPlanSummary } from '@/components/billing/current-plan-summary'
import { PolarPlansPicker, type BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { fetchBillingCurrentPlan } from '@/lib/billing/fetch-billing-current-plan'
import { shouldShowSandboxUpgradeMarketing } from '@/lib/billing/subscription-display'
import { PageHeading } from '@/components/ui/page-heading'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'

/*
 * Billing (.claude/plans/ui-ux-overhaul.md, Phase 6): a page heading, then three sections in the
 * order a billing admin reads them — what you're on (Current plan), what you could be on (Plans),
 * and how paying works (Payments). Sections are a heading plus content; only the current plan and
 * the plan cards are boxed, one level deep.
 */

/** Section title, matching the firm settings forms. */
const SECTION_HEADING_CLASS = 'text-h3 text-fg'

/** A quiet one-line notice (skip confirmation, free-plan reminder). */
const NOTICE_CLASS =
    'flex items-start gap-2 rounded-card border border-line bg-surface-subtle px-3 py-2 text-small text-fg-muted'

/** An external link styled as a small outline button. */
const OUTLINE_LINK_CLASS = buttonVariants({ variant: 'outline', size: 'sm' })

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
            (selectedFirm?.groupSlug ? firmPath(selectedFirm.groupSlug, selectedFirm.slug) : '/d')
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
            <div className="flex min-h-[40vh] items-center justify-center gap-2 text-small text-fg-muted">
                <LoadingSpinner size="sm" />
                <span>Loading billing…</span>
            </div>
        )
    }

    if (firms.length > 0 && selectedFirm?.id && firmManageChecked && !firmManageOk) {
        if (!isOnboardingSubscribe) {
            return null
        }
        return (
            <div className="relative mx-auto max-w-5xl pb-10">
                <EmptyPanel
                    className="rounded-card border border-line"
                    icon={<Lock strokeWidth={1.75} />}
                    title="Billing isn't available for your role on this workspace"
                    description="Ask an owner to assign billing access, or continue onboarding to connect Google Drive."
                    action={
                        onSkipToConnectDrive ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void onSkipToConnectDrive()}>
                                Skip to Google Drive
                            </Button>
                        ) : null
                    }
                />
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

    const comparePlansLink = (
        <Link href="/pricing" target="_blank" rel="noopener noreferrer" className={OUTLINE_LINK_CLASS}>
            <Rows3 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {upgradeCopy.ctaComparePlans}
            <ExternalLink className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} aria-hidden />
        </Link>
    )

    return (
        <div className="relative mx-auto w-full max-w-4xl space-y-10 pb-10" data-demo-tour="billing-page">

            <div className="space-y-3">
                <PageHeading
                    className="pb-0"
                    title={isOnboardingSubscribe ? upgradeCopy.billingPageTitle : 'Billing'}
                    description={
                        showOnboardingSkipHint
                            ? "Compare plans below, or skip when you're ready to connect Google Drive. Billing stays available from settings later."
                            : undefined
                    }
                    actions={
                        isOnboardingSubscribe && onSkipToConnectDrive ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-onboarding-billing-skip-tour
                                onClick={() => void onSkipToConnectDrive()}
                                aria-label="Skip subscribing for now and continue to connect Google Drive"
                            >
                                {upgradeCopy.billingOnboardingSkipSubscribeCta}
                            </Button>
                        ) : null
                    }
                />
                {paidPlanIntent && (
                    <div className={cn(NOTICE_CLASS, 'items-center')}>
                        <Info className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden />
                        <span className="min-w-0 flex-1">
                            You currently have an active Free plan. You can upgrade now, or skip and continue.
                        </span>
                        {!isOnboardingSubscribe ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                onClick={handleSkipUpgrade}
                                disabled={skipSubmitting}
                            >
                                {skipSubmitting ? 'Saving…' : 'Skip for now'}
                            </Button>
                        ) : null}
                    </div>
                )}
                {skipMessage && (
                    <div className={NOTICE_CLASS} role="status">
                        {skipMessage}
                    </div>
                )}
            </div>

            {/* Current plan: one card — the billing entity is its first property row rather than a
                separate box beside it, so "who is billed" and "what they are on" read as one subject. */}
            <section aria-label="Current plan">
                {loadError ? (
                    <p className="text-small text-danger">{loadError}</p>
                ) : !firms.length ? (
                    <p className="text-small text-fg-muted">
                        No workspaces found. Open the app from a firm first.
                    </p>
                ) : selectedFirm ? (
                    <CurrentPlanSummary
                        firmId={selectedFirm.id}
                        portalReturnPath={portalReturnPath}
                        currentPlanState={currentPlanState}
                        loading={!currentPlanFetchCompleted || currentPlanLoading}
                        variant="embedded"
                        entity={{
                            kind: 'Firm group',
                            name: selectedFirm.groupName ?? selectedFirm.name,
                        }}
                    />
                ) : null}
            </section>

            {selectedFirm ? (
                <section aria-labelledby="billing-plans-heading" className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0 space-y-0.5">
                            <h2 id="billing-plans-heading" className={SECTION_HEADING_CLASS}>
                                Plans
                            </h2>
                            {showFreeTierUpgradeCopy ? (
                                <p className="max-w-2xl text-small text-fg-muted">
                                    {upgradeCopy.billingBody} {upgradeCopy.billingBodyLine2}
                                </p>
                            ) : null}
                        </div>
                        {comparePlansLink}
                    </div>
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
                </section>
            ) : null}

            {/* How paying works: quiet reference text under a hairline, not marketing cards. */}
            <section aria-labelledby="billing-payments-heading" className="space-y-4 border-t border-line pt-6">
                <h2 id="billing-payments-heading" className={SECTION_HEADING_CLASS}>
                    Payments
                </h2>
                <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                    <div className="flex gap-3">
                        <PolarBillingLogo className="mt-0.5 h-4 w-4 text-fg-muted" aria-hidden />
                        <div className="min-w-0 space-y-1.5">
                            <h3 className="text-ui font-medium text-fg">{upgradeCopy.billingTrustLine1}</h3>
                            <p className="text-small text-fg-muted">{upgradeCopy.billingTrustLine1Detail}</p>
                            <p className="text-small text-fg-muted">
                                {upgradeCopy.billingCheckoutIntro}{' '}
                                <BillingPolarExplainInline className="mx-px" />
                                {upgradeCopy.billingCheckoutOutro}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
                        <div className="min-w-0 space-y-1.5">
                            <h3 className="text-ui font-medium text-fg">{upgradeCopy.billingTrustLine3}</h3>
                            <p className="text-small text-fg-muted">{upgradeCopy.billingTrustLine3Detail}</p>
                            <BillingRefundPolicyNote />
                            <div className="pt-1.5">
                                <Link
                                    href="/resources/faq"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={OUTLINE_LINK_CLASS}
                                >
                                    <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                    FAQs
                                    <ExternalLink className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} aria-hidden />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
