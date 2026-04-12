'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, X } from 'lucide-react'
import { EVENTS, Joyride, STATUS, type EventData } from 'react-joyride'
import { firmAdminMustCompleteOnboarding } from '@/lib/actions/firms'
import { buildBillingPageHref } from '@/lib/billing/build-billing-page-href'
import { buildPolarCheckoutHref } from '@/lib/billing/polar-checkout-href'
import { resolveStandardProductId } from '@/lib/billing/standard-product-id'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import {
    clearCheckoutIntent,
    readCheckoutIntent,
    isStandardPaidCheckoutIntent,
    type CheckoutIntent,
} from '@/lib/marketing/checkout-intent'
import {
    readCheckoutHintDismissedSession,
    setCheckoutHintDismissedSession,
    readCheckoutProfileJoyrideDoneSession,
    setCheckoutProfileJoyrideDoneSession,
} from '@/lib/marketing/checkout-hint-session'
import { useSidebarFirms } from '@/lib/sidebar-firms-context'
import { AppShellHintStrip } from '@/components/layout/app-shell-hint-strip'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const HIDE_ONBOARDING_PATHS = ['/d/onboarding']

/**
 * Checkout / upgrade hint for the app shell middle pane.
 * Must render inside `<main>` (last child) — see `d-layout-client.tsx`.
 */
