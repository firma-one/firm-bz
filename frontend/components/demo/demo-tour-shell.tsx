'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDemoTour, hasOptedOutOfTour } from '@/lib/demo/demo-tour-context'
import { GUIDE_PARAM, MODE_PARAM, parseGuideParam, parseModeParam } from '@/lib/demo/tour-chapters'
import { COOKIE_CONSENT_UPDATED_EVENT, FM_COOKIE_CONSENT_KEY } from '@/lib/cookie-consent-storage'
import { DemoTour } from '@/components/demo/demo-tour'
import { DemoTourButton } from '@/components/demo/demo-tour-button'
import { DemoTourPanel } from '@/components/demo/demo-tour-panel'

/** Auto-opens the tour panel's start ~800ms after every visit to /tour (not just the first), and
 * renders the tour overlay, its panel (start, outline and ending) and the floating restart button. On a first
 * visit it waits for the cookie banner to be answered: both sit at the foot of the page. Auto-opening
 * is skipped if the visitor opted out with "Don't show again" (see demo-tour-context.tsx), and when
 * the visit is a deep link: ?guide=<chapter or section> on any /tour route starts it instead, opt-out
 * or not (.claude/plans/tour-chapters.md). Mid-run progress is kept in localStorage, so the panel
 * offers Resume whenever a visitor comes back with unfinished progress saved. */
export function DemoTourShell() {
    const { openIntroModal, startNode } = useDemoTour()
    const searchParams = useSearchParams()
    const guide = parseGuideParam(searchParams.get(GUIDE_PARAM))
    // A deep link may name its mode (&mode=step); otherwise the visitor's own, Autopilot at first.
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
        // starting another, so the panel never opened in development.
        let timer: ReturnType<typeof setTimeout> | undefined
        const open = () => {
            timer = setTimeout(() => {
                if (hasTriggered.current) return
                hasTriggered.current = true
                openIntroModal()
            }, 800)
        }
        let answered = true
        try {
            answered = window.localStorage.getItem(FM_COOKIE_CONSENT_KEY) !== null
        } catch {
            /* storage blocked: the banner can't remember either, so don't wait on it */
        }
        if (answered) open()
        else window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, open, { once: true })
        return () => {
            clearTimeout(timer)
            window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, open)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <>
            <DemoTour />
            <DemoTourPanel />
            <DemoTourButton />
        </>
    )
}
