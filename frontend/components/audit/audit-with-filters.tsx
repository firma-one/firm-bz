'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  FolderLock,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Rocket,
  RotateCcw,
  Share2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSmartDateTime } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DateTimePicker } from '@/components/ui/date-time-picker'

export type AuditWithFiltersMode = 'project' | 'org'

export type AuditEventRow = {
  id: string
  eventType: string
  eventAt: string
  actorUserId: string | null
  actorEmail: string | null
  projectDocumentId: string | null
  metadata: Record<string, unknown>
  clientName?: string | null
  projectName?: string | null
}

type FilterOption = { id: string; name: string; clientId?: string }
type EventTypeOption = { value: string; label: string }

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  // Firm
  { value: 'FIRM_CREATED', label: 'Workspace created' },
  { value: 'FIRM_CHANGED', label: 'Workspace updated' },
  { value: 'FIRM_DELETED', label: 'Workspace deleted' },
  { value: 'FIRM_SETTINGS_CHANGED', label: 'Workspace settings changed' },
  { value: 'FIRM_BRANDING_CHANGED', label: 'Workspace branding changed' },
  { value: 'FIRM_MEMBER_INVITED', label: 'Workspace member invited' },
  { value: 'FIRM_MEMBER_ADDED', label: 'Workspace member added' },
  { value: 'FIRM_MEMBER_REMOVED', label: 'Workspace member removed' },
  { value: 'FIRM_MEMBER_ROLE_CHANGED', label: 'Workspace member role changed' },
  { value: 'FIRM_CONNECTOR_ATTACHED', label: 'Drive connected' },
  { value: 'FIRM_CONNECTOR_DETACHED', label: 'Drive disconnected' },
  // Client
  { value: 'CLIENT_CREATED', label: 'Client created' },
  { value: 'CLIENT_CHANGED', label: 'Client updated' },
  { value: 'CLIENT_DELETED', label: 'Client deleted' },
  { value: 'CLIENT_SETTINGS_CHANGED', label: 'Client settings changed' },
  { value: 'CLIENT_CONTACT_CREATED', label: 'Contact created' },
  { value: 'CLIENT_CONTACT_CHANGED', label: 'Contact updated' },
  { value: 'CLIENT_CONTACT_DELETED', label: 'Contact deleted' },
  { value: 'CLIENT_MEMBER_ADDED', label: 'Client member added' },
  { value: 'CLIENT_MEMBER_REMOVED', label: 'Client member removed' },
  { value: 'CLIENT_MEMBER_ROLE_CHANGED', label: 'Client member role changed' },
  // Engagement
  { value: 'ENGAGEMENT_CREATED', label: 'Engagement created' },
  { value: 'ENGAGEMENT_CHANGED', label: 'Engagement updated' },
  { value: 'ENGAGEMENT_DELETED', label: 'Engagement deleted' },
  { value: 'ENGAGEMENT_CLOSED', label: 'Engagement closed' },
  { value: 'ENGAGEMENT_REOPENED', label: 'Engagement reopened' },
  { value: 'ENGAGEMENT_LOCKED', label: 'Engagement locked' },
  { value: 'ENGAGEMENT_SETTINGS_CHANGED', label: 'Engagement settings changed' },
  { value: 'ENGAGEMENT_MEMBER_ADDED', label: 'Engagement member added' },
  { value: 'ENGAGEMENT_MEMBER_REMOVED', label: 'Engagement member removed' },
  { value: 'ENGAGEMENT_MEMBER_ROLE_CHANGED', label: 'Engagement member role changed' },
  { value: 'ENGAGEMENT_FOLDER_ATTACHED', label: 'Engagement folder linked' },
  // Document
  { value: 'DOCUMENT_CREATED', label: 'File uploaded' },
  { value: 'DOCUMENT_CHANGED', label: 'File updated' },
  { value: 'DOCUMENT_DELETED', label: 'File removed' },
  { value: 'DOCUMENT_MOVED', label: 'File moved' },
  { value: 'DOCUMENT_VERSIONED', label: 'New version uploaded' },
  { value: 'DOCUMENT_OPENED', label: 'Document opened' },
  { value: 'DOCUMENT_DOWNLOADED', label: 'Document downloaded' },
  { value: 'DOCUMENT_INDEXED', label: 'Document indexed' },
  { value: 'DOCUMENT_FINALIZED', label: 'Document finalized' },
  { value: 'DOCUMENT_UNLOCKED', label: 'Document unlocked' },
  { value: 'DOCUMENT_STATUS_CHANGED', label: 'Status changed' },
  { value: 'DOCUMENT_COMMENT_CREATED', label: 'Comment added' },
  { value: 'DOCUMENT_COMMENT_CHANGED', label: 'Comment updated' },
  { value: 'DOCUMENT_COMMENT_DELETED', label: 'Comment deleted' },
  // Document sharing
  { value: 'DOCUMENT_SHARE_CREATED', label: 'Share created' },
  { value: 'DOCUMENT_SHARE_CHANGED', label: 'Share updated' },
  { value: 'DOCUMENT_SHARE_DELETED', label: 'Share revoked' },
  { value: 'DOCUMENT_SHARE_VIEWED', label: 'Share viewed' },
  { value: 'DOCUMENT_SHARE_DOWNLOADED', label: 'Share downloaded' },
  { value: 'DOCUMENT_SHARE_REGRANTED', label: 'Share re-granted' },
  // Onboarding
  { value: 'ONBOARDING_WORKSPACE_INITIALIZED', label: 'Workspace initialized' },
  { value: 'ONBOARDING_SUBSCRIBE_COMPLETED', label: 'Subscription completed' },
  { value: 'ONBOARDING_SUBSCRIBE_SKIPPED', label: 'Subscription skipped' },
  { value: 'ONBOARDING_DRIVE_CONNECTED', label: 'Drive connected (onboarding)' },
  { value: 'ONBOARDING_PROVISIONING_STARTED', label: 'Workspace provisioning started' },
  { value: 'ONBOARDING_COMPLETED', label: 'Onboarding completed' },
  { value: 'ONBOARDING_DOMAIN_JOINED', label: 'Joined workspace by domain' },
  // Audit meta
  { value: 'AUDIT_LOG_EXPORTED', label: 'Audit log exported' },
]

