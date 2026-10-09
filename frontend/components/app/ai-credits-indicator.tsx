'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Tip } from '@/components/ui/tip'

/**
 * Top-bar AI credit balance.
 *
 * Credits are a billing-GROUP resource: the engagement assistant, Doc Search, summaries and briefs
 * all draw on one pool. So the balance belongs in one global place rather than repeated on every AI
 * surface — a per-surface counter says the same thing many times and moves while the user is
 * nowhere near it.
 *
 * Ambient by design. A number permanently inside the chat panel makes people ration the feature;
 * here it is there when looked for and silent otherwise, with color carrying the only signal that
 * needs to arrive unprompted.
 *
 * Renders nothing for anyone the API refuses — external collaborators cannot use AI, so they are
 * not shown its balance. Hiding is a presentation detail; the endpoint enforces it.
 */

type Credits = {
    allowance: number | null
    used: number
    remaining: number | null
    enforced: boolean
    periodEndIso: string | null
    aheadOfPace: boolean
    projectedExhaustionIso: string | null
}

/** Below this share remaining, the icon warns regardless of pace — the end is close either way. */
const LOW_REMAINING_FRACTION = 0.15

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AiCreditsIndicator() {
    const [credits, setCredits] = useState<Credits | null>(null)
    const [denied, setDenied] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ai/credits', { cache: 'no-store' })
            if (!res.ok) {
                // 403 is the ordinary case for an external collaborator, not an error worth showing.
                setDenied(true)
                return
            }
            const body = (await res.json()) as { data?: Credits }
            if (body.data) { setCredits(body.data); setDenied(false) }
        } catch {
            // Leave the last known value in place. A balance is ambient information — a failed
            // refresh should not blank it or announce itself.
        }
    }, [])

    useEffect(() => {
        void load()
        // Refreshed on AI activity rather than polled: credits only move when someone spends one,
        // and a timer would wake every session all day to learn nothing. The AI surfaces dispatch
        // this after a completed call.
        const onSpent = () => void load()
        window.addEventListener('firma-ai-credit-spent', onSpent)
        return () => window.removeEventListener('firma-ai-credit-spent', onSpent)
    }, [load])

    if (denied || !credits) return null

    const { allowance, used, remaining, aheadOfPace, projectedExhaustionIso } = credits

    // No allowance resolved means Polar metadata has not synced — the deliberate fail-open in
    // credit-cap. Say so rather than implying either a limit or unlimited use.
    if (allowance === null || remaining === null) {
        return (
            <Tip label={`${used} AI credits used · allowance not configured`} position="bottom">
                <Link
                    href="/d/billing"
                    aria-label={`${used} AI credits used, allowance not configured`}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 transition-colors"
                >
                    <Sparkles className="h-5 w-5" />
                </Link>
            </Tip>
        )
    }

    const low = allowance > 0 && remaining / allowance <= LOW_REMAINING_FRACTION
    const warn = aheadOfPace || low

    const pace = remaining === 0
        ? 'none left this period'
        : aheadOfPace && projectedExhaustionIso
            ? `running out around ${formatDate(projectedExhaustionIso)}`
            : 'on track'

    return (
        <Tip label={`${remaining} of ${allowance} AI credits left · ${pace}`} position="bottom">
            <Link
                href="/d/billing"
                aria-label={`${remaining} of ${allowance} AI credits left, ${pace}`}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                    warn
                        ? 'text-amber-600 hover:bg-amber-500/10'
                        : 'text-primary hover:bg-primary/10'
                }`}
            >
                <Sparkles className="h-5 w-5" />
            </Link>
        </Tip>
    )
}
