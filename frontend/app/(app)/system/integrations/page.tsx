'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Activity, AlertCircle, CheckCircle2, Loader2, RotateCw, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface StatusCheckResult {
  database: { status: 'up' | 'down'; latencyMs?: number; error?: string }
  inngest: { status: 'up' | 'down'; mode?: 'dev' | 'production'; error?: string }
  polar: { status: 'up' | 'down'; error?: string }
  smtp: { status: 'configured' | 'unconfigured'; host?: string }
  checkedAt: string
}

interface StuckFirm {
  id: string
  name: string
  slug: string
  connectorId: string
  createdAt: string
  stuckSince: string | null
  userId: string
  userEmail: string
}

interface StuckFirmsResponse {
  firms: StuckFirm[]
}

interface ReprovisionResponse {
  queued: number
  skipped: number
  errors: Array<{ firmId: string; error: string }>
}

type ServiceKey = 'database' | 'inngest' | 'polar' | 'smtp'

const serviceLabels: Record<ServiceKey, string> = {
  database: 'Database',
  inngest: 'Inngest',
  polar: 'Polar Billing',
  smtp: 'SMTP Email',
}

export default function IntegrationsPage() {
  const { user, session } = useAuth()
  const router = useRouter()

  const [statusData, setStatusData] = useState<StatusCheckResult | null>(null)
  const [stuckFirms, setStuckFirms] = useState<StuckFirm[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedFirms, setSelectedFirms] = useState<Set<string>>(new Set())
  const [isReprovisioning, setIsReprovisioning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const token = session?.access_token
      if (!token) return

      const res = await fetch('/api/system/integrations/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
      setStatusData(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    }
  }

  const fetchStuckFirms = async () => {
    try {
      const token = session?.access_token
      if (!token) return

      const res = await fetch('/api/system/stuck-firms', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Query failed: ${res.status}`)
      const data: StuckFirmsResponse = await res.json()
      setStuckFirms(data.firms)
      setSelectedFirms(new Set())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stuck firms')
    }
  }

  const loadData = async () => {
    setLoading(true)
    await Promise.all([fetchStatus(), fetchStuckFirms()])
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleReprovision = async () => {
    setShowConfirm(false)
    setIsReprovisioning(true)

    try {
      const token = session?.access_token
      if (!token) throw new Error('No auth token')

      const res = await fetch('/api/system/reprovision-firms', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firmIds: Array.from(selectedFirms) }),
      })

      if (!res.ok) throw new Error(`Reprovision failed: ${res.status}`)

      const result: ReprovisionResponse = await res.json()
      setError(null)

      // Clear selection and show success message
      const queued = result.queued
      setSelectedFirms(new Set())
      setSuccessMessage(`Queued ${queued} firm${queued === 1 ? '' : 's'} for provisioning. Will refresh in 30 seconds.`)

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)

      // Refresh after a short delay
      setTimeout(() => {
        fetchStuckFirms()
        setIsReprovisioning(false)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reprovision')
      setIsReprovisioning(false)
    }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [user])

  if (!user) {
    return <div className="p-8">Not authenticated</div>
  }

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedFirms(new Set(stuckFirms.map(f => f.id)))
    } else {
      setSelectedFirms(new Set())
    }
  }

  const toggleFirm = (firmId: string) => {
    const newSelected = new Set(selectedFirms)
    if (newSelected.has(firmId)) {
      newSelected.delete(firmId)
    } else {
      newSelected.add(firmId)
    }
    setSelectedFirms(newSelected)
  }

  const copyToClipboard = (value: string, itemId: string) => {
    navigator.clipboard.writeText(value)
    setCopiedId(itemId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getServiceStatus = (service: ServiceKey): { icon: any; bgColor: string; textColor: string } => {
    const status = statusData?.[service]?.status
    if (status === 'up' || (service === 'smtp' && status === 'configured')) {
      return {
        icon: CheckCircle2,
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
      }
    }
    return {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
    }
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Activity className="h-4 w-4" />
        <span>Administration</span>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-medium">Integrations</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Integrations</h1>
        <p className="text-gray-600">Live health status and onboarding recovery</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Success banner */}
      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ {successMessage}
        </div>
      )}

      {/* Integration Status Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Integration Status</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RotateCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-sm text-gray-500">
          Last checked: {statusData?.checkedAt ? new Date(statusData.checkedAt).toLocaleTimeString() : 'never'}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {(['database', 'inngest', 'polar', 'smtp'] as ServiceKey[]).map(service => {
              const serviceStatus = getServiceStatus(service)
              const StatusIcon = serviceStatus.icon
              const data = statusData?.[service]
              const isUp = data?.status === 'up' || (service === 'smtp' && data?.status === 'configured')

              return (
                <div
                  key={service}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{serviceLabels[service]}</p>
                    <div className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                      isUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    )}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {isUp ? 'UP' : 'DOWN'}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    {service === 'inngest' && <p>{`Mode: ${(data as any)?.mode || 'unknown'}`}</p>}
                    {service === 'smtp' && (data as any)?.host && <p>{`Host: ${(data as any).host}`}</p>}
                    {(data as any)?.latencyMs && <p>{`Latency: ${(data as any).latencyMs}ms`}</p>}
                    {(data as any)?.error && <p className="text-red-600 text-xs">{(data as any).error}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Stuck Onboarding Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Stuck Onboarding Firms</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : stuckFirms.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            ✓ All caught up — no firms stuck in provisioning
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedFirms.size === stuckFirms.length && stuckFirms.length > 0}
                        onChange={e => toggleAll(e.target.checked)}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Firm Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Slug</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Firm ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Stuck Since</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stuckFirms.map(firm => (
                    <tr key={firm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedFirms.has(firm.id)}
                          onChange={() => toggleFirm(firm.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{firm.name}</span>
                          <button
                            onClick={() => copyToClipboard(firm.name, `name-${firm.id}`)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Copy firm name"
                          >
                            {copiedId === `name-${firm.id}` ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">{firm.slug}</span>
                          <button
                            onClick={() => copyToClipboard(firm.slug, `slug-${firm.id}`)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Copy slug"
                          >
                            {copiedId === `slug-${firm.id}` ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-600 text-xs">{firm.id}</span>
                          <button
                            onClick={() => copyToClipboard(firm.id, `id-${firm.id}`)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Copy firm ID"
                          >
                            {copiedId === `id-${firm.id}` ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{firm.userEmail}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {firm.stuckSince ? formatDistanceToNow(new Date(firm.stuckSince), { addSuffix: true }) : 'unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(firm.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{selectedFirms.size} selected</p>
              <div className="flex flex-col items-end gap-2">
                <Button
                  onClick={() => setShowConfirm(true)}
                  disabled={selectedFirms.size === 0 || isReprovisioning || statusData?.inngest?.status === 'down'}
                >
                  {isReprovisioning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Resume Provisioning ({selectedFirms.size})
                </Button>
                {statusData?.inngest?.status === 'down' && (
                  <p className="text-xs text-red-600">Inngest is DOWN — resume provisioning is disabled</p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume Provisioning?</DialogTitle>
            <DialogDescription>
              This will re-enqueue Inngest jobs for {selectedFirms.size} firm{selectedFirms.size === 1 ? '' : 's'}. The provisioning process will start immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleReprovision}>
              Resume Provisioning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
