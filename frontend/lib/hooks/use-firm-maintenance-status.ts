'use client'
import { useState, useEffect } from 'react'

export type MaintenanceStatus = {
  active: boolean
  estimatedMinutes?: number
  startedAt?: string
  expiresAt?: string
} | null

export function useFirmMaintenanceStatus(
  firmId: string | null | undefined,
  accessToken: string | null | undefined,
  intervalMs = 15_000
): MaintenanceStatus {
  const [status, setStatus] = useState<MaintenanceStatus>(null)

  useEffect(() => {
    if (!firmId || !accessToken) return

    const check = async () => {
      try {
        const res = await fetch(`/api/firm/maintenance?firmId=${firmId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.ok) setStatus(await res.json())
      } catch { /* ignore */ }
    }

    void check()
    const id = setInterval(() => void check(), intervalMs)
    return () => clearInterval(id)
  }, [firmId, accessToken, intervalMs])

  return status
}
