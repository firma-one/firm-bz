'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import Logo from '@/components/Logo'
import { BillingPolarExplainInline } from '@/components/billing/billing-polar-inline'
import { buttonVariants } from '@/components/ui/button'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { cn } from '@/lib/utils'
import { clearCheckoutIntent, readCheckoutIntent } from '@/lib/marketing/checkout-intent'
import { supabase } from '@/lib/supabase'
import { failureFrom, failureReason } from '@/lib/files/action-failure'

const REDIRECT_SECONDS = 5
/** How often, and for how long, the page asks whether the plan is active before saying it isn't yet. */
const ACTIVATION_POLL_MS = 3000
const ACTIVATION_WAIT_MS = 60_000

/**
 * Where this checkout stands. `checking` until our own plan row shows it (Polar can take the money
 * before its webhook lands, or the webhook can match no group); `unknown` when there is no checkout id
 * to ask about.
 */
export type ActivationState = 'checking' | 'awaiting_payment' | 'active' | 'stalled' | 'not_paid' | 'unknown'

type StatusAnswer = { state?: 'active' | 'activating' | 'awaiting_payment' | 'not_paid'; error?: string }

/** Ask `/api/billing/checkout-status` until the plan is active, Polar says it wasn't paid, or time runs out. */
export function useCheckoutActivation(checkoutId: string | undefined): {
    state: ActivationState
    /** True when the page's "it isn't active yet" report reached us (so "have been alerted" is true). */
    reported: boolean
} {
    const [state, setState] = useState<ActivationState>(checkoutId ? 'checking' : 'unknown')
    const [reported, setReported] = useState(false)
    const startedAt = useRef<number>(0)

    useEffect(() => {
        if (!checkoutId) {
            setState('unknown')
            return
        }
        let cancelled = false
        let timer: number | null = null
        startedAt.current = Date.now()
        setState('checking')

        const ask = async (final: boolean): Promise<StatusAnswer | null> => {
            try {
                const res = await fetch(
                    `/api/billing/checkout-status?checkoutId=${encodeURIComponent(checkoutId)}${final ? '&final=1' : ''}`,
                    { cache: 'no-store', credentials: 'same-origin' }
                )
                if (!res.ok) return null
                return (await res.json().catch(() => null)) as StatusAnswer | null
            } catch {
                return null
            }
        }

        const tick = async () => {
            const timedOut = Date.now() - startedAt.current >= ACTIVATION_WAIT_MS
            const answer = await ask(timedOut)
            if (cancelled) return
            if (answer?.state === 'active') return setState('active')
            if (answer?.state === 'not_paid') return setState('not_paid')
            if (timedOut) {
                setReported(answer?.state === 'activating')
                return setState(answer?.state === 'awaiting_payment' ? 'awaiting_payment' : 'stalled')
            }
            if (answer?.state === 'awaiting_payment') setState('awaiting_payment')
            timer = window.setTimeout(() => void tick(), ACTIVATION_POLL_MS)
        }
        void tick()
        return () => {
            cancelled = true
            if (timer != null) window.clearTimeout(timer)
        }
    }, [checkoutId])

    return { state, reported }
}

export type SuccessRedirectMode = 'default' | 'onboardingAfterCheckout'

type Props = {
    checkoutId?: string
    mode?: SuccessRedirectMode
    /** Default mode: post-checkout destination */
    primaryHref?: string
    primaryLabel?: string
    /** Onboarding checkout: continue the setup flow */
    continueOnboardingHref?: string
    /** Full billing page (bypasses onboarding redirect when flagged) */
    billingPlansHref?: string
}

function useResolvedCheckoutId(prop?: string): string | undefined {
    const searchParams = useSearchParams()
    const queryKey = searchParams.toString()
    return useMemo(() => {
        const fromProp = prop?.trim()
        if (fromProp) return fromProp
        return (
            searchParams.get('checkoutId')?.trim() ||
            searchParams.get('checkout_id')?.trim() ||
            searchParams.get('checkoutid')?.trim() ||
            undefined
        )
    }, [prop, queryKey, searchParams])
}

