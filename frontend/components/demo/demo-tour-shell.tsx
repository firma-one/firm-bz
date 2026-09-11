'use client'

import { useEffect, useRef } from 'react'
import { useDemoTour, hasOptedOutOfTour } from '@/lib/demo/demo-tour-context'
import { DemoTour } from '@/components/demo/demo-tour'
import { DemoTourIntroModal } from '@/components/demo/demo-tour-intro-modal'
import { DemoTourOutroModal } from '@/components/demo/demo-tour-outro-modal'
import { DemoTourButton } from '@/components/demo/demo-tour-button'

/** Static counterpart to DemoTourShell in d-layout-client.tsx — auto-opens the intro modal ~800ms
 * after every visit to /demo (not just the first), and renders the tour overlay + both modals +
 * the floating restart FAB. Auto-opening is skipped only if the visitor explicitly opted out via
 * the "Don't show this again" checkbox on Skip (see demo-tour-context.tsx). Mid-tour progress is
 * tracked separately via localStorage, so the intro modal correctly offers "Resume Tour" whenever
 * a visitor reopens the demo with unfinished progress saved, matching the real app's behavior. */
export function DemoTourShell() {
    const { openIntroModal } = useDemoTour()
    const hasTriggered = useRef(false)

    useEffect(() => {
        if (hasTriggered.current) return
        hasTriggered.current = true
        if (typeof window === 'undefined') return
        if (hasOptedOutOfTour()) return
        const timer = setTimeout(() => {
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
