'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDemoTour, hasOptedOutOfTour } from '@/lib/demo/demo-tour-context'
import { GUIDE_PARAM, MODE_PARAM, parseGuideParam, parseModeParam } from '@/lib/demo/tour-chapters'
import { DemoTour } from '@/components/demo/demo-tour'
import { DemoTourIntroModal } from '@/components/demo/demo-tour-intro-modal'
import { DemoTourOutroModal } from '@/components/demo/demo-tour-outro-modal'
import { DemoTourChapterEndModal } from '@/components/demo/demo-tour-chapter-end-modal'
import { DemoTourButton } from '@/components/demo/demo-tour-button'
import { DemoTourOutline } from '@/components/demo/demo-tour-outline'

/** Auto-opens the intro modal ~800ms after every visit to /tour (not just the first), and renders
 * the tour overlay, its outline pane, the modals and the floating restart button. Auto-opening is skipped if the
 * visitor opted out with "Don't show this again" on Skip (see demo-tour-context.tsx), and when the
 * visit is a deep link: ?guide=<chapter or section> on any /tour route starts it instead, opt-out or
 * not (.claude/plans/tour-chapters.md). Mid-run progress is kept in localStorage, so the intro
 * modal offers "Resume" whenever a visitor comes back with unfinished progress saved. */
export function DemoTourShell() {
    const { openIntroModal, startNode } = useDemoTour()
    const searchParams = useSearchParams()
    const guide = parseGuideParam(searchParams.get(GUIDE_PARAM))
    // A deep link may name its mode (&mode=step); otherwise the visitor's own, Autoplay at first.
    const linkMode = parseModeParam(searchParams.get(MODE_PARAM))
    const hasTriggered = useRef(false)

    // A deep link starts its chapter or section; the tour then replaces the URL with its first page.
    useEffect(() => {
        if (!guide) return
        hasTriggered.current = true
        startNode(guide, linkMode ?? undefined)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guide])

    useEffect(() => {
        if (hasTriggered.current || guide) return
        if (typeof window === 'undefined') return
        if (hasOptedOutOfTour()) return
        // Marked as triggered when the timer fires, not before: React's development double-run of
        // effects clears the first timer, and a guard set up front would stop the second run from
        // starting another, so the intro never opened in development.
        const timer = setTimeout(() => {
            if (hasTriggered.current) return
            hasTriggered.current = true
            openIntroModal()
        }, 800)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <>
            <DemoTour />
            <DemoTourOutline />
            <DemoTourIntroModal />
            <DemoTourOutroModal />
            <DemoTourChapterEndModal />
            <DemoTourButton />
        </>
    )
}