export function StandardCheckoutIntentBanner() {
    const pathname = usePathname() ?? ''
    const firms = useSidebarFirms()
    const [gate, setGate] = useState<'unknown' | 'show' | 'hide'>('unknown')
    const [intent, setIntent] = useState<CheckoutIntent | null>(null)
    const [upgradeNudge, setUpgradeNudge] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [hintSuppressed, setHintSuppressed] = useState(false)
    const [profileJoyrideDone, setProfileJoyrideDone] = useState(false)
    const [joyrideRun, setJoyrideRun] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        setHintSuppressed(readCheckoutHintDismissedSession())
        setProfileJoyrideDone(readCheckoutProfileJoyrideDoneSession())
    }, [pathname])

    useEffect(() => {
        let cancelled = false
        firmAdminMustCompleteOnboarding()
            .then((mustOnboard) => {
                if (cancelled) return
                setGate(mustOnboard ? 'hide' : 'show')
            })
            .catch(() => {
                if (cancelled) return
                setGate('hide')
            })
        return () => {
            cancelled = true
        }
    }, [pathname])

    useEffect(() => {
        setIntent(readCheckoutIntent())
    }, [pathname])

    useEffect(() => {
        let cancelled = false
        fetch('/api/billing/upgrade-nudge-status')
            .then((res) => (res.ok ? res.json() : { shouldShow: false }))
            .then((payload: { shouldShow?: boolean }) => {
                if (cancelled) return
                setUpgradeNudge(payload.shouldShow === true)
            })
            .catch(() => {
                if (cancelled) return
                setUpgradeNudge(false)
            })
        return () => {
            cancelled = true
        }
    }, [pathname])

    const defaultFirm = useMemo(() => {
        if (!firms?.length) return null
        return firms.find((f) => f.isDefault) ?? firms[0] ?? null
    }, [firms])

    const checkoutHref = useMemo(() => {
        if (!defaultFirm) return null
        const slug = defaultFirm.slug
        const returnTo =
            validateCheckoutReturnTo(pathname) ?? (slug ? `/d/f/${slug}` : '/d/profile')
        const productId = resolveStandardProductId(intent?.interval ?? 'annual')
        if (!productId) {
            return buildBillingPageHref({ firmSlug: slug, pathname })
        }
        return buildPolarCheckoutHref({
            firmId: defaultFirm.id,
            returnTo,
            productId,
        })
    }, [defaultFirm, intent?.interval, pathname])

    const continueTargetIsInAppBilling =
        typeof checkoutHref === 'string' && checkoutHref.startsWith('/d/billing')

    const onContinueToBillingClick = useCallback(() => {
        if (!continueTargetIsInAppBilling) return
        clearCheckoutIntent()
        setIntent(null)
        setUpgradeNudge(false)
    }, [continueTargetIsInAppBilling])

    const dismissHintForSession = useCallback(() => {
        setCheckoutHintDismissedSession()
        setHintSuppressed(true)
        setJoyrideRun(false)
    }, [])

    const onProfileJoyrideEvent = useCallback((data: EventData) => {
        const { status, type } = data
        if (type === EVENTS.TARGET_NOT_FOUND) {
            setJoyrideRun(false)
            return
        }
        if (
            type === EVENTS.TOUR_END ||
            status === STATUS.FINISHED ||
            status === STATUS.SKIPPED
        ) {
            setCheckoutProfileJoyrideDoneSession()
            setProfileJoyrideDone(true)
            setJoyrideRun(false)
        }
    }, [])

    const profileJoyrideSteps = useMemo(
        () => [
            {
                target: '[data-checkout-hint-profile="trigger"]',
                title: upgradeCopy.checkoutHintJoyrideTitle,
                content: (
                    <p className="text-sm leading-relaxed text-slate-600">{upgradeCopy.checkoutHintJoyrideBody}</p>
                ),
                disableBeacon: true,
                placement: 'right' as const,
            },
        ],
        []
    )

    const showHintLogic =
        gate === 'show' &&
        (isStandardPaidCheckoutIntent(intent) || upgradeNudge) &&
        !HIDE_ONBOARDING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

    const visible =
        Boolean(showHintLogic && checkoutHref && defaultFirm && (intent != null || upgradeNudge)) &&
        !hintSuppressed

    const startProfileJoyride = useCallback(() => {
        if (profileJoyrideDone) return
        const el = document.querySelector('[data-checkout-hint-profile="trigger"]')
        if (!el) return
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        window.setTimeout(() => setJoyrideRun(true), 120)
    }, [profileJoyrideDone])

    if (!mounted || !visible || !checkoutHref || !defaultFirm) return null

    const standardPaidIntent = isStandardPaidCheckoutIntent(intent)
    const bodyCopy =
        standardPaidIntent && !profileJoyrideDone
            ? `${upgradeCopy.checkoutHintStripBodyIntent} ${upgradeCopy.checkoutHintStripBodyIntentShowMeSuffix}`
            : standardPaidIntent
              ? upgradeCopy.checkoutHintStripBodyIntent
              : upgradeCopy.checkoutHintStripBodyUpgrade

    const nativeTitleFull = `${upgradeCopy.checkoutHintStripTitle} — ${bodyCopy}`

    const billingIconTile = (
        <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
            aria-hidden
        >
            <CreditCard className="h-4 w-4 text-slate-600" strokeWidth={2} />
        </div>
    )

    return (
        <>
            <Joyride
                run={joyrideRun}
                steps={profileJoyrideSteps}
                continuous={false}
                scrollToFirstStep
                onEvent={onProfileJoyrideEvent}
                locale={{
                    last: upgradeCopy.checkoutHintJoyrideDone,
                    next: 'Next',
                }}
                options={{
                    primaryColor: '#0f172a',
                    textColor: '#0f172a',
                    backgroundColor: '#ffffff',
                    arrowColor: '#ffffff',
                    overlayColor: 'rgba(15, 23, 42, 0.45)',
                    spotlightPadding: 10,
                    spotlightRadius: 12,
                    zIndex: 10050,
                    skipBeacon: true,
                    showProgress: false,
                    buttons: ['close', 'primary'],
                    scrollDuration: 400,
                    scrollOffset: 80,
                }}
            />
            <AppShellHintStrip
                density="profileRail"
                accent="emerald"
                aria-label="Checkout reminder"
                nativeTitle={nativeTitleFull}
                leading={billingIconTile}
                innerClassName="px-7 sm:px-10 md:px-12"
                title={upgradeCopy.checkoutHintStripTitle}
                description={bodyCopy}
                actions={
                    <>
                        {!profileJoyrideDone ? (
                            <button
                                type="button"
                                onClick={startProfileJoyride}
                                className={cn(
                                    buttonVariants({ variant: 'outline', size: 'sm' }),
                                    'h-9 shrink-0 border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50'
                                )}
                            >
                                {upgradeCopy.checkoutHintShowMe}
                            </button>
                        ) : null}
                        <Link
                            href={checkoutHref}
                            onClick={onContinueToBillingClick}
                            className={cn(
                                buttonVariants({ variant: 'blackCta', size: 'sm' }),
                                'h-9 shrink-0 justify-center px-3 text-xs font-semibold'
                            )}
                        >
                            {upgradeCopy.planPickerCta}
                        </Link>
                        <button
                            type="button"
                            onClick={dismissHintForSession}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                            aria-label="Hide until you sign out"
                            title="Hide until you sign out"
                        >
                            <X className="h-4 w-4" strokeWidth={2.25} />
                        </button>
                    </>
                }
            />
        </>
    )
}
