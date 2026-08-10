'use client'

import { useEffect, useRef } from 'react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { DemoTour } from '@/components/demo/demo-tour'
import { DemoTourIntroModal } from '@/components/demo/demo-tour-intro-modal'
import { DemoTourOutroModal } from '@/components/demo/demo-tour-outro-modal'
import { DemoTourButton } from '@/components/demo/demo-tour-button'

const SEEN_KEY = 'fm_demo_tour_seen'

/** Static counterpart to DemoTourShell in d-layout-client.tsx — auto-opens the intro modal ~800ms
 * after first visit (per browser tab, via sessionStorage — no cross-session persistence needed for
 * a public demo), and renders the tour overlay + both modals + the floating restart FAB. */
export function DemoTourShell() {
    const { openIntroModal } = useDemoTour()
    const hasTriggered = useRef(false)

    useEffect(() => {
        if (hasTriggered.current) return
        hasTriggered.current = true
        if (typeof window === 'undefined') return
        const seen = window.sessionStorage.getItem(SEEN_KEY)
        if (seen) return
        const timer = setTimeout(() => {
            window.sessionStorage.setItem(SEEN_KEY, '1')
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
