'use client'

import { useEffect, useRef } from 'react'
import { useDemoTour, hasOptedOutOfTour } from '@/lib/demo/demo-tour-context'
import { DemoTour } from '@/components/demo/demo-tour'
import { DemoTourIntroModal } from '@/components/demo/demo-tour-intro-modal'
import { DemoTourOutroModal } from '@/components/demo/demo-tour-outro-modal'
import { DemoTourButton } from '@/components/demo/demo-tour-button'

/** Auto-opens the intro modal ~800ms after every visit to /tour (not just the first), and renders
 * the tour overlay, both modals and the floating restart button. Auto-opening is skipped only if
 * the visitor opted out with "Don't show this again" on Skip (see demo-tour-context.tsx). Mid-tour
 * progress is kept in localStorage, so the intro modal offers "Resume tour" whenever a visitor
 * comes back with unfinished progress saved. */
export function DemoTourShell() {
    const { openIntroModal } = useDemoTour()
    const hasTriggered = useRef(false)

    useEffect(() => {
        if (hasTriggered.current) return
        if (typeof window === 'undefined') return
        if (hasOptedOutOfTour()) return
        // Marked as triggered when the timer fires, not before: React's development double-run of
        // effects clears the first timer, and a guard set up front would stop the second run from
        // starting another, so the intro never opened in development.
        const timer = setTimeout(() => {
            hasTriggered.current = true
            openIntroModal()
        }, 800)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <>
            <DemoTour />
            <DemoTourIntroModal />
            <DemoTourOutroModal />
            <DemoTourButton />
        </>
    )
}
