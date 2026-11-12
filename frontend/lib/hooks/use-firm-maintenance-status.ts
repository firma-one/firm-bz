'use client'
import { useState, useCallback, useRef } from 'react'
import { useVisiblePoll } from './use-visible-poll'

/**
 * How often to ask when nothing is happening. A workspace migration is rare, so the fast
 * cadence below is for the minutes one is actually running.
 *
 * A minute, not longer: this is how a member finds out that someone else has just put the
 * workspace into maintenance, and they should not keep editing for five minutes after the
 * fact. Most of the saving comes from not polling a hidden tab at all, not from this number.
 */
const IDLE_INTERVAL_MS = 60_000

export type MaintenanceStatus = {
  active: boolean
  estimatedMinutes?: number
  startedAt?: string
  expiresAt?: string
  migrationPending?: { initiatedAt?: string; estimatedStartMinutes?: number } | null
  latestMigrationStatus?: string | null
  totalFileCount?: number
  movedFileCount?: number
  failedFileCount?: number
  migrationFiles?: { fileId: string; fileName: string | null; status: string }[]
} | null

/**
 * `intervalMs` is the cadence while maintenance or a migration is actually under way. When
 * nothing is happening — almost always — it falls back to IDLE_INTERVAL_MS, and polling stops
 * entirely while the tab is hidden.
 */
export function useFirmMaintenanceStatus(
  firmId: string | null | undefined,
  accessToken: string | null | undefined,
  intervalMs = 15_000
): { status: MaintenanceStatus; refresh: () => void; setOptimistic: (s: MaintenanceStatus) => void } {
  const [status, setStatus] = useState<MaintenanceStatus>(null)
  const firmIdRef = useRef(firmId)
  const accessTokenRef = useRef(accessToken)
  firmIdRef.current = firmId
  accessTokenRef.current = accessToken

  const check = useCallback(async () => {
    const fid = firmIdRef.current
    const tok = accessTokenRef.current
    if (!fid || !tok) return
    try {
      const res = await fetch(`/api/firm/maintenance?firmId=${fid}`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  // Busy means there is something to watch change: maintenance is on, or a migration is
  // queued. Anything else is the steady state, which IDLE_INTERVAL_MS is paced for.
  const busy = !!status && (status.active || !!status.migrationPending)

  useVisiblePoll(check, busy ? intervalMs : IDLE_INTERVAL_MS, !!firmId && !!accessToken)

  return { status, refresh: check, setOptimistic: setStatus }
}
