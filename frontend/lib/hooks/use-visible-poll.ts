'use client'

import { useEffect, useRef } from 'react'

/**
 * Runs `task` now, and again on an interval, but only while the tab is visible.
 *
 * A background tab costs nothing. Browsers throttle hidden timers, they do not stop them,
 * so a signed-in tab left open overnight otherwise keeps calling the server until morning —
 * which is what exhausted the Vercel Fluid Active CPU allowance in November 2026. Here the
 * interval is cleared the moment the page is hidden and restarted when it comes back, with
 * one immediate run so what the user returns to is current rather than an hour stale.
 *
 * `intervalMs` of null runs the task once per enable and never polls. `enabled` false does
 * nothing at all, for the common case of a hook waiting on an id or a token.
 */
export function useVisiblePoll(
  task: () => void | Promise<void>,
  intervalMs: number | null,
  enabled = true,
): void {
  // Kept in a ref so a caller passing an inline closure does not restart the interval on
  // every render: the effect depends on the cadence, not on the identity of the task.
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval> | null = null
    const run = () => { void taskRef.current() }

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const start = () => {
      stop()
      if (intervalMs !== null) timer = setInterval(run, intervalMs)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        run()
        start()
      } else {
        stop()
      }
    }

    // One run on mount even when hidden, so the first paint after a restore has data.
    run()
    if (document.visibilityState === 'visible') start()

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [intervalMs, enabled])
}