/** What the card says for each state. "You're all set" only once the plan is active. */
export function activationCopy(
    state: ActivationState,
    opts: { isOnboarding: boolean; checkoutId?: string; reported: boolean }
): { title: string; body: string; icon: string; waiting: boolean } {
    const ref = opts.checkoutId ? ` · reference ${opts.checkoutId}` : ''
    switch (state) {
        case 'checking':
            return { title: 'Payment received', body: 'Activating your plan…', icon: '✓', waiting: true }
        case 'awaiting_payment':
            return {
                title: 'Waiting for Polar',
                body: 'Polar, our payment provider, is still confirming your payment. This page updates when it does.',
                icon: '…',
                waiting: true,
            }
        case 'active':
            return {
                title: "You're all set",
                body: `Thanks for subscribing. ${opts.isOnboarding ? 'Continuing setup in a moment.' : 'Taking you back in a moment.'}`,
                icon: '✓',
                waiting: false,
            }
        case 'stalled':
            return {
                title: 'Payment received',
                body: opts.reported
                    ? `We couldn't activate your plan yet and have been alerted${ref}.`
                    : `We couldn't confirm your plan yet. Check Billing in a minute, or contact support${ref}.`,
                icon: '!',
                waiting: false,
            }
        case 'not_paid':
            return {
                title: "Checkout didn't finish",
                body: "Polar didn't take a payment, so you have not been charged. Pick a plan again from Billing.",
                icon: '!',
                waiting: false,
            }
        case 'unknown':
            return {
                title: 'Checkout finished',
                body: 'Billing shows your plan as soon as Polar confirms the payment.',
                icon: '✓',
                waiting: false,
            }
    }
}

