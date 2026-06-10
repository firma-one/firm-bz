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
import { UserAvatarWithTooltip } from '@/components/ui/user-avatar-with-tooltip'

export type AuditWithFiltersMode = 'project' | 'org'

export type AuditEventRow = {
  id: string
  eventType: string
  eventAt: string
  actorUserId: string | null
  actorEmail: string | null
  actorName?: string | null
  projectDocumentId: string | null
  metadata: Record<string, unknown>
  clientName?: string | null
  projectName?: string | null
}

type FilterOption = { id: string; name: string; clientId?: string }

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
  { value: 'FIRM_CONNECTOR_ATTACHED', label: 'Drive connected (legacy)' },
  { value: 'FIRM_CONNECTOR_DETACHED', label: 'Drive disconnected (legacy)' },
  { value: 'STORAGE_CONNECTOR_ATTACHED', label: 'Storage connector connected' },
  { value: 'STORAGE_CONNECTOR_DETACHED', label: 'Storage connector disconnected' },
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
  // File
  { value: 'DOCUMENT_CREATED', label: 'File uploaded' },
  { value: 'DOCUMENT_CHANGED', label: 'File updated' },
  { value: 'DOCUMENT_DELETED', label: 'File deleted' },
  { value: 'DOCUMENT_MOVED', label: 'File moved' },
  { value: 'DOCUMENT_VERSIONED', label: 'File new version' },
  { value: 'DOCUMENT_OPENED', label: 'File opened' },
  { value: 'DOCUMENT_DOWNLOADED', label: 'File downloaded' },
  { value: 'DOCUMENT_INDEXED', label: 'File indexed' },
  { value: 'DOCUMENT_FINALIZED', label: 'File finalized' },
  { value: 'DOCUMENT_UNLOCKED', label: 'File unlocked' },
  { value: 'DOCUMENT_STATUS_CHANGED', label: 'File status changed' },
  { value: 'DOCUMENT_COMMENT_CREATED', label: 'File comment added' },
  { value: 'DOCUMENT_COMMENT_CHANGED', label: 'File comment updated' },
  { value: 'DOCUMENT_COMMENT_DELETED', label: 'File comment deleted' },
  // File sharing
  { value: 'DOCUMENT_SHARE_CREATED', label: 'File shared' },
  { value: 'DOCUMENT_SHARE_CHANGED', label: 'File share updated' },
  { value: 'DOCUMENT_SHARE_DELETED', label: 'File share revoked' },
  { value: 'DOCUMENT_SHARE_VIEWED', label: 'File share viewed' },
  { value: 'DOCUMENT_SHARE_DOWNLOADED', label: 'File share downloaded' },
  { value: 'DOCUMENT_SHARE_REGRANTED', label: 'File share re-granted' },
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

const SCOPE_OPTIONS = [
  { value: 'FIRM', label: 'Firm' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'ENGAGEMENT', label: 'Engagement' },
  { value: 'FILE', label: 'File' },
] as const

