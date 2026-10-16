'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DebugContextData {
  jwt: Record<string, unknown> | null
  userSettingsPlus: unknown
}

interface DebugContextModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DebugContextModal({ open, onOpenChange }: DebugContextModalProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DebugContextData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setData(null)
    fetch('/api/debug/user-context', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Not available' : `HTTP ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        setData({
          jwt: payload.jwt ?? null,
          userSettingsPlus: payload.userSettingsPlus,
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Debug: JWT & UserSettingsPlus</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0 flex flex-col gap-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {data && !loading && (
            <>
              <section>
                <h3 className="text-sm font-semibold mb-2">JWT (grants)</h3>
                <pre className="text-xs overflow-auto max-h-[50vh] rounded border bg-surface-subtle p-3 whitespace-pre-wrap break-all">
                  {JSON.stringify(data.jwt, null, 2)}
                </pre>
              </section>
              <section>
                <h3 className="text-sm font-semibold mb-2">UserSettingsPlus</h3>
                <pre className="text-xs overflow-auto max-h-[50vh] rounded border bg-surface-subtle p-3 whitespace-pre-wrap break-all">
                  {JSON.stringify(data.userSettingsPlus, null, 2)}
                </pre>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