function eventTypeLabel(eventType: string): string {
  const found = EVENT_TYPE_OPTIONS.find((o) => o.value === eventType)
  return found ? found.label : eventType.replace(/_/g, ' ').toLowerCase()
}

function eventDetails(ev: AuditEventRow): string {
  const m = ev.metadata as Record<string, unknown> | undefined
  if (!m || typeof m !== 'object') return ''
  const fileName = m.fileName as string | undefined
  const description = m.description as string | undefined
  const name = m.name as string | undefined
  const action = m.action as string | undefined
  const changedFields = Array.isArray(m.changedFields) ? (m.changedFields as string[]) : undefined
  const contactName = m.contactName as string | undefined
  const role = m.newRole as string | undefined
  const invitedEmail = m.invitedEmail as string | undefined
  if (fileName) return fileName
  if (description) return description
  if (name) return name
  if (action) return action
  if (contactName) return contactName
  if (invitedEmail) return invitedEmail
  if (role) return `→ ${role}`
  if (changedFields?.length) return `Changed: ${changedFields.join(', ')}`
  if (m.newStatus) return `Status: ${m.oldStatus ?? '—'} → ${m.newStatus}`
  return Object.keys(m).length ? JSON.stringify(m) : ''
}

function EventIcon({ eventType }: { eventType: string }) {
  if (eventType.startsWith('ONBOARDING_')) return <Rocket className="h-4 w-4 text-violet-500" />
  if (eventType.startsWith('FIRM_MEMBER_')) return <UserPlus className="h-4 w-4 text-indigo-400" />
  if (eventType.startsWith('FIRM_')) return <Building2 className="h-4 w-4 text-indigo-600" />
  if (eventType.startsWith('CLIENT_CONTACT_')) return <MessageSquare className="h-4 w-4 text-teal-400" />
  if (eventType.startsWith('CLIENT_MEMBER_')) return <UserPlus className="h-4 w-4 text-teal-400" />
  if (eventType.startsWith('CLIENT_')) return <Users className="h-4 w-4 text-teal-600" />
  if (eventType.startsWith('ENGAGEMENT_MEMBER_')) return <UserPlus className="h-4 w-4 text-blue-400" />
  if (eventType.startsWith('ENGAGEMENT_')) return <Briefcase className="h-4 w-4 text-blue-600" />
  if (eventType === 'DOCUMENT_OPENED') return <Eye className="h-4 w-4 text-slate-500" />
  if (eventType === 'DOCUMENT_DOWNLOADED' || eventType === 'DOCUMENT_SHARE_DOWNLOADED') return <Download className="h-4 w-4 text-green-600" />
  if (eventType === 'AUDIT_LOG_EXPORTED') return <ClipboardList className="h-4 w-4 text-orange-500" />
  if (eventType.startsWith('DOCUMENT_SHARE_')) return <Share2 className="h-4 w-4 text-purple-600" />
  if (eventType.startsWith('DOCUMENT_COMMENT_')) return <MessageSquare className="h-4 w-4 text-amber-500" />
  if (eventType === 'DOCUMENT_FINALIZED' || eventType === 'DOCUMENT_LOCKED') return <Lock className="h-4 w-4 text-amber-600" />
  if (eventType === 'DOCUMENT_STATUS_CHANGED' || eventType.includes('STATUS')) return <RefreshCw className="h-4 w-4 text-slate-600" />
  if (eventType.includes('SHARED') || eventType === 'SHARED_EXT') return <Share2 className="h-4 w-4 text-purple-600" />
  if (eventType.includes('LOCKED') || eventType.includes('CLOSED')) return <Lock className="h-4 w-4 text-amber-600" />
  if (eventType.includes('UPLOAD') || eventType.includes('DOCUMENT_ADDED') || eventType === 'DOCUMENT_CREATED') return <FileUp className="h-4 w-4 text-blue-600" />
  if (eventType.startsWith('DOCUMENT_')) return <FileText className="h-4 w-4 text-gray-500" />
  return <FileText className="h-4 w-4 text-gray-400" />
}