const SCOPE_TO_EVENT_TYPES: Record<string, string[]> = {
  FIRM: [
    'FIRM_CREATED', 'FIRM_CHANGED', 'FIRM_DELETED', 'FIRM_SETTINGS_CHANGED',
    'FIRM_BRANDING_CHANGED', 'FIRM_MEMBER_INVITED', 'FIRM_MEMBER_ADDED',
    'FIRM_MEMBER_REMOVED', 'FIRM_MEMBER_ROLE_CHANGED', 'FIRM_CONNECTOR_ATTACHED',
    'FIRM_CONNECTOR_DETACHED', 'ONBOARDING_WORKSPACE_INITIALIZED',
    'ONBOARDING_SUBSCRIBE_COMPLETED', 'ONBOARDING_SUBSCRIBE_SKIPPED',
    'ONBOARDING_DRIVE_CONNECTED', 'ONBOARDING_PROVISIONING_STARTED',
    'ONBOARDING_COMPLETED', 'ONBOARDING_DOMAIN_JOINED', 'AUDIT_LOG_EXPORTED',
  ],
  CLIENT: [
    'CLIENT_CREATED', 'CLIENT_CHANGED', 'CLIENT_DELETED', 'CLIENT_SETTINGS_CHANGED',
    'CLIENT_CONTACT_CREATED', 'CLIENT_CONTACT_CHANGED', 'CLIENT_CONTACT_DELETED',
    'CLIENT_MEMBER_ADDED', 'CLIENT_MEMBER_REMOVED', 'CLIENT_MEMBER_ROLE_CHANGED',
    'STORAGE_CONNECTOR_ATTACHED', 'STORAGE_CONNECTOR_DETACHED',
  ],
  ENGAGEMENT: [
    'ENGAGEMENT_CREATED', 'ENGAGEMENT_CHANGED', 'ENGAGEMENT_DELETED',
    'ENGAGEMENT_CLOSED', 'ENGAGEMENT_REOPENED', 'ENGAGEMENT_LOCKED',
    'ENGAGEMENT_SETTINGS_CHANGED', 'ENGAGEMENT_MEMBER_ADDED',
    'ENGAGEMENT_MEMBER_REMOVED', 'ENGAGEMENT_MEMBER_ROLE_CHANGED',
    'ENGAGEMENT_FOLDER_ATTACHED',
  ],
  FILE: [
    'DOCUMENT_CREATED', 'DOCUMENT_CHANGED', 'DOCUMENT_DELETED', 'DOCUMENT_MOVED',
    'DOCUMENT_VERSIONED', 'DOCUMENT_OPENED', 'DOCUMENT_DOWNLOADED',
    'DOCUMENT_INDEXED', 'DOCUMENT_FINALIZED', 'DOCUMENT_UNLOCKED',
    'DOCUMENT_STATUS_CHANGED', 'DOCUMENT_COMMENT_CREATED',
    'DOCUMENT_COMMENT_CHANGED', 'DOCUMENT_COMMENT_DELETED',
    'DOCUMENT_SHARE_CREATED', 'DOCUMENT_SHARE_CHANGED', 'DOCUMENT_SHARE_DELETED',
    'DOCUMENT_SHARE_VIEWED', 'DOCUMENT_SHARE_DOWNLOADED', 'DOCUMENT_SHARE_REGRANTED',
  ],
}

const EVENT_ACTION_OPTIONS = [
  {
    value: 'CREATED', label: 'Created',
    eventTypes: ['FIRM_CREATED', 'CLIENT_CREATED', 'ENGAGEMENT_CREATED', 'DOCUMENT_CREATED', 'CLIENT_CONTACT_CREATED', 'DOCUMENT_COMMENT_CREATED'],
  },
  {
    value: 'MODIFIED', label: 'Modified',
    eventTypes: [
      'FIRM_CHANGED', 'FIRM_SETTINGS_CHANGED', 'FIRM_BRANDING_CHANGED',
      'CLIENT_CHANGED', 'CLIENT_SETTINGS_CHANGED', 'CLIENT_CONTACT_CHANGED',
      'ENGAGEMENT_CHANGED', 'ENGAGEMENT_SETTINGS_CHANGED',
      'DOCUMENT_CHANGED', 'DOCUMENT_MOVED', 'DOCUMENT_VERSIONED',
      'DOCUMENT_STATUS_CHANGED', 'DOCUMENT_COMMENT_CHANGED', 'DOCUMENT_SHARE_CHANGED',
    ],
  },
  {
    value: 'DELETED', label: 'Deleted',
    eventTypes: [
      'FIRM_DELETED', 'CLIENT_DELETED', 'ENGAGEMENT_DELETED', 'DOCUMENT_DELETED',
      'CLIENT_CONTACT_DELETED', 'DOCUMENT_COMMENT_DELETED', 'DOCUMENT_SHARE_DELETED',
    ],
  },
  {
    value: 'OPENED', label: 'Opened',
    eventTypes: ['DOCUMENT_OPENED'],
  },
  {
    value: 'DOWNLOADED', label: 'Downloaded',
    eventTypes: ['DOCUMENT_DOWNLOADED', 'DOCUMENT_SHARE_DOWNLOADED'],
  },
  {
    value: 'SHARED', label: 'Shared',
    eventTypes: ['DOCUMENT_SHARE_CREATED', 'DOCUMENT_SHARE_REGRANTED', 'DOCUMENT_SHARE_VIEWED'],
  },
  {
    value: 'FINALIZED', label: 'Finalized',
    eventTypes: ['DOCUMENT_FINALIZED'],
  },
  {
    value: 'UNLOCKED', label: 'Unlocked',
    eventTypes: ['DOCUMENT_UNLOCKED'],
  },
  {
    value: 'COMMENTED', label: 'Commented',
    eventTypes: ['DOCUMENT_COMMENT_CREATED', 'DOCUMENT_COMMENT_CHANGED', 'DOCUMENT_COMMENT_DELETED'],
  },
  {
    value: 'MEMBER', label: 'Member change',
    eventTypes: [
      'FIRM_MEMBER_INVITED', 'FIRM_MEMBER_ADDED', 'FIRM_MEMBER_REMOVED', 'FIRM_MEMBER_ROLE_CHANGED',
      'CLIENT_MEMBER_ADDED', 'CLIENT_MEMBER_REMOVED', 'CLIENT_MEMBER_ROLE_CHANGED',
      'ENGAGEMENT_MEMBER_ADDED', 'ENGAGEMENT_MEMBER_REMOVED', 'ENGAGEMENT_MEMBER_ROLE_CHANGED',
    ],
  },
  {
    value: 'INDEXED', label: 'Indexed',
    eventTypes: ['DOCUMENT_INDEXED'],
  },
] as const

