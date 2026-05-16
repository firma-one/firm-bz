'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow, formatDuration, intervalToDuration } from 'date-fns'
import { Cpu, Loader2, RotateCw, ChevronDown, ChevronRight, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

interface EnrichedRun {
  runId: string
  functionId: string
  status: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  eventName: string
  orgId: string | null
  eventPayload: Record<string, unknown>
}

interface JobsApiResponse {
  runs: EnrichedRun[]
  nextCursor: string | null
  hasMore: boolean
  totalFetched: number
  firm: { id: string; name: string; slug: string } | null
}

const FUNCTION_IDS = [
  'index-file-for-search',
  'index-batch-for-search',
  'scan-and-index-project',
  'populate-sandbox-sample-files',
  'provision-sandbox-hierarchy',
  'reconcile-file-deletion',
  'reconcile-folder-deletion',
  'revoke-project-sharing',
  'revoke-by-disabled-persona',
  'revoke-by-member-persona-change',
  'grant-permissions-for-new-member',
] as const

const STATUS_COLORS: Record<string, string> = {
  Running: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  Sleeping: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Queued: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default function JobsPage() {
  const { user, session } = useAuth()

  const [runs, setRuns] = useState<EnrichedRun[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [farmSlugInput, setFirmSlugInput] = useState('')
  const [activeFirmSlug, setActiveFirmSlug] = useState<string | null>(null)
  const [resolvedFirm, setResolvedFirm] = useState<JobsApiResponse['firm']>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [functionFilter, setFunctionFilter] = useState<string>('all')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchRuns = async (opts: { append?: boolean; cursorOverride?: string } = {}) => {
    try {
      const token = session?.access_token
      if (!token) return

      const params = new URLSearchParams()
      params.set('pageSize', '50')
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (functionFilter && functionFilter !== 'all') params.set('functionId', functionFilter)
      if (activeFirmSlug) params.set('firmSlug', activeFirmSlug)
      const cur = opts.cursorOverride ?? (opts.append ? nextCursor : undefined)
      if (cur) params.set('cursor', cur)

      const res = await fetch(`/api/system/inngest-jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        if (res.status === 404) {
          setError(`Firm '${activeFirmSlug}' not found`)
          setRuns([])
          setResolvedFirm(null)
          return
        }
        throw new Error(`Jobs API error: ${res.status}`)
      }

      const data: JobsApiResponse = await res.json()

      setRuns(prev => opts.append ? [...prev, ...data.runs] : data.runs)
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
      setResolvedFirm(data.firm)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs')
    }
  }

  const loadData = async () => {
    setLoading(true)
    await fetchRuns()
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleApplyFirmFilter = async () => {
    const slug = farmSlugInput.trim()
    if (!slug) return
    setActiveFirmSlug(slug)
  }

  const handleClearFirmFilter = () => {
    setFirmSlugInput('')
    setActiveFirmSlug(null)
    setResolvedFirm(null)
  }

  const toggleRowExpand = (runId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId)
    } else {
      newExpanded.add(runId)
    }
    setExpandedRows(newExpanded)
  }

  useEffect(() => {
    loadData()
    const interval = autoRefresh ? setInterval(loadData, 30000) : undefined
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [user, statusFilter, functionFilter, activeFirmSlug, autoRefresh])

  if (!user) {
    return <div className="p-8">Not authenticated</div>
  }

  const formatDurationMs = (ms: number | null): string => {
    if (ms === null) return '—'
    const duration = intervalToDuration({ start: 0, end: ms })
    return formatDuration(duration, { format: ['hours', 'minutes', 'seconds'] })
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Cpu className="h-4 w-4" />
        <span>Administration</span>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-medium">Background Jobs</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Background Jobs</h1>
        <p className="text-gray-600">Monitor Inngest function runs with real-time status and firm-level filtering.</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Dev mode info banner */}
      {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Development Mode:</strong> The Background Jobs monitor requires production Inngest API credentials. This feature displays job data from your Inngest cloud workspace. Set <code className="bg-blue-100 px-1 rounded">INNGEST_DEV=0</code> and configure <code className="bg-blue-100 px-1 rounded">INNGEST_SIGNING_KEY</code> with your production key to enable run history queries.
        </div>
      )}

      {/* Controls bar */}
      <section className="space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          {/* Firm slug filter */}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Firm slug or ID"
              value={farmSlugInput}
              onChange={e => setFirmSlugInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleApplyFirmFilter()
              }}
              className="w-48"
            />
            <Button variant="outline" onClick={handleApplyFirmFilter} size="sm">
              Apply
            </Button>
          </div>

          {/* Firm filter pill */}
          {resolvedFirm && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-900">
              <span>Filtered: {resolvedFirm.name}</span>
              <button
                onClick={handleClearFirmFilter}
                className="p-0.5 hover:bg-blue-200 rounded transition-colors"
                title="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex-1" />

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Running">Running</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
              <SelectItem value="Sleeping">Sleeping</SelectItem>
              <SelectItem value="Queued">Queued</SelectItem>
            </SelectContent>
          </Select>

          {/* Function filter */}
          <Select value={functionFilter} onValueChange={setFunctionFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Function" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All functions</SelectItem>
              {FUNCTION_IDS.map(fn => (
                <SelectItem key={fn} value={fn}>
                  {fn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh and auto-refresh */}
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

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto (30s)
          </label>
        </div>
      </section>

      {/* Table */}
      <section className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
            No jobs found. {statusFilter !== 'all' && 'Try adjusting filters.'}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 w-10" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Function</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Org ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {runs.map(run => (
                    <tbody key={run.runId}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleRowExpand(run.runId)}
                            className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                          >
                            {expandedRows.has(run.runId) ? (
                              <ChevronDown className="h-4 w-4 text-gray-600" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600 truncate max-w-xs">
                          {run.functionId}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={cn(
                              'inline-block px-2.5 py-1 text-xs font-semibold border rounded-full',
                              STATUS_COLORS[run.status] || STATUS_COLORS.Queued
                            )}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {run.status === 'Running' ? 'In progress' : formatDurationMs(run.durationMs)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">
                          {run.orgId ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {run.eventName}
                        </td>
                      </tr>
                      {expandedRows.has(run.runId) && (
                        <tr className="border-t border-gray-200">
                          <td colSpan={7} className="px-4 py-4 bg-gray-50">
                            <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto max-h-96 overflow-y-auto">
                              {JSON.stringify(run.eventPayload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchRuns({ append: true })}
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Load more
                </Button>
              </div>
            )}

            <p className="text-xs text-gray-500 text-right">
              Showing {runs.length} run{runs.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
