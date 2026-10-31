'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { revealTimes, type SpokenWord } from '@/lib/demo/tour-read-along'

/**
 * Words streaming in as Brio says them: each stays faint until it's spoken, then comes up, so the
 * text fills in as it's read; still legible ahead, for anyone reading faster. Used by the tour's step
 * card (demo-tour.tsx) and "Hear Brio" on the landing page (hear-brio.tsx).
 *
 * Covers the text in `container` (or in its `selector` matches), skipping what's hidden from screen
 * readers as the narration does, and lines it up with the clip's word times (tour-read-along.ts).
 * Done with the CSS Custom Highlight API, which colors stretches of text without touching the DOM
 * (React's to change): `highlight` names the ::highlight in globals.css that styles the unspoken
 * words. A browser without the API shows the text as usual.
 *
 * `heard` is how far the clip has got, in seconds: 0 until it starts, Infinity once it's over.
 * `restartKey` starts it over, with the text it then finds (the tour's next step).
 */
export function useStreamingReveal({ container, selector, highlight, on, words, heard, restartKey }: {
    container: RefObject<HTMLElement | null>
    selector?: string
    highlight: string
    on: boolean
    words: SpokenWord[] | null
    heard: () => number
    restartKey?: unknown
}) {
    const heardRef = useRef(heard)
    heardRef.current = heard

    useEffect(() => {
        const root = container.current
        if (!on || !words || !root || typeof Highlight === 'undefined' || !CSS.highlights) return
        const ranges: Range[] = []
        const shown: string[] = []
        const roots = selector ? Array.from(root.querySelectorAll(selector)) : [root]
        roots.forEach((part) => {
            const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => (node.parentElement?.closest('[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
            })
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent ?? ''
                const word = /\S+/g
                for (let match = word.exec(text); match; match = word.exec(text)) {
                    const range = document.createRange()
                    range.setStart(node, match.index)
                    range.setEnd(node, match.index + match[0].length)
                    ranges.push(range)
                    shown.push(match[0])
                }
            }
        })
        const times = revealTimes(shown, words)
        const unspoken = new Highlight()
        CSS.highlights.set(highlight, unspoken)
        // A tick every 50ms rather than every frame: a word takes about 300ms to say, and the text
        // keeps up whether or not the browser is painting frames.
        let revealed = -1
        const tick = () => {
            const at = heardRef.current()
            let count = 0
            while (count < times.length && times[count] <= at) count++
            if (count !== revealed) {
                revealed = count
                unspoken.clear()
                for (let i = count; i < ranges.length; i++) unspoken.add(ranges[i])
            }
            if (count === ranges.length) clearInterval(timer)
        }
        const timer = setInterval(tick, 50)
        tick()
        return () => {
            clearInterval(timer)
            CSS.highlights.delete(highlight)
        }
    }, [container, selector, highlight, on, words, restartKey])
}
