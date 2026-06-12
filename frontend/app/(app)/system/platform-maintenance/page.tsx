'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield, ChevronRight, Wrench, AlertTriangle, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type MaintenanceConfig = {
  active: boolean
  gracePeriod: boolean
  graceEndsAt: string | null
  scheduledFrom: string | null
  scheduledTo: string | null
  message: string | null
  enabledAt: string | null
  disabledAt: string | null
  enabledBy: string | null
}

export default function PlatformMaintenancePage() {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [graceCountdown, setGraceCountdown] = useState<string | null>(null)

  const [scheduledFrom, setScheduledFrom] = useState('')
  const [scheduledTo, setScheduledTo] = useState('')
  const [message, setMessage] = useState('')

  const fetchConfig = async (isInitial = false) => {
    try {
      const res = await fetch('/api/system/platform-maintenance')
      const data = res.ok ? await res.json() : null
      if (data?.config) {
        setConfig(data.config)
        if (isInitial) {
          setScheduledFrom(data.config.scheduledFrom ?? '')
          setScheduledTo(data.config.scheduledTo ?? '')
          setMessage(data.config.message ?? '')
        }
      }
    } catch {
      if (isInitial) setError('Failed to load maintenance status')
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 5s while in grace period so the page updates when activation fires
  const isGraceRef = (config?.gracePeriod ?? false) && !(config?.active ?? false)
  useEffect(() => {
    if (!isGraceRef) return
    const id = setInterval(() => fetchConfig(false), 5_000)
    return () => clearInterval(id)
  }, [isGraceRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live countdown during grace period
  useEffect(() => {
    if (!config?.gracePeriod || !config.graceEndsAt) { setGraceCountdown(null); return }
    function tick() {
      const ms = new Date(config!.graceEndsAt!).getTime() - Date.now()
      if (ms <= 0) { setGraceCountdown('0:00'); return }
      const totalSecs = Math.ceil(ms / 1000)
      const m = Math.floor(totalSecs / 60)
      const s = totalSecs % 60
      setGraceCountdown(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [config])

  const isActive = config?.active ?? false
  const isGrace = (config?.gracePeriod ?? false) && !isActive

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    setConfirmOpen(false)
    try {
      const action = (isActive || isGrace) ? 'disable' : 'enable'
      const body: Record<string, unknown> = { action }
      if (action === 'enable') {
        if (scheduledFrom) body.scheduledFrom = scheduledFrom
        if (scheduledTo) body.scheduledTo = scheduledTo
        if (message.trim()) body.message = message.trim()
      }
      const res = await fetch('/api/system/platform-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Request failed')
      }
      const updated = await fetch('/api/system/platform-maintenance').then(r => r.json())
      if (updated?.config) setConfig(updated.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const confirmTitle = isActive
    ? 'Disable platform maintenance?'
    : isGrace
      ? 'Cancel scheduled maintenance?'
      : 'Enable platform maintenance?'

  const confirmDescription = isActive
    ? 'This will lift maintenance mode and send a "maintenance complete" email to all users.'
    : isGrace
      ? 'This will cancel the grace period. Users will not be signed out and the platform stays accessible.'
      : 'A 2-minute grace period will begin immediately. Users will see a countdown warning before sessions are terminated and maintenance begins.'

  return (
    <div className="flex flex-col space-y-6">
      {/* Breadcrumb + title */}
      <div className="flex flex-col space-y-4">
        <nav className="flex items-center text-sm text-gray-500">
          <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
            <Shield className="w-4 h-4" />
          </Link>
          <ChevronRight className="w-4 h-4 mx-2" />
          <Link href="/system" className="hover:text-gray-900 transition-colors">Administration</Link>
          <ChevronRight className="w-4 h-4 mx-2" />
          <span className="font-medium text-gray-900">Platform Maintenance</span>
        </nav>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Platform Maintenance</h1>
          <p className="text-gray-500 mt-1">Toggle platform-wide maintenance mode. A 2-minute grace period lets users save work before sessions are terminated.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Grace period banner */}
      {isGrace && (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <Timer className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Grace period in progress</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Maintenance activates in <span className="font-mono font-bold">{graceCountdown ?? '…'}</span>. Users are seeing a countdown warning. Sign-out and activation happen automatically.
            </p>
          </div>
        </div>
      )}

      {/* Current status */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0',
            isActive ? 'bg-amber-50 border border-amber-200' : isGrace ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50 border border-slate-200'
          )}>
            <Wrench className={cn('h-4 w-4', isActive ? 'text-amber-600' : isGrace ? 'text-orange-500' : 'text-slate-500')} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">Status</p>
            <p className={cn('text-sm', isActive ? 'text-amber-600 font-semibold' : isGrace ? 'text-orange-500 font-semibold' : 'text-slate-500')}>
              {loading ? 'Loading…' : isActive ? 'Maintenance active' : isGrace ? 'Grace period — activating soon' : 'Normal operation'}
            </p>
          </div>
        </div>
        {isActive && config?.enabledBy && (
          <p className="text-xs text-slate-400 mt-3 pl-12">
            Enabled by <strong>{config.enabledBy}</strong>
            {config.enabledAt ? ` · ${new Date(config.enabledAt).toLocaleString()}` : ''}
          </p>
        )}
        {!isActive && !isGrace && config?.disabledAt && (
          <p className="text-xs text-slate-400 mt-3 pl-12">
            Last disabled {new Date(config.disabledAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Settings form — only editable when not in grace or active */}
      <div className={cn('rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5', (isActive || isGrace) && 'opacity-50 pointer-events-none')}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Maintenance window</h2>
          <p className="text-xs text-slate-500 mt-0.5">Included in email notifications sent when maintenance is enabled.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">From</Label>
            <DateTimePicker
              value={scheduledFrom}
              onChange={setScheduledFrom}
              placeholder="Start of window"
              allowFutureDateTimes
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">To</Label>
            <DateTimePicker
              value={scheduledTo}
              onChange={setScheduledTo}
              placeholder="End of window"
              allowFutureDateTimes
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Custom message (optional)</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="We're performing scheduled database maintenance…"
            className="text-sm resize-none"
            rows={3}
          />
          <p className="text-xs text-slate-400">Shown on the maintenance page and included in emails.</p>
        </div>
      </div>

      {/* CTA */}
      {!loading && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setScheduledFrom(''); setScheduledTo(''); setMessage('') }}
            className="text-slate-500"
            disabled={isActive || isGrace}
          >
            Clear
          </Button>
          <Button
            disabled={saving}
            onClick={() => setConfirmOpen(true)}
            className={cn(
              'min-w-[200px]',
              isActive
                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                : isGrace
                  ? 'bg-white border border-red-300 text-red-600 hover:bg-red-50'
                  : 'bg-amber-600 hover:bg-amber-700 text-white border-0'
            )}
          >
            {saving ? 'Saving…' : isActive ? 'Turn off maintenance' : isGrace ? 'Cancel grace period' : 'Enable maintenance'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        iconVariant="amber"
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={isActive ? 'Yes, disable' : isGrace ? 'Yes, cancel grace period' : 'Yes, start grace period'}
        confirmVariant={(!isActive && !isGrace) ? 'amber' : 'red'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirm()}
        loading={saving}
      />
    </div>
  )
}