function isJsonObject(s: string): boolean {
  return s.trim().startsWith('{') || s.trim().startsWith('[')
}

function DetailCell({ ev }: { ev: AuditEventRow }) {
  const [copied, setCopied] = React.useState(false)
  const raw = eventDetails(ev)
  if (!raw) return <span className="text-gray-400">—</span>

  const isJson = isJsonObject(raw)

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex items-center gap-1.5 group max-w-xs">
      {isJson ? (
        <code className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate block max-w-[260px]" title={raw}>
          {raw}
        </code>
      ) : (
        <span className="truncate text-gray-700 max-w-[260px]" title={raw}>{raw}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100"
        title="Copy"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3 text-slate-400" />
        }
      </button>
    </div>
  )
}

function buildAuditUrl(
  mode: AuditWithFiltersMode,
  id: string,
  opts: {
    cursor?: string
    fromDate?: string
    toDate?: string
    eventTypes?: string[]
    clientIds?: string[]
    projectIds?: string[]
  }
): string {
  const base = mode === 'project' ? `/api/projects/${id}/audit` : `/api/firms/${id}/audit`
  const url = new URL(base, window.location.origin)
  url.searchParams.set('limit', '50')
  if (opts.cursor) url.searchParams.set('cursor', opts.cursor)
  if (opts.fromDate) url.searchParams.set('fromDate', opts.fromDate)
  if (opts.toDate) url.searchParams.set('toDate', opts.toDate)
  for (const t of opts.eventTypes ?? []) url.searchParams.append('eventType', t)
  for (const c of opts.clientIds ?? []) url.searchParams.append('clientId', c)
  for (const p of opts.projectIds ?? []) url.searchParams.append('projectId', p)
  return url.toString()
}

