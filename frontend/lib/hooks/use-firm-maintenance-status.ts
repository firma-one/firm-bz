'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

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

  useEffect(() => {
    if (!firmId || !accessToken) return
    void check()
    const id = setInterval(() => void check(), intervalMs)
    return () => clearInterval(id)
  }, [firmId, accessToken, intervalMs, check])

  return { status, refresh: check, setOptimistic: setStatus }
}
