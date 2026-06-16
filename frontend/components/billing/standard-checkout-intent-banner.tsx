'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, X } from 'lucide-react'
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
    const [isFirmAdmin, setIsFirmAdmin] = useState<boolean | null>(null)
    const [intent, setIntent] = useState<CheckoutIntent | null>(null)
    const [upgradeNudge, setUpgradeNudge] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [hintSuppressed, setHintSuppressed] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        setHintSuppressed(readCheckoutHintDismissedSession())
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
            .then((payload: { shouldShow?: boolean; hasPaid?: boolean; isFirmAdmin?: boolean }) => {
                if (cancelled) return
                if (payload.hasPaid) {
                    clearCheckoutIntent()
                    setIntent(null)
                }
                setIsFirmAdmin(payload.isFirmAdmin === true)
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
            validateCheckoutReturnTo(pathname) ?? (slug ? `/d/f/${slug}` : '/d/u/profile')
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
    }, [])

    const showHintLogic =
        gate === 'show' &&
        isFirmAdmin === true &&
        (isStandardPaidCheckoutIntent(intent) || upgradeNudge) &&
        !HIDE_ONBOARDING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

    const visible =
        Boolean(showHintLogic && checkoutHref && defaultFirm && (intent != null || upgradeNudge)) &&
        !hintSuppressed

    if (!mounted || !visible || !checkoutHref || !defaultFirm) return null

    const standardPaidIntent = isStandardPaidCheckoutIntent(intent)
    const bodyCopy = standardPaidIntent
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
                    <Link
                        href={checkoutHref}
                        onClick={onContinueToBillingClick}
                        className={cn(
                            buttonVariants({ variant: 'blackCta', size: 'sm' }),
                            'h-9 shrink-0 justify-center px-4 text-[10px] font-semibold uppercase tracking-widest'
                        )}
                    >
                        Upgrade
                    </Link>
                    <button
                        type="button"
                        onClick={dismissHintForSession}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                        aria-label="Hide until you sign out"
                        title="Hide until you sign out"
                    >
                        <X className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                </>
            }
        />
    )
}
