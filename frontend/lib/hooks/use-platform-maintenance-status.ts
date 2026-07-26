'use client'

import { useEffect, useState } from 'react'

export type PlatformMaintenanceStatus = {
  active: boolean
  pendingGrace: boolean
  graceEndsAt: string | null
  scheduledFrom: string | null
  scheduledTo: string | null
  message: string | null
}

export function usePlatformMaintenanceStatus(pollIntervalMs = 60_000): PlatformMaintenanceStatus | null {
  const [status, setStatus] = useState<PlatformMaintenanceStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetch_() {
      try {
        const res = await fetch('/api/system/platform-maintenance/status', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data = await res.json() as PlatformMaintenanceStatus
        if (!cancelled) setStatus(data)
      } catch { /* non-fatal */ }
    }

    fetch_()
    const id = setInterval(fetch_, pollIntervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [pollIntervalMs])

  return status
}
