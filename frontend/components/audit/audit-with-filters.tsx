'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Building2,
  Check,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  FolderLock,
  Layers,
  Activity,
  Clock3,
  Type,
  User,
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
import { EmptyPanel } from '@/components/ui/empty-panel'
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
  Hint,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  NotionTable,
  NotionTableActions,
  NotionTableActionsHead,
  NotionTableBody,
  NotionTableCell,
  NotionTableHead,
  NotionTableHeader,
  NotionTableRow,
} from '@/components/ui/notion-table'
import { Tag } from '@/components/ui/tag'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { FilterMenuLabel, FilterMenuRow, FilterMenuSearch, FilterPill, summarizePicks } from '@/components/ui/filter-pill'
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

/** Client, Engagement and Actor menus get a search box once their list is longer than this. */
const MENU_SEARCH_THRESHOLD = 7

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
  { value: 'DOCUMENT_RESTORED', label: 'File restored' },
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
    'DOCUMENT_CREATED', 'DOCUMENT_CHANGED', 'DOCUMENT_DELETED', 'DOCUMENT_RESTORED', 'DOCUMENT_MOVED',
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
    value: 'RESTORED', label: 'Restored',
    eventTypes: ['DOCUMENT_RESTORED'],
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

/**
 * Who authorized an agent-performed change, as a trailing clause.
 *
 * An event whose actor is the Brio agent was still authorized by a person — the agent proposes,
 * a lead approves, the agent acts. Without this the Details column reads as though a machine
 * changed a client's files unprompted, which is the one reading an audit trail must never allow.
 */
function approvalSuffix(m: Record<string, unknown>): string {
  if (!m.viaAgent) return ''
  const by = typeof m.approvedByLabel === 'string' ? m.approvedByLabel
    : typeof m.approvedBy === 'string' ? m.approvedBy
    : null
  // Older rows predate the approver being recorded. Saying "approved by unknown" would be worse
  // than saying only that the agent acted, so those keep the plain agent marker.
  return by ? ` · approved by ${by}` : ' · via agent'
}

export function eventDetails(ev: AuditEventRow): string {
  const m = ev.metadata as Record<string, unknown> | undefined
  if (!m || typeof m !== 'object') return ''
  const approval = approvalSuffix(m)
  // `filename` is how the download-share route named the file before it also recorded `fileName`.
  const fileName = (m.fileName as string | undefined) || (m.filename as string | undefined)
  const description = m.description as string | undefined
  const name = m.name as string | undefined
  const action = m.action as string | undefined
  const changedFields = Array.isArray(m.changedFields) ? (m.changedFields as string[]) : undefined
  const contactName = m.contactName as string | undefined
  const role = m.newRole as string | undefined
  const invitedEmail = m.invitedEmail as string | undefined
  // A rename is the one case where the old value is as important as the new one: "Report.docx"
  // alone does not say what it used to be called, which is what a reviewer is checking.
  const previousName = m.previousName as string | undefined
  if (fileName) {
    return (previousName && previousName !== fileName
      ? `${previousName} → ${fileName}`
      : fileName) + approval
  }
  if (description) return description + approval
  if (name) return name + approval
  if (action) return action + approval
  if (contactName) return contactName + approval
  if (invitedEmail) return invitedEmail + approval
  if (role) return `→ ${role}${approval}`
  if (changedFields?.length) return `Changed: ${changedFields.join(', ')}${approval}`
  if (m.newStatus) return `Status: ${m.oldStatus ?? '—'} → ${m.newStatus}${approval}`
  if (approval) return approval.replace(/^ · /, '')
  // Never raw JSON: a file event whose name could not be found says so, and anything else shows
  // its plain values — ids left out, since they mean nothing to a reader.
  if (ev.eventType.startsWith('DOCUMENT_')) return 'File name not recorded'
  return readableMetadata(m)
}