export function SuccessRedirectCard({
    checkoutId,
    mode = 'default',
    primaryHref = '/d/billing',
    primaryLabel = 'Go to billing',
    continueOnboardingHref = '/d/onboarding?after_checkout=1',
    billingPlansHref = '/d/billing?from_checkout=1',
}: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const paidPlanFromUrl = searchParams.get('paid_plan') === 'true'
    const resolvedCheckoutId = useResolvedCheckoutId(checkoutId)
    const isOnboarding = mode === 'onboardingAfterCheckout'
    const ONBOARDING_REDIRECT_SECONDS = 10
    const [secondsLeft, setSecondsLeft] = useState(isOnboarding ? ONBOARDING_REDIRECT_SECONDS : REDIRECT_SECONDS)
    const [invoiceLoading, setInvoiceLoading] = useState(false)
    const [invoiceError, setInvoiceError] = useState<string | null>(null)
    /** The invoice link, in case the browser blocked opening it in a new tab after the wait. */
    const [invoiceLink, setInvoiceLink] = useState<string | null>(null)
    const [continueOnboardingPending, setContinueOnboardingPending] = useState(false)
    /** Saving onboarding progress failed after paying: say so, and let Continue go on regardless. */
    const [progressError, setProgressError] = useState<string | null>(null)
    const activation = useCheckoutActivation(resolvedCheckoutId)
    /** Only count down to the redirect once there is something true to say ("You're all set"). */
    const countdownRunning =
        (activation.state === 'active' || activation.state === 'unknown') && !invoiceLoading && !progressError

    /** Client-resolved: `firma.checkoutIntent` drives hiding the billing link until Continue clears it. */
    const [onboardingCtasResolved, setOnboardingCtasResolved] = useState(false)
    const [hasCheckoutIntent, setHasCheckoutIntent] = useState(false)

    useLayoutEffect(() => {
        if (!isOnboarding) return
        setHasCheckoutIntent(readCheckoutIntent() !== null)
        setOnboardingCtasResolved(true)
    }, [isOnboarding, paidPlanFromUrl])

    /** `/pricing` → Standard checkout: `paid_plan` on the URL and/or `firma.checkoutIntent` in localStorage. */
    const showContinuePricingFlow = paidPlanFromUrl || hasCheckoutIntent

    useEffect(() => {
        if (!isOnboarding) {
            clearCheckoutIntent()
        }
    }, [isOnboarding])

    const clearPricingIntentAndQuery = useCallback(() => {
        clearCheckoutIntent()
        const q = new URLSearchParams(searchParams.toString())
        if (!q.has('paid_plan')) return
        q.delete('paid_plan')
        const tail = q.toString()
        router.replace(tail ? `${pathname}?${tail}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    useEffect(() => {
        if (!countdownRunning) return
        const intervalId = window.setInterval(() => {
            setSecondsLeft((prev) => Math.max(0, prev - 1))
        }, 1000)
        return () => window.clearInterval(intervalId)
    }, [countdownRunning])

    useEffect(() => {
        if (secondsLeft !== 0 || !countdownRunning) return
        if (isOnboarding) {
            clearCheckoutIntent()
            router.push(continueOnboardingHref)
        } else {
            router.push(primaryHref)
        }
    }, [secondsLeft, countdownRunning, isOnboarding, primaryHref, continueOnboardingHref, router])

    const progressPercent = useMemo(() => {
        const redirectSeconds = isOnboarding ? ONBOARDING_REDIRECT_SECONDS : REDIRECT_SECONDS
        const elapsed = redirectSeconds - secondsLeft
        return Math.min(100, Math.max(0, (elapsed / redirectSeconds) * 100))
    }, [secondsLeft, isOnboarding])

    const persistOnboardingThenContinue = useCallback(async () => {
        // A second press after a failed save goes on regardless: the payment is what matters.
        if (progressError) {
            router.push(continueOnboardingHref)
            return
        }
        setContinueOnboardingPending(true)
        let failed: string | null = null
        try {
            await supabase.auth.getUser()
            const {
                data: { session },
            } = await supabase.auth.getSession()
            const token = session?.access_token
            if (token) {
                const res = await fetch('/api/onboarding/ui-progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ action: 'continue_to_connect' }),
                })
                if (!res.ok) failed = failureReason(await failureFrom(res))
            }
        } catch (e) {
            failed = failureReason(e)
        } finally {
            setContinueOnboardingPending(false)
        }
        if (failed) {
            setProgressError(`Your payment went through. We couldn't move you on · ${failed}`)
            return
        }
        router.push(continueOnboardingHref)
    }, [continueOnboardingHref, router, progressError])

    const downloadInvoice = useCallback(async () => {
        const id = resolvedCheckoutId
        if (!id) return
        setInvoiceError(null)
        setInvoiceLink(null)
        setInvoiceLoading(true)
        try {
            const res = await fetch('/api/billing/checkout-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutId: id }),
                credentials: 'same-origin',
            })
            const data = (await res.json().catch(() => ({}))) as { error?: string; invoiceUrl?: string }
            if (!res.ok) {
                setInvoiceError(data.error || `Couldn't get the invoice (${res.status}). Find it in Billing in a minute.`)
                return
            }
            // Still generating answers 202 with the words in `error` and no link.
            if (!data.invoiceUrl) {
                setInvoiceError(data.error || 'Your invoice is still being generated. Find it in Billing in a minute.')
                return
            }
            // Opened after a wait, the new tab may be blocked (and with noopener `open` can't tell us):
            // keep a link to press as well.
            window.open(data.invoiceUrl, '_blank', 'noopener,noreferrer')
            setInvoiceLink(data.invoiceUrl)
        } catch (e) {
            setInvoiceError(failureReason(e))
        } finally {
            setInvoiceLoading(false)
        }
    }, [resolvedCheckoutId])

    const hasCheckoutId = Boolean(resolvedCheckoutId)
    const copy = activationCopy(activation.state, {
        isOnboarding,
        checkoutId: resolvedCheckoutId,
        reported: activation.reported,
    })
    const invoiceButtonClass = cn(
        buttonVariants({ variant: 'outline' }),
        'inline-flex h-10 min-w-[12rem] shrink-0 items-center justify-center gap-2 rounded-lg border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 sm:h-11'
    )
    const ctaRowClass =
        'relative z-10 mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center'

    const downloadInvoiceButton = hasCheckoutId ? (
        <button
            type="button"
            onClick={() => void downloadInvoice()}
            disabled={invoiceLoading}
            className={invoiceButtonClass}
        >
            {invoiceLoading ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Preparing invoice…
                </>
            ) : (
                'Download invoice (PDF)'
            )}
        </button>
    ) : null

    return (
        <div className="relative min-h-[70vh] px-4 py-10 sm:py-16">
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                <div className="absolute -left-16 top-8 h-64 w-64 rounded-full bg-slate-200/35 blur-3xl" />
                <div className="absolute -right-14 top-28 h-56 w-56 rounded-full bg-slate-300/25 blur-3xl" />
            </div>

            <div className="mx-auto w-full max-w-xl">
                <div className="mb-8 flex flex-col items-center gap-1">
                    <Link
                        href="/"
                        className="group shrink-0 rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-slate-400/40"
                    >
                        <Logo size="md" showText wordmarkClassName="text-xl leading-none sm:text-2xl" />
                    </Link>
                    <p className="text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">
                        Checkout complete
                    </p>
                </div>

                <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-7 text-center shadow-[0_2px_8px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-50/90 via-slate-50/35 to-transparent" />
                    <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-slate-200/70">
                        <div
                            className="h-1 rounded-t-2xl bg-slate-600 transition-[width] duration-1000 ease-linear"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    <div className="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200/80 bg-gradient-to-br from-slate-100 to-slate-50 text-slate-900">
                        {copy.waiting ? (
                            <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden />
                        ) : (
                            <span className="text-2xl" aria-hidden>
                                {copy.icon}
                            </span>
                        )}
                    </div>

                    <div role="status" aria-live="polite">
                        <h1 className="relative z-10 text-2xl font-semibold tracking-tight text-slate-900">{copy.title}</h1>
                        <p className="relative z-10 mt-2 text-sm leading-relaxed text-slate-600">{copy.body}</p>
                    </div>
                    {countdownRunning ? (
                        <p className="relative z-10 mt-3 text-sm font-medium text-slate-700">
                            Redirecting in <span className="tabular-nums">{secondsLeft}s</span>
                        </p>
                    ) : null}
                    {progressError ? (
                        <p role="alert" className="relative z-10 mx-auto mt-3 max-w-md text-sm text-amber-900">
                            {progressError}
                        </p>
                    ) : null}

                    <div className="relative z-10 mx-auto mt-5 max-w-md border-t border-slate-100 pt-5 text-left">
                        <p className="text-xs leading-relaxed text-slate-600">
                            {upgradeCopy.checkoutSuccessPolarFootnotePrefix}{' '}
                            <BillingPolarExplainInline className="mx-px inline-flex align-middle" />
                            {upgradeCopy.checkoutSuccessPolarFootnoteSuffix}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            {upgradeCopy.checkoutSuccessReceiptLine}
                        </p>
                    </div>

                    {resolvedCheckoutId ? (
                        <p className="relative z-10 mt-4 break-all font-mono text-xs text-slate-500">
                            Checkout ID: {resolvedCheckoutId}
                        </p>
                    ) : null}

                    <div className={ctaRowClass}>
                        {isOnboarding ? (
                            <>
                                {downloadInvoiceButton}
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearPricingIntentAndQuery()
                                        void persistOnboardingThenContinue()
                                    }}
                                    disabled={continueOnboardingPending}
                                    className={cn(
                                        buttonVariants({ variant: 'blackCta' }),
                                        'inline-flex h-11 min-w-[10rem] shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:opacity-60 sm:min-w-[12rem]'
                                    )}
                                >
                                    {continueOnboardingPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    ) : null}
                                    Continue onboarding
                                </button>
                            </>
                        ) : hasCheckoutId ? (
                            <>
                                {downloadInvoiceButton}
                                <Link
                                    href={primaryHref}
                                    className={cn(
                                        buttonVariants({ variant: 'blackCta' }),
                                        'inline-flex h-11 min-w-[10rem] shrink-0 items-center justify-center rounded-lg px-5 text-sm font-semibold sm:min-w-[14rem]'
                                    )}
                                >
                                    Return to Billing &amp; Plans
                                </Link>
                                {primaryHref !== '/d' ? (
                                    <Link
                                        href="/d"
                                        className={cn(
                                            buttonVariants({ variant: 'blackCta' }),
                                            'inline-flex h-11 min-w-[10rem] shrink-0 items-center justify-center rounded-lg px-5 text-sm font-semibold'
                                        )}
                                    >
                                        All workspaces
                                    </Link>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <Link
                                    href={primaryHref}
                                    className={cn(
                                        buttonVariants({ variant: 'blackCta' }),
                                        'inline-flex h-11 min-w-[10rem] items-center justify-center rounded-lg px-5 text-sm font-semibold'
                                    )}
                                >
                                    {primaryLabel}
                                </Link>
                                {primaryHref !== '/d' ? (
                                    <Link
                                        href="/d"
                                        className={cn(
                                            buttonVariants({ variant: 'blackCta' }),
                                            'inline-flex h-11 min-w-[10rem] items-center justify-center rounded-lg px-5 text-sm font-semibold'
                                        )}
                                    >
                                        All workspaces
                                    </Link>
                                ) : null}
                            </>
                        )}
                    </div>
                    {invoiceError ? (
                        <p role="alert" className="relative z-10 mt-3 max-w-md text-center text-xs text-amber-900 sm:mx-auto">
                            {invoiceError}
                        </p>
                    ) : null}
                    {invoiceLink ? (
                        <p className="relative z-10 mt-3 max-w-md text-center text-xs text-slate-600 sm:mx-auto">
                            If the invoice didn&apos;t open,{' '}
                            <a href={invoiceLink} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                                open it here
                            </a>
                            .
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
