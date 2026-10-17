'use client'

import { useEffect, useRef, useState } from 'react'
import { FirmBriefCard, type FirmBrief } from '@/components/dashboard/ai-firm-brief'
import { buildDemoFirmBrief } from '@/lib/demo/demo-brio'
import type { DemoFirm } from '@/lib/demo/static-demo-data'

/**
 * Static counterpart to the app's brief (useFirmBrief + FirmBriefCard): the same card, written from
 * the demo firm's sample data instead of by the model (lib/demo/demo-brio.ts). Built after mount,
 * since it reads "today" and the server's day may not be the visitor's.
 *
 * "Rewrite with Brio" is simulated, as on the tour's Engagement Summary: a moment "reading", then
 * the brief typed out a couple of words at a time, with Stop.
 */
export function DemoFirmBrief({ firm }: { firm: DemoFirm }) {
    const [brief, setBrief] = useState<FirmBrief | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [streamText, setStreamText] = useState('')
    const timer = useRef<number | null>(null)

    useEffect(() => setBrief({ content: buildDemoFirmBrief(firm), generatedAt: new Date().toISOString() }), [firm])

    const stopTyping = () => {
        if (timer.current !== null) window.clearTimeout(timer.current)
        if (timer.current !== null) window.clearInterval(timer.current)
        timer.current = null
    }
    useEffect(() => stopTyping, [])

    const rewrite = () => {
        stopTyping()
        const text = buildDemoFirmBrief(firm)
        // Words with their trailing spaces, released a couple at a time: reads as typing.
        const words = text.split(/(?<=\s)/)
        setStreamText('')
        setRefreshing(true)
        // A moment "reading the firm's data" before the first words, as the model takes.
        timer.current = window.setTimeout(() => {
            let shown = 0
            timer.current = window.setInterval(() => {
                shown = Math.min(words.length, shown + 2)
                setStreamText(words.slice(0, shown).join(''))
                if (shown >= words.length) {
                    stopTyping()
                    setRefreshing(false)
                    setStreamText('')
                    setBrief({ content: text, generatedAt: new Date().toISOString() })
                }
            }, 45)
        }, 900)
    }

    const stop = () => {
        stopTyping()
        setRefreshing(false)
        setStreamText('')
    }

    return (
        <div data-demo-tour="firm-brief" className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">
            <FirmBriefCard
                brief={brief}
                loading={!brief}
                refreshing={refreshing}
                streamText={streamText}
                onRewrite={rewrite}
                onStop={stop}
                source="the demo firm’s sample data"
                reading="the demo firm’s data"
            />
        </div>
    )
}
