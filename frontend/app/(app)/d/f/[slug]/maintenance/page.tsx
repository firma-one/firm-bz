'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useFirmMaintenanceStatus } from '@/lib/hooks/use-firm-maintenance-status'
import { BRAND_NAME } from '@/config/brand'
import { Wrench, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function MaintenancePage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [firmId, setFirmId] = useState<string | null>(null)
  const [forceUnlocking, setForceUnlocking] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    fetch(`/api/firm/by-slug?slug=${slug}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.id) setFirmId(data.id)
      })
      .catch(() => { /* ignore */ })
  }, [slug, accessToken])

  const status = useFirmMaintenanceStatus(firmId, accessToken, 20_000)
  const wasActive = useRef(false)

  useEffect(() => {
    if (status?.active === true) {
      wasActive.current = true
    }
    if (wasActive.current && status?.active === false) {
      router.push(`/d/f/${slug}/connectors`)
    }
  }, [status, slug, router])

  const now = new Date()
  const isExpired = status?.expiresAt ? now > new Date(status.expiresAt) : false
  const estimatedMinutes = status?.estimatedMinutes ?? null

  const handleForceUnlock = async () => {
    if (!firmId || !accessToken) return
    setForceUnlocking(true)
    try {
      await fetch('/api/firm/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: 'force-unlock', firmId }),
      })
      router.push(`/d/f/${slug}/connectors`)
    } catch { /* ignore */ } finally {
      setForceUnlocking(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 mx-auto">
          <Wrench className="h-7 w-7 text-slate-600" strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{BRAND_NAME}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workspace under maintenance</h1>
          <p className="text-slate-500">
            Files are being migrated to a new workspace folder. This page will refresh automatically when done.
          </p>
        </div>
        {estimatedMinutes !== null && (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Estimated completion: ~{estimatedMinutes} min
          </div>
        )}
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check now
          </Button>
          {isExpired && (
            <Button
              size="sm"
              onClick={() => void handleForceUnlock()}
              disabled={forceUnlocking}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {forceUnlocking ? 'Unlocking…' : 'Force unlock'}
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          If this takes longer than expected, contact your workspace administrator.
        </p>
      </div>
    </div>
  )
}
