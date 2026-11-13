import { useEffect, useRef } from 'react'

/*
 * The Overview's charts as link targets (`#ring-pace`, `#ring-planning`, …): the ids are on the cards
 * in engagement-overview-sections.tsx, and `.ring-pulse` is in globals.css. Shared by the app's
 * Overview (engagement-insights-dashboard.tsx) and the tour's (components/demo/demo-engagement-overview.tsx).
 */

/** Scrolls to a chart, then pulses it briefly so the eye finds what was referenced. */
export function scrollToRing(ringId: string) {
    const el = document.getElementById(ringId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-pulse')
    window.setTimeout(() => el.classList.remove('ring-pulse'), 1400)
}

/**
 * A link to one of the Overview's charts (`…/analytics#ring-pace`, from a Health entry in the RAID log)
 * lands once the charts are on the page: they arrive with the data, after the browser looked for the
 * anchor. Only on the first load, so a refresh never pulls the page back to it; a later change of
 * hash on the page jumps again.
 */
export function useRingAnchor(chartsShown: boolean) {
    const jumped = useRef(false)
    useEffect(() => {
        if (!chartsShown) return
        const jump = () => {
            const id = window.location.hash.slice(1)
            if (id.startsWith('ring-')) scrollToRing(id)
        }
        if (!jumped.current) {
            jumped.current = true
            jump()
        }
        window.addEventListener('hashchange', jump)
        return () => window.removeEventListener('hashchange', jump)
    }, [chartsShown])
}
