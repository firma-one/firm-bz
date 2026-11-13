'use client'

// No longer mounted: the tour's firm Overview uses the floating DemoBrioChat (firm subject), as the app does; kept until Deepak signs off.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FirmChatPanel, type FirmChatTurn } from '@/components/dashboard/firm-ai-chat'
import { FOLLOWUP_MARKER } from '@/lib/ai/engagement-chat'
import { formatFirmSourcesLine, type FirmChatLink } from '@/lib/ai/firm-chat'
import type { FirmEngagementRow } from '@/lib/insights/firm-engagement-pace'
import {
    DEMO_FIRM_CHAT_QUESTIONS as QUESTIONS,
    DEMO_FIRM_FREEFORM_REPLY as FREEFORM_REPLY,
    demoFirmCannedAnswer as cannedAnswer,
} from '@/lib/demo/demo-brio'

/** How long "Brio is thinking" shows before the answer starts, and the pace it arrives at. */
const THINK_MS = 900
const TICK_MS = 35

const link = (r: FirmEngagementRow): FirmChatLink => ({ name: r.name, clientSlug: r.clientSlug, slug: r.slug })

/**
 * Static counterpart to FirmAiChat (components/dashboard/firm-ai-chat.tsx): the same panel, answering
 * its own suggested questions from the sample firm (canned, typed out a few words at a time, with
 * Stop), and saying so for anything typed. Engagement links go to the tour's own pages.
 */
export function DemoFirmChat({ rows, nowMs }: { rows: FirmEngagementRow[]; nowMs: number }) {
    const [turns, setTurns] = useState<FirmChatTurn[]>([])
    const [busy, setBusy] = useState(false)
    const timers = useRef<number[]>([])

    // Emptied in place, so the unmount cleanup below sees the same array.
    const clearTimers = () => timers.current.splice(0).forEach((t) => window.clearTimeout(t))
    useEffect(() => {
        const pending = timers.current
        return () => pending.forEach((t) => window.clearTimeout(t))
    }, [])

    const ask = useCallback((raw: string) => {
        const question = raw.trim()
        if (!question || busy) return
        const canned = cannedAnswer(question, rows, nowMs)
        const others = QUESTIONS.filter((q) => q !== question)
        // What the route sends: the answer, the follow-ups, then the server's links line.
        const body = canned ? `${canned.answer}\n${FOLLOWUP_MARKER}\n${others.join('\n')}` : FREEFORM_REPLY
        const full = canned
            ? body + formatFirmSourcesLine({ engagements: canned.named.map(link), drewOn: rows.length })
            : body

        setBusy(true)
        setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
        const setLast = (content: string) =>
            setTurns((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], content }])

        const tokens = body.split(/(\s+)/)
        let shown = 0
        const tick = () => {
            shown = Math.min(tokens.length, shown + 4)
            if (shown >= tokens.length) {
                setLast(full)
                setBusy(false)
                return
            }
            setLast(tokens.slice(0, shown).join(''))
            timers.current.push(window.setTimeout(tick, TICK_MS))
        }
        timers.current.push(window.setTimeout(tick, THINK_MS))
    }, [busy, rows, nowMs])

    const stop = useCallback(() => {
        clearTimers()
        setBusy(false)
        setTurns((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return last.content ? [...prev.slice(0, -1), { ...last, stopped: true }] : prev.slice(0, -1)
        })
    }, [])

    const reset = useCallback(() => {
        clearTimers()
        setBusy(false)
        setTurns([])
    }, [])

    // Each starter is one of the canned questions, so each has an answer.
    const starters = useMemo(() => QUESTIONS.filter((q) => cannedAnswer(q, rows, nowMs)), [rows, nowMs])

    return (
        <div data-demo-tour="firm-chat">
            <FirmChatPanel
                turns={turns}
                busy={busy}
                starters={starters}
                onAsk={ask}
                onStop={stop}
                onReset={reset}
                hrefFor={(l) => `/tour/${l.clientSlug}/${l.slug}`}
            />
        </div>
    )
}