function exportToCsv(events: AuditEventRow[], title: string, includeClientProject: boolean) {
  const headers = includeClientProject
    ? ['Date', 'Client', 'Engagement', 'Event type', 'Details', 'Actor email']
    : ['Date', 'Event type', 'Details', 'Actor email']
  const rows = events.map((ev) => {
    const date = formatSmartDateTime(ev.eventAt)
    const client = (ev.clientName ?? '').replace(/"/g, '""')
    const project = (ev.projectName ?? '').replace(/"/g, '""')
    const type = eventTypeLabel(ev.eventType)
    const details = eventDetails(ev).replace(/"/g, '""')
    const email = (ev.actorEmail ?? (ev.actorUserId ? 'User' : 'System')).replace(/"/g, '""')
    const cells = includeClientProject
      ? [date, client, project, type, details, email]
      : [date, type, details, email]
    return cells.map((c) => `"${c}"`).join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `audit-${(title || 'audit').replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

type SortCol = 'date' | 'client' | 'project' | 'eventType' | 'actor'

const SORT_COLS: { value: SortCol; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Engagement' },
  { value: 'eventType', label: 'Event type' },
  { value: 'actor', label: 'Actor' },
]

export interface AuditWithFiltersProps {
  mode: AuditWithFiltersMode
  resourceId: string
  exportTitle: string
  /** When true, show Client + Project dropdown filters (intended for firm-level audit). */
  showClientProjectFilters?: boolean
  /** Required when showClientProjectFilters is true. */
  firmIdForFilters?: string
}

export function AuditWithFilters({
  mode,
  resourceId,
  exportTitle,
  showClientProjectFilters = false,
  firmIdForFilters,
}: AuditWithFiltersProps) {
  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [eventTypesFilter, setEventTypesFilter] = useState<string[]>([])
  const [eventTypeSearch, setEventTypeSearch] = useState('')
  const [eventTypeMenuOpen, setEventTypeMenuOpen] = useState(false)

  const [clientIdsFilter, setClientIdsFilter] = useState<string[]>([])
  const [projectIdsFilter, setProjectIdsFilter] = useState<string[]>([])
  const [clients, setClients] = useState<FilterOption[]>([])
  const [projects, setProjects] = useState<FilterOption[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)

  const [clearThenReload, setClearThenReload] = useState(false)
  const [showFullDate, setShowFullDate] = useState(false)
  const [dateRangeError, setDateRangeError] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [pickerResetKey, setPickerResetKey] = useState(0)
  const [actorFilter, setActorFilter] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const filteredEventTypes = useMemo(() => {
    const q = eventTypeSearch.trim().toLowerCase()
    const opts = EVENT_TYPE_OPTIONS.filter((o) => o.value !== '') as EventTypeOption[]
    if (!q) return opts
    return opts.filter((o) => o.label.toLowerCase().includes(q))
  }, [eventTypeSearch])

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [clients, clientSearch])

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, projectSearch])

  const selectedClientLabel = useMemo(() => {
    if (clientIdsFilter.length === 0) return 'All clients'
    if (clientIdsFilter.length === 1) return clients.find((c) => c.id === clientIdsFilter[0])?.name ?? '1 client'
    return `${clientIdsFilter.length} clients`
  }, [clientIdsFilter, clients])

  const selectedProjectLabel = useMemo(() => {
    if (projectIdsFilter.length === 0) return 'All projects'
    if (projectIdsFilter.length === 1) return projects.find((p) => p.id === projectIdsFilter[0])?.name ?? '1 project'
    return `${projectIdsFilter.length} projects`
  }, [projectIdsFilter, projects])

  const selectedEventTypeLabel = useMemo(() => {
    if (eventTypesFilter.length === 0) return 'All types'
    if (eventTypesFilter.length === 1) return EVENT_TYPE_OPTIONS.find((o) => o.value === eventTypesFilter[0])?.label ?? '1 type'
    return `${eventTypesFilter.length} types`
  }, [eventTypesFilter])

  // Load dropdown options for firm mode
  useEffect(() => {
    if (!showClientProjectFilters) return
    if (!firmIdForFilters) return

    const url = new URL(`/api/firms/${firmIdForFilters}/audit/filters`, window.location.origin)
    for (const c of clientIdsFilter) url.searchParams.append('clientId', c)

    fetch(url.toString())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load filters'))))
      .then((data) => {
        setClients(Array.isArray(data.clients) ? data.clients : [])
        setProjects(Array.isArray(data.projects) ? data.projects : [])
      })
      .catch(() => {
        setClients([])
        setProjects([])
      })
  }, [showClientProjectFilters, firmIdForFilters, clientIdsFilter])

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const url = buildAuditUrl(mode, resourceId, {
        cursor,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        eventTypes: eventTypesFilter.length ? eventTypesFilter : undefined,
        clientIds: showClientProjectFilters && clientIdsFilter.length ? clientIdsFilter : undefined,
        projectIds: showClientProjectFilters && projectIdsFilter.length ? projectIdsFilter : undefined,
      })
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to load audit')
      }
      return res.json()
    },
    [
      mode,
      resourceId,
      fromDate,
      toDate,
      eventTypesFilter,
      showClientProjectFilters,
      clientIdsFilter,
      projectIdsFilter,
    ]
  )

  const load = useCallback(
    async (cursor?: string) => {
      const isInitial = !cursor
      if (isInitial) setLoading(true)
      else setLoadingMore(true)
      setError(null)
      try {
        const data = await fetchPage(cursor)
        const list = data.events ?? []
        if (isInitial) setEvents(list)
        else setEvents((prev) => [...prev, ...list])
        setNextCursor(data.nextCursor ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [fetchPage]
  )

  useEffect(() => {
    load()
  }, [load])

  // Auto-reload on filter change; skip when date range is invalid.
  useEffect(() => {
    if (dateRangeError) return
    setNextCursor(null)
    ;(async () => {
      await load()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, eventTypesFilter, clientIdsFilter, projectIdsFilter, showClientProjectFilters, dateRangeError])

  useEffect(() => {
    if (clearThenReload) {
      setClearThenReload(false)
      load()
    }
  }, [clearThenReload, load])

  // Lazy-load next page when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextCursor && !loadingMore) {
          load(nextCursor)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [nextCursor, loadingMore, load])

  const visibleEvents = useMemo(() => {
    let list = events
    if (actorFilter.trim()) {
      const q = actorFilter.trim().toLowerCase()
      list = list.filter((ev) => ev.actorEmail?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      let va: string
      let vb: string
      if (sortCol === 'date') {
        va = a.eventAt; vb = b.eventAt
      } else if (sortCol === 'client') {
        va = a.clientName ?? ''; vb = b.clientName ?? ''
      } else if (sortCol === 'project') {
        va = a.projectName ?? ''; vb = b.projectName ?? ''
      } else if (sortCol === 'eventType') {
        va = eventTypeLabel(a.eventType); vb = eventTypeLabel(b.eventType)
      } else {
        va = a.actorEmail ?? ''; vb = b.actorEmail ?? ''
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [events, actorFilter, sortCol, sortDir])

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-xs text-gray-500 mb-3">Audit history is permanent and cannot be edited.</p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">From date</label>
          <DateTimePicker
            key={`from-${pickerResetKey}`}
            value={fromDate}
            defaultTime="23:59"
            disableFutureTimes
            placeholder="From date"
            className="w-[210px]"
            onChange={(iso) => {
              setFromDate(iso)
              if (iso && toDate && new Date(iso) > new Date(toDate)) {
                setDateRangeError('From must be before To')
              } else {
                setDateRangeError(null)
              }
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">To date</label>
          <DateTimePicker
            key={`to-${pickerResetKey}`}
            value={toDate}
            defaultTime="23:59"
            placeholder="To date"
            className="w-[210px]"
            onChange={(iso) => {
              if (iso && fromDate && new Date(iso) < new Date(fromDate)) {
                setDateRangeError('To must be after From')
                return
              }
              setDateRangeError(null)
              setToDate(iso)
            }}
          />
        </div>

        {dateRangeError && (
          <p className="text-xs text-red-500 self-end pb-1.5">{dateRangeError}</p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Event type</label>
          <DropdownMenu open={eventTypeMenuOpen} onOpenChange={setEventTypeMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs min-w-[150px] bg-white flex items-center justify-between gap-2"
              >
                <span className="truncate">{selectedEventTypeLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] p-0">
              <div className="px-2 py-2 flex items-center gap-2 border-b border-gray-100">
                <input
                  value={eventTypeSearch}
                  onChange={(e) => setEventTypeSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search types…"
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                />
                <Button
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    setEventTypeMenuOpen(false)
                  }}
                >
                  Done
                </Button>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
              <button
                type="button"
                className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                onClick={(e) => {
                  e.preventDefault()
                  setEventTypesFilter([])
                }}
              >
                <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                  <Check className={`h-3 w-3 ${eventTypesFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                </span>
                All types
              </button>
              {filteredEventTypes.map((o) => {
                const checked = eventTypesFilter.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                    onClick={(e) => {
                      e.preventDefault()
                      setEventTypesFilter(toggleId(eventTypesFilter, o.value))
                    }}
                  >
                    <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                      <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                )
              })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showClientProjectFilters && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Client</label>
              <DropdownMenu open={clientMenuOpen} onOpenChange={setClientMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-2 py-1.5 text-xs min-w-[150px] bg-white flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{selectedClientLabel}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[280px] p-0">
                  <div className="px-2 py-2 flex items-center gap-2 border-b border-gray-100">
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search clients…"
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                    />
                    <Button
                      size="sm"
                      className="bg-slate-900 hover:bg-slate-800 text-white"
                      onClick={(e) => {
                        e.preventDefault()
                        setClientMenuOpen(false)
                      }}
                    >
                      Done
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                    onClick={(e) => {
                      e.preventDefault()
                      setClientIdsFilter([])
                      setProjectIdsFilter([])
                    }}
                  >
                    <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                      <Check className={`h-3 w-3 ${clientIdsFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                    </span>
                    All clients
                  </button>
                  {filteredClients.map((c) => {
                    const checked = clientIdsFilter.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                        onClick={(e) => {
                          e.preventDefault()
                          const next = toggleId(clientIdsFilter, c.id)
                          setClientIdsFilter(next)
                          // changing client selection invalidates project selection
                          setProjectIdsFilter((prev) =>
                            prev.filter((pid) => projects.find((p) => p.id === pid && next.includes(p.clientId ?? '')))
                          )
                        }}
                      >
                        <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                          <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                        </span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Engagement</label>
              <DropdownMenu open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-2 py-1.5 text-xs min-w-[150px] bg-white flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{selectedProjectLabel}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[280px] p-0">
                  <div className="px-2 py-2 flex items-center gap-2 border-b border-gray-100">
                    <input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search projects…"
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                    />
                    <Button
                      size="sm"
                      className="bg-slate-900 hover:bg-slate-800 text-white"
                      onClick={(e) => {
                        e.preventDefault()
                        setProjectMenuOpen(false)
                      }}
                    >
                      Done
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                    onClick={(e) => {
                      e.preventDefault()
                      setProjectIdsFilter([])
                    }}
                  >
                    <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                      <Check className={`h-3 w-3 ${projectIdsFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                    </span>
                    All projects
                  </button>
                  {filteredProjects.map((p) => {
                    const checked = projectIdsFilter.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                        onClick={(e) => {
                          e.preventDefault()
                          setProjectIdsFilter(toggleId(projectIdsFilter, p.id))
                        }}
                      >
                        <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                          <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                        </span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Actor</label>
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Filter by email…"
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs w-[160px] bg-white"
          />
        </div>

        <div className="flex items-end gap-1.5 ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setFromDate('')
                    setToDate('')
                    setDateRangeError(null)
                    setPickerResetKey((k) => k + 1)
                    setEventTypesFilter([])
                    setClientIdsFilter([])
                    setProjectIdsFilter([])
                    setActorFilter('')
                    setEventTypeSearch('')
                    setClientSearch('')
                    setProjectSearch('')
                    setNextCursor(null)
                    setClearThenReload(true)
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear filters</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => { setNextCursor(null); load() }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-slate-900 hover:bg-slate-800 text-white"
                  disabled={events.length === 0}
                  onClick={() => exportToCsv(events, exportTitle ?? 'audit', true)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export CSV</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-2 min-h-[20px]">
        {!loading && (
          <span className="text-xs text-gray-500">
            Showing <span className="font-medium text-gray-700">{visibleEvents.length}</span> row{visibleEvents.length !== 1 ? 's' : ''}
            {nextCursor && <span className="text-gray-400"> · scroll to load more</span>}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 border border-gray-200 rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading audit log…
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <FolderLock className="h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm">No audit events found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 w-[160px]">
                  <span className="inline-flex items-center gap-1.5">
                    Date
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={showFullDate}
                            onClick={() => setShowFullDate((v) => !v)}
                            className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${showFullDate ? 'bg-slate-600' : 'bg-gray-300'}`}
                          >
                            <span className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${showFullDate ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Toggle datetime format</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 w-[120px]">Client</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 w-[120px]">Engagement</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 w-[160px]">Event type</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 min-w-[120px]">Details</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-700 w-[200px]">Actor</th>
                <th className="py-2.5 px-2 w-8 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center h-6 w-6 rounded hover:bg-slate-200 transition-colors ${sortCol !== 'date' || sortDir !== 'desc' ? 'text-indigo-600' : 'text-slate-400'}`}
                        title="Sort"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="8" y2="18" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px] py-1 text-xs">
                      <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400 py-1">Sort by</DropdownMenuLabel>
                      {SORT_COLS.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.value}
                          className="text-xs"
                          checked={sortCol === c.value}
                          onCheckedChange={() => setSortCol(c.value)}
                        >
                          {c.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400 py-1">Sort direction</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        className="text-xs"
                        checked={sortDir === 'desc'}
                        onCheckedChange={() => setSortDir('desc')}
                      >
                        {sortCol === 'date' ? 'Newest first' : 'Z to A'}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        className="text-xs"
                        checked={sortDir === 'asc'}
                        onCheckedChange={() => setSortDir('asc')}
                      >
                        {sortCol === 'date' ? 'Oldest first' : 'A to Z'}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50/80">
                  <td className="py-2 px-3 whitespace-nowrap">
                    <TooltipProvider>
                      <RelativeDateTime
                        date={ev.eventAt}
                        displayFormat={showFullDate ? 'verbose' : 'short'}
                        tooltipSide="right"
                        textClassName="text-gray-600 text-sm"
                      />
                    </TooltipProvider>
                  </td>
                  <td className="py-2 px-3 text-gray-700 max-w-[120px] truncate" title={ev.clientName ?? ''}>
                    {ev.clientName ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-gray-700 max-w-[120px] truncate" title={ev.projectName ?? ''}>
                    {ev.projectName ?? '—'}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <EventIcon eventType={ev.eventType} />
                      <span className="font-medium text-gray-900">{eventTypeLabel(ev.eventType)}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <DetailCell ev={ev} />
                  </td>
                  <td className="py-2 px-3 text-gray-600">{ev.actorEmail ?? (ev.actorUserId ? 'User' : 'System')}</td>
                  <td className="py-2 px-2" />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-3 border-t border-gray-100">
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
      </div>
    </div>
  )
}

