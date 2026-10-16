'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Lock, X } from 'lucide-react'
import { firmAdminMustCompleteOnboarding } from '@/lib/actions/firms'
import { Button } from '@/components/ui/button'

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
 * (captured link clicks). Shows a dismissible notice over the scrim: a calm New UI card with a
 * yellow lock chip, the reason, and one primary action.
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
                className="fixed inset-0 bg-scrim"
                style={{ zIndex: OVERLAY_Z }}
                aria-hidden
            />
            <div
                className="fixed inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
                style={{ zIndex: OVERLAY_Z + 1 }}
            >
                <div
                    className="flex w-full max-w-xl items-start gap-3 rounded-dialog border border-line bg-surface p-4 shadow-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="onboarding-exit-guard-title"
                >
                    <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-tag-yellow-bg text-tag-yellow-fg"
                    >
                        <Lock className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p id="onboarding-exit-guard-title" className="text-ui font-medium text-fg">
                            Finish required setup first
                        </p>
                        <p className="mt-0.5 text-small text-fg-muted">
                            Complete the required onboarding steps before opening the rest of the app. You can keep
                            working here—this message appears whenever you try to leave this page early.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <Button type="button" variant="greenCta" onClick={dismiss}>
                                Continue onboarding
                            </Button>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={dismiss}
                        className="-mr-1 -mt-1 h-7 w-7 shrink-0"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                </div>
            </div>
        </>,
        document.body
    )
}