/** "Key value · Key value" for an event's simple values, leaving out ids. */
function readableMetadata(m: Record<string, unknown>): string {
  return Object.entries(m)
    .filter(([key, value]) => !/id$/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value) && value !== '')
    .map(([key, value]) => {
      const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
      return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${String(value)}`
    })
    .join(' · ')
}

function EventIcon({ eventType }: { eventType: string }) {
  if (eventType.startsWith('ONBOARDING_')) return <Rocket className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('FIRM_MEMBER_')) return <UserPlus className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('FIRM_')) return <Building2 className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('CLIENT_CONTACT_')) return <MessageSquare className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('CLIENT_MEMBER_')) return <UserPlus className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('CLIENT_')) return <Users className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('ENGAGEMENT_MEMBER_')) return <UserPlus className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('ENGAGEMENT_')) return <Briefcase className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType === 'DOCUMENT_OPENED') return <Eye className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType === 'DOCUMENT_DOWNLOADED' || eventType === 'DOCUMENT_SHARE_DOWNLOADED') return <Download className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType === 'AUDIT_LOG_EXPORTED') return <ClipboardList className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('DOCUMENT_SHARE_')) return <Share2 className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('DOCUMENT_COMMENT_')) return <MessageSquare className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType === 'DOCUMENT_FINALIZED' || eventType === 'DOCUMENT_LOCKED') return <Lock className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType === 'DOCUMENT_STATUS_CHANGED' || eventType.includes('STATUS')) return <RefreshCw className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.includes('SHARED') || eventType === 'SHARED_EXT') return <Share2 className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.includes('LOCKED') || eventType.includes('CLOSED')) return <Lock className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.includes('UPLOAD') || eventType.includes('DOCUMENT_ADDED') || eventType === 'DOCUMENT_CREATED') return <FileUp className="h-3.5 w-3.5 text-fg-subtle" />
  if (eventType.startsWith('DOCUMENT_')) return <FileText className="h-3.5 w-3.5 text-fg-subtle" />
  return <FileText className="h-3.5 w-3.5 text-fg-subtle" />
}

function isJsonObject(s: string): boolean {
  return s.trim().startsWith('{') || s.trim().startsWith('[')
}

function DetailCell({ ev }: { ev: AuditEventRow }) {
  const [copied, setCopied] = React.useState(false)
  const raw = eventDetails(ev)
  if (!raw) return <span className="text-fg-subtle">—</span>

  const isJson = isJsonObject(raw)
  // The approval clause is a note on the item, so it reads muted after the item's name.
  const approval = approvalSuffix(ev.metadata ?? {})
  const note = approval && raw.endsWith(approval) ? approval : ''
  const main = note ? raw.slice(0, -note.length) : raw

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group flex min-w-0 items-center gap-1.5">
      {isJson ? (
        <code className="block min-w-0 truncate rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg-muted" title={raw}>
          {raw}
        </code>
      ) : (
        <span className="min-w-0 truncate text-fg" title={raw}>
          {main}
          {note && <span className="text-fg-muted">{note}</span>}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-surface-hover"
        title="Copy"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3 text-fg-subtle" />
        }
      </button>
    </div>
  )
}

const DELETED_EVENT_TYPES: readonly string[] = EVENT_ACTION_OPTIONS.find((a) => a.value === 'DELETED')?.eventTypes ?? []

/** What happened: the scope's icon, then the action as a tag. Only a deletion is red. */
function EventCell({ eventType }: { eventType: string }) {
  const scope = eventScope(eventType)
  const icon = <span className="flex shrink-0"><EventIcon eventType={eventType} /></span>
  return (
    <div className="flex items-center gap-2">
      {scope === '—' ? icon : <Hint label={`${scope} event`}>{icon}</Hint>}
      <Tag color={DELETED_EVENT_TYPES.includes(eventType) ? 'red' : 'gray'}>{eventAction(eventType)}</Tag>
    </div>
  )
}

/** Client › Engagement in one column, so neither truncates the other away. Firm events name the firm. */
function WhereCell({ ev, firmName }: { ev: AuditEventRow; firmName: string }) {
  if (!ev.clientName && !ev.projectName) {
    return eventScope(ev.eventType) === 'Firm'
      ? <span className="block truncate text-fg-muted" title={firmName}>{firmName}</span>
      : <span className="text-fg-subtle">—</span>
  }
  const path = [ev.clientName, ev.projectName].filter(Boolean).join(' › ')
  return (
    <div className="flex min-w-0 items-center gap-1" title={path}>
      {ev.clientName && <span className={ev.projectName ? 'max-w-[50%] shrink-0 truncate text-fg-muted' : 'min-w-0 truncate text-fg'}>{ev.clientName}</span>}
      {ev.clientName && ev.projectName && <span className="shrink-0 text-fg-subtle">›</span>}
      {ev.projectName && <span className="min-w-0 truncate text-fg">{ev.projectName}</span>}
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
      
      {/* Filters — Notion's filter-bar pills and menus, the same parts as Doc Search and the
          Files toolbar (components/ui/filter-pill.tsx). Every list filter here is multi-select:
          checkbox rows that stay open. The dates stay inline, shaped as pills. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <DateTimePicker
          key={`from-${pickerResetKey}`}
          value={fromDate}
          defaultTime="23:59"
          allowFutureDateTimes={false}
          placeholder="From date"
          className="h-7 w-[168px] rounded-full border-line px-2.5 text-small"
          onChange={(iso) => {
            setFromDate(iso)
            if (iso && toDate && new Date(iso) > new Date(toDate)) {
              setDateRangeError('From must be before To')
            } else {
              setDateRangeError(null)
            }
          }}
        />
        <DateTimePicker
          key={`to-${pickerResetKey}`}
          value={toDate}
          defaultTime="23:59"
          placeholder="To date"
          className="h-7 w-[168px] rounded-full border-line px-2.5 text-small"
          onChange={(iso) => {
            if (iso && fromDate && new Date(iso) < new Date(fromDate)) {
              setDateRangeError('To must be after From')
              return
            }
            setDateRangeError(null)
            setToDate(iso)
          }}
        />

        {dateRangeError && (
          <p className="text-small text-danger">{dateRangeError}</p>
        )}

        <DropdownMenu open={scopeMenuOpen} onOpenChange={setScopeMenuOpen}>
          <DropdownMenuTrigger asChild>
            <FilterPill
              icon={<Layers />}
              label="Scope"
              value={scopeFilter.length
                ? summarizePicks(SCOPE_OPTIONS.filter((o) => scopeFilter.includes(o.value)).map((o) => o.label))
                : undefined}
              onClear={() => setScopeFilter([])}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px] p-1">
            <FilterMenuLabel>Scope</FilterMenuLabel>
            <FilterMenuRow multi selected={scopeFilter.length === 0} onSelect={() => setScopeFilter([])}>
              Any scope
            </FilterMenuRow>
            <DropdownMenuSeparator className="mx-0 my-1" />
            {SCOPE_OPTIONS.map((o) => (
              <FilterMenuRow key={o.value} multi selected={scopeFilter.includes(o.value)} onSelect={() => setScopeFilter(toggleId(scopeFilter, o.value))}>
                {o.label}
              </FilterMenuRow>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
          <DropdownMenuTrigger asChild>
            <FilterPill
              icon={<Activity />}
              label="Type"
              value={actionFilter.length
                ? summarizePicks(EVENT_ACTION_OPTIONS.filter((o) => actionFilter.includes(o.value)).map((o) => o.label))
                : undefined}
              onClear={() => setActionFilter([])}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px] p-1">
            <FilterMenuLabel>Type</FilterMenuLabel>
            <FilterMenuRow multi selected={actionFilter.length === 0} onSelect={() => setActionFilter([])}>
              Any type
            </FilterMenuRow>
            <DropdownMenuSeparator className="mx-0 my-1" />
            <div className="max-h-[280px] overflow-y-auto overflow-x-hidden">
              {EVENT_ACTION_OPTIONS.map((o) => (
                <FilterMenuRow key={o.value} multi selected={actionFilter.includes(o.value)} onSelect={() => setActionFilter(toggleId(actionFilter, o.value))}>
                  {o.label}
                </FilterMenuRow>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {showClientProjectFilters && (
          <>
            <DropdownMenu open={clientMenuOpen} onOpenChange={setClientMenuOpen}>
              <DropdownMenuTrigger asChild>
                <FilterPill
                  icon={<Users />}
                  label="Client"
                  value={clientIdsFilter.length
                    ? summarizePicks(clientIdsFilter.map((id) => clients.find((c) => c.id === id)?.name ?? 'Client'))
                    : undefined}
                  onClear={() => {
                    setClientIdsFilter([])
                    setProjectIdsFilter([])
                  }}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[260px] p-1">
                <FilterMenuLabel>Client</FilterMenuLabel>
                {clients.length > MENU_SEARCH_THRESHOLD && (
                  <FilterMenuSearch
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients…"
                    aria-label="Search clients"
                  />
                )}
                <FilterMenuRow
                  multi
                  selected={clientIdsFilter.length === 0}
                  onSelect={() => {
                    setClientIdsFilter([])
                    setProjectIdsFilter([])
                  }}
                >
                  Any client
                </FilterMenuRow>
                <DropdownMenuSeparator className="mx-0 my-1" />
                <div className="max-h-[280px] overflow-y-auto overflow-x-hidden">
                  {filteredClients.map((c) => (
                    <FilterMenuRow
                      key={c.id}
                      multi
                      selected={clientIdsFilter.includes(c.id)}
                      onSelect={() => {
                        const next = toggleId(clientIdsFilter, c.id)
                        setClientIdsFilter(next)
                        // changing client selection invalidates engagement selection
                        setProjectIdsFilter((prev) =>
                          prev.filter((pid) => projects.find((p) => p.id === pid && next.includes(p.clientId ?? '')))
                        )
                      }}
                    >
                      {c.name}
                    </FilterMenuRow>
                  ))}
                  {filteredClients.length === 0 && <p className="px-2 py-1.5 text-small text-fg-subtle">No matches</p>}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
              <DropdownMenuTrigger asChild>
                <FilterPill
                  icon={<Briefcase />}
                  label="Engagement"
                  value={projectIdsFilter.length
                    ? summarizePicks(projectIdsFilter.map((id) => projects.find((p) => p.id === id)?.name ?? 'Engagement'))
                    : undefined}
                  onClear={() => setProjectIdsFilter([])}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[260px] p-1">
                <FilterMenuLabel>Engagement</FilterMenuLabel>
                {projects.length > MENU_SEARCH_THRESHOLD && (
                  <FilterMenuSearch
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search engagements…"
                    aria-label="Search engagements"
                  />
                )}
                <FilterMenuRow multi selected={projectIdsFilter.length === 0} onSelect={() => setProjectIdsFilter([])}>
                  Any engagement
                </FilterMenuRow>
                <DropdownMenuSeparator className="mx-0 my-1" />
                <div className="max-h-[280px] overflow-y-auto overflow-x-hidden">
                  {filteredProjects.map((p) => (
                    <FilterMenuRow key={p.id} multi selected={projectIdsFilter.includes(p.id)} onSelect={() => setProjectIdsFilter(toggleId(projectIdsFilter, p.id))}>
                      {p.name}
                    </FilterMenuRow>
                  ))}
                  {filteredProjects.length === 0 && <p className="px-2 py-1.5 text-small text-fg-subtle">No matches</p>}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <DropdownMenu open={actorMenuOpen} onOpenChange={setActorMenuOpen}>
          <DropdownMenuTrigger asChild>
            <FilterPill
              icon={<User />}
              label="Actor"
              value={actorFilter.length
                ? summarizePicks(actorFilter.map((id) => uniqueActors.find((a) => a.id === id)?.name ?? 'Someone'))
                : undefined}
              onClear={() => setActorFilter([])}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px] p-1">
            <FilterMenuLabel>Actor</FilterMenuLabel>
            {uniqueActors.length > MENU_SEARCH_THRESHOLD && (
              <FilterMenuSearch
                value={actorSearch}
                onChange={(e) => setActorSearch(e.target.value)}
                placeholder="Search people…"
                aria-label="Search people"
              />
            )}
            <FilterMenuRow multi selected={actorFilter.length === 0} onSelect={() => setActorFilter([])}>
              Anyone
            </FilterMenuRow>
            <DropdownMenuSeparator className="mx-0 my-1" />
            <div className="max-h-[280px] overflow-y-auto overflow-x-hidden">
              {uniqueActors.length === 0 && (
                <p className="px-2 py-1.5 text-small text-fg-subtle">No one in the loaded events yet</p>
              )}
              {filteredActors.map((actor) => (
                <FilterMenuRow
                  key={actor.id}
                  multi
                  selected={actorFilter.includes(actor.id)}
                  onSelect={() => setActorFilter(toggleId(actorFilter, actor.id))}
                  icon={<UserAvatarWithTooltip displayName={actor.name} email={actor.email} avatarSize="sm" showRole={false} />}
                >
                  {actor.name}
                </FilterMenuRow>
              ))}
              {uniqueActors.length > 0 && filteredActors.length === 0 && (
                <p className="px-2 py-1.5 text-small text-fg-subtle">No matches</p>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {(fromDate || toDate || scopeFilter.length > 0 || actionFilter.length > 0 || clientIdsFilter.length > 0 || projectIdsFilter.length > 0 || actorFilter.length > 0) && (
          <button
            type="button"
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
            className="ml-0.5 h-7 rounded-full px-2 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
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
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
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
        <div className="mb-3 rounded-card bg-tag-red-bg px-3 py-2 text-small text-tag-red-fg">
          {error}
        </div>
      )}

      <div className="mb-1 flex min-h-[20px] items-center justify-between">
        {!loading && (
          <span className="text-caption text-fg-subtle">
            <span className="tabular-nums">{visibleEvents.length}</span> event{visibleEvents.length !== 1 ? 's' : ''} · audit history is permanent
            {nextCursor && <span className="text-fg-subtle"> · scroll to load more</span>}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-small text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit log…
          </div>
        ) : events.length === 0 ? (
          <EmptyPanel compact icon={<FolderLock />} title="No audit events" description="Nothing matches these filters yet." />
        ) : (
          <NotionTable scrollContainer={false} className="table-fixed">
            <NotionTableHeader className="sticky top-0 z-[1] bg-surface">
              {/* The long format ("Oct 12, 2026 · Mon, Oct 12, 2026 17:39 GMT+5:30") runs up to ~360px of text. */}
              <NotionTableHead icon={<Clock3 />} className={showFullDate ? 'w-[380px]' : 'w-[170px]'}>
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
                          className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${showFullDate ? 'bg-action' : 'bg-line-strong'}`}
                        >
                          <span className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${showFullDate ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Toggle datetime format</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              </NotionTableHead>
              <NotionTableHead icon={<Activity />} className="w-[150px]">Event</NotionTableHead>
              {showClientProjectFilters && <NotionTableHead icon={<Layers />} className="w-[120px]">Scope</NotionTableHead>}
              <NotionTableHead icon={<Type />}>Details</NotionTableHead>
              {showClientProjectFilters && <NotionTableHead icon={<Briefcase />} className="w-[240px]">Where</NotionTableHead>}
              <NotionTableHead icon={<User />} className="w-[180px]">Actor</NotionTableHead>
              <NotionTableActionsHead aria-label="Sort" className="w-8 px-1 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center h-6 w-6 rounded hover:bg-surface-hover transition-colors ${sortCol !== 'date' || sortDir !== 'desc' ? 'text-action' : 'text-fg-subtle'}`}
                      title="Sort"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="8" y2="18" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuLabel className="py-1 text-caption font-normal text-fg-subtle">Sort by</DropdownMenuLabel>
                    {SORT_COLS.filter((c) => showClientProjectFilters || (c.value !== 'client' && c.value !== 'project')).map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.value}
                        checked={sortCol === c.value}
                        onCheckedChange={() => setSortCol(c.value)}
                      >
                        {c.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="py-1 text-caption font-normal text-fg-subtle">Sort direction</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={sortDir === 'desc'}
                      onCheckedChange={() => setSortDir('desc')}
                    >
                      {sortCol === 'date' ? 'Newest first' : 'Z to A'}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={sortDir === 'asc'}
                      onCheckedChange={() => setSortDir('asc')}
                    >
                      {sortCol === 'date' ? 'Oldest first' : 'A to Z'}
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </NotionTableActionsHead>
            </NotionTableHeader>
            <NotionTableBody>
              {visibleEvents.map((ev) => (
                <NotionTableRow key={ev.id}>
                  {/* Clipped, so a date that outgrows its column truncates instead of running into Event. */}
                  <NotionTableCell className="overflow-hidden whitespace-nowrap">
                    <TooltipProvider>
                      <RelativeDateTime
                        date={ev.eventAt}
                        displayFormat={showFullDate ? 'verbose' : 'short'}
                        tooltipSide="right"
                        className="max-w-full"
                        textClassName="min-w-0 truncate text-fg-muted text-ui"
                        iconClassName="hidden"
                      />
                    </TooltipProvider>
                  </NotionTableCell>
                  <NotionTableCell>
                    <EventCell eventType={ev.eventType} />
                  </NotionTableCell>
                  {showClientProjectFilters && (
                    <NotionTableCell className="truncate text-fg-muted">{eventScope(ev.eventType)}</NotionTableCell>
                  )}
                  {/* The table is fixed, so Details takes the room the set columns leave and truncates inside it. */}
                  <NotionTableCell>
                    <DetailCell ev={ev} />
                  </NotionTableCell>
                  {showClientProjectFilters && (
                    <NotionTableCell>
                      <WhereCell ev={ev} firmName={exportTitle} />
                    </NotionTableCell>
                  )}
                  <NotionTableCell className="text-ui">
                    {ev.actorUserId ? (
                      <div className="flex items-center gap-1.5">
                        <UserAvatarWithTooltip
                          displayName={ev.actorName || ev.actorEmail || 'Unknown'}
                          email={ev.actorEmail ?? undefined}
                          avatarSize="sm"
                        />
                        <span className="text-fg-muted truncate max-w-[160px]">{ev.actorName || ev.actorEmail || 'Unknown'}</span>
                      </div>
                    ) : (
                      <span className="text-fg-subtle">System</span>
                    )}
                  </NotionTableCell>
                  <NotionTableActions aria-hidden />
                </NotionTableRow>
              ))}
            </NotionTableBody>
          </NotionTable>
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-3">
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />}
        </div>
      </div>
    </div>
  )
}

