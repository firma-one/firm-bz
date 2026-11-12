'use client'

import { useCallback, useState } from 'react'
import { useVisiblePoll } from './use-visible-poll'

export type PlatformMaintenanceStatus = {
  active: boolean
  pendingGrace: boolean
  graceEndsAt: string | null
  scheduledFrom: string | null
  scheduledTo: string | null
  message: string | null
}

/**
 * The platform-wide maintenance flag. Polled only while the tab is visible; the route itself
 * answers from a short-lived cache, so a minute's cadence across many open tabs is a handful
 * of reads rather than one per tab per minute.
 */
export function usePlatformMaintenanceStatus(pollIntervalMs = 60_000): PlatformMaintenanceStatus | null {
  const [status, setStatus] = useState<PlatformMaintenanceStatus | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/platform-maintenance/status', { cache: 'no-store' })
      if (!res.ok) return
      setStatus(await res.json() as PlatformMaintenanceStatus)
    } catch { /* non-fatal */ }
  }, [])

  useVisiblePoll(fetchStatus, pollIntervalMs)

  return status
}
