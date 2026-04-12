'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { firmAdminMustCompleteOnboarding } from '@/lib/actions/firms'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

/** Full-viewport overlay for onboarding exit guard (checkout hint is in-pane via `AppShellHintStrip`). */
const OVERLAY_Z = 100

function isOnboardingPath(path: string): boolean {
    return path === '/d/onboarding' || path.startsWith('/d/onboarding/')
}

function navigatesAwayFromOnboarding(targetPathname: string, currentPathname: string): boolean {
    if (!isOnboardingPath(currentPathname)) return false
    return !isOnboardingPath(targetPathname)
}

/**
 * While mandatory onboarding is incomplete, blocks in-app navigations away from `/d/onboarding`
 * (captured link clicks). Shows a dismissible bottom banner styled like the Standard checkout nudge.
 */
export function OnboardingExitGuardBanner() {
    const pathname = usePathname() ?? ''
    const [mounted, setMounted] = useState(false)
    const [mustComplete, setMustComplete] = useState<boolean | null>(null)
    const [blockedUi, setBlockedUi] = useState(false)
    const mustCompleteRef = useRef(false)

    useEffect(() => {
        mustCompleteRef.current = mustComplete === true
    }, [mustComplete])

    const refreshMustComplete = useCallback(async () => {
        if (!isOnboardingPath(pathname)) return
        try {
            setMustComplete(await firmAdminMustCompleteOnboarding())
        } catch {
            setMustComplete(false)
        }
    }, [pathname])

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!isOnboardingPath(pathname)) {
            setMustComplete(null)
            setBlockedUi(false)
            return
        }
        void refreshMustComplete()
    }, [pathname, refreshMustComplete])

    useEffect(() => {
        if (!isOnboardingPath(pathname)) return
        const onVis = () => {
            if (document.visibilityState === 'visible') void refreshMustComplete()
        }
        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('focus', refreshMustComplete)
        return () => {
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('focus', refreshMustComplete)
        }
    }, [pathname, refreshMustComplete])

    useEffect(() => {
        if (!isOnboardingPath(pathname) || mustComplete !== true) return

        const onClickCapture = (e: MouseEvent) => {
            if (!mustCompleteRef.current) return
            if (e.defaultPrevented) return
            const el = e.target as Element | null
            if (!el) return
            const a = el.closest('a')
            if (!a?.getAttribute('href')) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            if (a.getAttribute('target') === '_blank') return

            let url: URL
            try {
                url = new URL((a as HTMLAnchorElement).href, window.location.origin)
            } catch {
                return
            }
            if (url.origin !== window.location.origin) return
            if (!navigatesAwayFromOnboarding(url.pathname, pathname)) return

            e.preventDefault()
            e.stopPropagation()
            setBlockedUi(true)
        }

        document.addEventListener('click', onClickCapture, true)
        return () => document.removeEventListener('click', onClickCapture, true)
    }, [pathname, mustComplete])

    useEffect(() => {
        if (!blockedUi) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [blockedUi])

    const dismiss = useCallback(() => setBlockedUi(false), [])

    if (!mounted || !blockedUi || !isOnboardingPath(pathname)) return null

    return createPortal(
        <>
            <div
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
                style={{ zIndex: OVERLAY_Z }}
                aria-hidden
            />
            <div
                className={cn(
                    'fixed left-0 right-0 border-t-2 border-[#006e16] bg-white shadow-[0_-12px_40px_-8px_rgba(15,23,42,0.25)]',
                    'pb-[max(1rem,env(safe-area-inset-bottom))] pt-4'
                )}
                style={{ zIndex: OVERLAY_Z + 1, bottom: 0 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-exit-guard-title"
            >
                <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <div className="min-w-0 pr-10 sm:pr-4">
                        <p
                            id="onboarding-exit-guard-title"
                            className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
                        >
                            Finish required setup first
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600 sm:text-base">
                            Complete the mandatory onboarding steps before opening the rest of the app. You can keep
                            working here—this message appears whenever you try to leave this page early.
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-stretch md:flex-row md:items-center">
                        <button
                            type="button"
                            onClick={dismiss}
                            className={cn(
                                buttonVariants({ variant: 'blackCta', size: 'default' }),
                                'h-11 min-w-[10rem] justify-center px-6 text-sm font-semibold shadow-md'
                            )}
                        >
                            Continue onboarding
                        </button>
                        <button
                            type="button"
                            onClick={dismiss}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                            aria-label="Dismiss"
                        >
                            <X className="h-5 w-5" strokeWidth={2.25} />
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}
