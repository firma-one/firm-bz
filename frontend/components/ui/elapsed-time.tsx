'use client'

import { useEffect, useState } from 'react'

/**
 * How long the current operation has been running.
 *
 * ## Why show it at all
 *
 * A spinner says "working"; it does not say whether working is going well. Three seconds into a
 * rename the user is waiting, and twenty seconds in they are wondering whether it has hung — the
 * same spinner answers neither. An elapsed count turns an indefinite wait into a measured one, so
 * the user can decide for themselves when something is wrong.
 *
 * Deliberately NOT a progress bar. The apply route processes its batch server-side and returns
 * once, so there is no per-item signal to report; a bar would have to invent its own position,
 * which is a more confident claim than the data supports.
 *
 * Ticks once a second. Sub-second precision would draw the eye to a number changing ten times a
 * second, which reads as frantic rather than informative.
 */
export function ElapsedTime({ className = '' }: { className?: string }) {
    const [seconds, setSeconds] = useState(0)

    useEffect(() => {
        // From a fixed start rather than incrementing a counter: a backgrounded tab throttles
        // timers, and counting ticks would under-report by however long the tab was asleep.
        const start = Date.now()
        const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
        return () => clearInterval(id)
    }, [])

    // Hidden for the first second: a "0s" that appears and immediately becomes "1s" is noise on an
    // operation that was never slow enough to need timing.
    if (seconds < 1) return null

    return (
        <span className={`tabular-nums ${className}`}>
            {seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
        </span>
    )
}