function eventTypeLabel(eventType: string): string {
  const found = EVENT_TYPE_OPTIONS.find((o) => o.value === eventType)
  return found ? found.label : eventType.replace(/_/g, ' ').toLowerCase()
}

function eventScope(eventType: string): string {
  if (eventType.startsWith('FIRM_') || eventType.startsWith('ONBOARDING_') || eventType === 'AUDIT_LOG_EXPORTED') return 'Firm'
  if (eventType.startsWith('CLIENT_')) return 'Client'
  if (eventType.startsWith('ENGAGEMENT_')) return 'Engagement'
  if (eventType.startsWith('DOCUMENT_')) return 'File'
  return '—'
}

function eventAction(eventType: string): string {
  const found = EVENT_ACTION_OPTIONS.find((a) => (a.eventTypes as readonly string[]).includes(eventType))
  if (found) return found.label
  return EVENT_TYPE_OPTIONS.find((o) => o.value === eventType)?.label ?? eventType.replace(/_/g, ' ').toLowerCase()
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
    ? ['Date', 'Client', 'Engagement', 'Event scope', 'Event type', 'Details', 'Actor email']
    : ['Date', 'Event scope', 'Event type', 'Details', 'Actor email']
  const rows = events.map((ev) => {
    const date = formatSmartDateTime(ev.eventAt)
    const client = (ev.clientName ?? '').replace(/"/g, '""')
    const project = (ev.projectName ?? '').replace(/"/g, '""')
    const scope = eventScope(ev.eventType)
    const action = eventAction(ev.eventType)
    const details = eventDetails(ev).replace(/"/g, '""')
    const email = (ev.actorEmail ?? (ev.actorUserId ? 'User' : 'System')).replace(/"/g, '""')
    const cells = includeClientProject
      ? [date, client, project, scope, action, details, email]
      : [date, scope, action, details, email]
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

type SortCol = 'date' | 'client' | 'project' | 'eventScope' | 'eventAction' | 'actor'

const SORT_COLS: { value: SortCol; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Engagement' },
  { value: 'eventScope', label: 'Event scope' },
  { value: 'eventAction', label: 'Event type' },
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

  const [scopeFilter, setScopeFilter] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string[]>([])
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)

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
  const [actorFilter, setActorFilter] = useState<string[]>([])
  const [actorMenuOpen, setActorMenuOpen] = useState(false)
  const [actorSearch, setActorSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const resolvedEventTypes = useMemo(() => {
    const scopeTypes = scopeFilter.flatMap((s) => SCOPE_TO_EVENT_TYPES[s] ?? [])
    const actionTypes = actionFilter.flatMap((a) => {
      const opt = EVENT_ACTION_OPTIONS.find((o) => o.value === a)
      return opt ? [...opt.eventTypes] : []
    })
    if (!scopeFilter.length && !actionFilter.length) return []
    if (!scopeFilter.length) return actionTypes
    if (!actionFilter.length) return scopeTypes
    return scopeTypes.filter((t) => (actionTypes as string[]).includes(t))
  }, [scopeFilter, actionFilter])

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

  const selectedScopeLabel = useMemo(() => {
    if (scopeFilter.length === 0) return 'All scopes'
    if (scopeFilter.length === 1) return SCOPE_OPTIONS.find((o) => o.value === scopeFilter[0])?.label ?? '1 scope'
    return `${scopeFilter.length} scopes`
  }, [scopeFilter])

  const selectedActionLabel = useMemo(() => {
    if (actionFilter.length === 0) return 'All types'
    if (actionFilter.length === 1) return EVENT_ACTION_OPTIONS.find((o) => o.value === actionFilter[0])?.label ?? '1 type'
    return `${actionFilter.length} types`
  }, [actionFilter])

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
        eventTypes: resolvedEventTypes.length ? resolvedEventTypes : undefined,
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
      resolvedEventTypes,
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
        else setEvents((prev) => {
          const seen = new Set(prev.map((e: AuditEventRow) => e.id))
          return [...prev, ...list.filter((e: AuditEventRow) => !seen.has(e.id))]
        })
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
  }, [fromDate, toDate, scopeFilter, actionFilter, clientIdsFilter, projectIdsFilter, showClientProjectFilters, dateRangeError])

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

  const uniqueActors = useMemo(() => {
    const seen = new Set<string>()
    const actors: { id: string; name: string; email: string }[] = []
    for (const ev of events) {
      if (ev.actorUserId && !seen.has(ev.actorUserId)) {
        seen.add(ev.actorUserId)
        actors.push({
          id: ev.actorUserId,
          name: ev.actorName || ev.actorEmail || 'Unknown',
          email: ev.actorEmail ?? '',
        })
      }
    }
    return actors.sort((a, b) => a.name.localeCompare(b.name))
  }, [events])

  const filteredActors = useMemo(() => {
    const q = actorSearch.trim().toLowerCase()
    if (!q) return uniqueActors
    return uniqueActors.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
  }, [uniqueActors, actorSearch])

  const selectedActorLabel = useMemo(() => {
    if (actorFilter.length === 0) return 'All actors'
    if (actorFilter.length === 1) {
      const a = uniqueActors.find((a) => a.id === actorFilter[0])
      return a?.name ?? '1 actor'
    }
    return `${actorFilter.length} actors`
  }, [actorFilter, uniqueActors])

  const visibleEvents = useMemo(() => {
    let list = events
    if (actorFilter.length > 0) {
      list = list.filter((ev) => ev.actorUserId && actorFilter.includes(ev.actorUserId))
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
      } else if (sortCol === 'eventScope') {
        va = eventScope(a.eventType); vb = eventScope(b.eventType)
      } else if (sortCol === 'eventAction') {
        va = eventAction(a.eventType); vb = eventAction(b.eventType)
      } else {
        va = a.actorName ?? a.actorEmail ?? ''; vb = b.actorName ?? b.actorEmail ?? ''
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [events, actorFilter, sortCol, sortDir])

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-xs text-gray-500 mb-3">Audit history is permanent and cannot be edited.</p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">From date</label>
          <DateTimePicker
            key={`from-${pickerResetKey}`}
            value={fromDate}
            defaultTime="23:59"
            allowFutureDateTimes={false}
            placeholder="From date"
            className="w-[190px]"
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
            className="w-[190px]"
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
          <label className="text-xs font-medium text-gray-600">Event scope</label>
          <DropdownMenu open={scopeMenuOpen} onOpenChange={setScopeMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2"
              >
                <span className="truncate">{selectedScopeLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px] p-0">
              <div className="max-h-[280px] overflow-y-auto py-1">
                <button
                  type="button"
                  className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                  onClick={(e) => { e.preventDefault(); setScopeFilter([]) }}
                >
                  <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                    <Check className={`h-3 w-3 ${scopeFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                  </span>
                  All scopes
                </button>
                {SCOPE_OPTIONS.map((o) => {
                  const checked = scopeFilter.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                      onClick={(e) => { e.preventDefault(); setScopeFilter(toggleId(scopeFilter, o.value)) }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      <span>{o.label}</span>
                    </button>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Event type</label>
          <DropdownMenu open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2"
              >
                <span className="truncate">{selectedActionLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px] p-0">
              <div className="max-h-[280px] overflow-y-auto py-1">
                <button
                  type="button"
                  className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                  onClick={(e) => { e.preventDefault(); setActionFilter([]) }}
                >
                  <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                    <Check className={`h-3 w-3 ${actionFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                  </span>
                  All types
                </button>
                {EVENT_ACTION_OPTIONS.map((o) => {
                  const checked = actionFilter.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                      onClick={(e) => { e.preventDefault(); setActionFilter(toggleId(actionFilter, o.value)) }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      <span>{o.label}</span>
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
                    className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2"
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
                      className="flex-1 rounded border border-slate-300/80 px-2 py-1.5 text-xs"
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
                    className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2"
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
                      className="flex-1 rounded border border-slate-300/80 px-2 py-1.5 text-xs"
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
          <DropdownMenu open={actorMenuOpen} onOpenChange={setActorMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2"
              >
                <span className="truncate">{selectedActorLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] p-0">
              <div className="px-2 py-2 flex items-center gap-2 border-b border-gray-100">
                <input
                  value={actorSearch}
                  onChange={(e) => setActorSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search actors…"
                  className="flex-1 rounded border border-slate-300/80 px-2 py-1.5 text-xs"
                />
                <Button
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    setActorMenuOpen(false)
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
                    setActorFilter([])
                  }}
                >
                  <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                    <Check className={`h-3 w-3 ${actorFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                  </span>
                  All actors
                </button>
                {filteredActors.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400 italic">No actors in loaded events</p>
                )}
                {filteredActors.map((actor) => {
                  const checked = actorFilter.includes(actor.id)
                  return (
                    <button
                      key={actor.id}
                      type="button"
                      className="w-full px-2 py-1 text-xs flex items-center gap-2 hover:bg-gray-50"
                      onClick={(e) => {
                        e.preventDefault()
                        setActorFilter(toggleId(actorFilter, actor.id))
                      }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center shrink-0">
                        <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      <UserAvatarWithTooltip
                        displayName={actor.name}
                        email={actor.email}
                        avatarSize="sm"
                        showRole={false}
                      />
                      <span className="truncate">{actor.name}</span>
                    </button>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
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
                    setScopeFilter([])
                    setActionFilter([])
                    setClientIdsFilter([])
                    setProjectIdsFilter([])
                    setActorFilter([])
                    setActorSearch('')
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

      <div className="flex-1 overflow-auto min-h-0 bg-white border border-[#e5e7eb] rounded">
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
            <thead className="bg-white border-b border-[#e5e7eb] sticky top-0">
              <tr>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[160px]">
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
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[120px]">Client</th>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[120px]">Engagement</th>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[130px]">Event scope</th>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[130px]">Event type</th>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] min-w-[80px]">Details</th>
                <th className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c] w-[200px]">Actor</th>
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
            <tbody className="divide-y divide-[#e5e7eb]">
              {visibleEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-[#f9f9fb] transition-colors">
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <TooltipProvider>
                      <RelativeDateTime
                        date={ev.eventAt}
                        displayFormat={showFullDate ? 'verbose' : 'short'}
                        tooltipSide="right"
                        textClassName="text-[#45474c] text-[0.8125rem]"
                      />
                    </TooltipProvider>
                  </td>
                  <td className="py-2.5 px-3 text-[#45474c] text-[0.8125rem] max-w-[120px] truncate" title={ev.clientName ?? ''}>
                    {ev.clientName ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 text-[#45474c] text-[0.8125rem] max-w-[120px] truncate" title={ev.projectName ?? ''}>
                    {ev.projectName ?? '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <EventIcon eventType={ev.eventType} />
                      <span className="text-[#45474c] text-[0.8125rem]">{eventScope(ev.eventType)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-[#1b1b1d] text-[0.8125rem]">{eventAction(ev.eventType)}</span>
                  </td>
                  <td className="py-2.5 px-3 text-[0.8125rem]">
                    <DetailCell ev={ev} />
                  </td>
                  <td className="py-2.5 px-3 text-[0.8125rem]">
                    {ev.actorUserId ? (
                      <div className="flex items-center gap-1.5">
                        <UserAvatarWithTooltip
                          displayName={ev.actorName || ev.actorEmail || 'Unknown'}
                          email={ev.actorEmail ?? undefined}
                          avatarSize="sm"
                        />
                        <span className="text-[#45474c] truncate max-w-[160px]">{ev.actorName || ev.actorEmail || 'Unknown'}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">System</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2" />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-3 border-t border-[#e5e7eb]">
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
      </div>
    </div>
  )
}

