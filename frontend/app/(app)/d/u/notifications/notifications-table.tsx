"use client"

import { useState, useMemo, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import {
  Trash2,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Filter,
  Megaphone,
  ExternalLink,
  RotateCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NotificationItem = {
  id: string
  createdAt: string
  type: string
  priority?: 'INFO' | 'WARNING' | 'CRITICAL' | null
  title: string
  body: string | null
  ctaUrl: string | null
  readAt: string | null
  clientId?: string | null
  projectId?: string | null
  documentId?: string | null
  metadata?: Record<string, unknown>
}

type StatusFilter = 'all' | 'unread' | 'read'
type ScopeFilter = 'all' | 'org' | 'client' | 'project' | 'document'
type PriorityFilter = 'all' | 'CRITICAL' | 'WARNING' | 'INFO'
type SortField = 'date' | 'title'
type SortDir = 'asc' | 'desc'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Any status', unread: 'Unread', read: 'Read',
}
const SCOPE_LABELS: Record<ScopeFilter, string> = {
  all: 'Any scope', org: 'Org', client: 'Client', project: 'Project', document: 'Document',
}
const PRIORITY_LABELS: Record<PriorityFilter, string> = {
  all: 'Any priority', CRITICAL: 'Critical', WARNING: 'Warning', INFO: 'Info',
}

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-700',
  WARNING:  'bg-amber-50 text-amber-700',
  INFO:     'bg-[#f3f4f6] text-[#45474c]',
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-rose-600',
  WARNING:  'bg-amber-500',
  INFO:     'bg-emerald-500',
}

function getScope(n: NotificationItem): ScopeFilter {
  const explicit = (n.metadata?.scope as string | undefined)
  if (explicit === 'user' || explicit === 'org' || explicit === 'client' || explicit === 'project' || explicit === 'document') return explicit as ScopeFilter
  if (n.documentId) return 'document'
  if (n.projectId) return 'project'
  if (n.clientId) return 'client'
  return 'org'
}

function getPriority(n: NotificationItem): 'INFO' | 'WARNING' | 'CRITICAL' {
  const explicit = n.priority ?? (n.metadata?.priority as string | undefined)
  if (explicit === 'INFO' || explicit === 'WARNING' || explicit === 'CRITICAL') return explicit
  if (n.type === 'BROADCAST' || n.metadata?.broadcast) return 'CRITICAL'
  return 'INFO'
}

const COLS = '1fr 10% 10% 10% 18% 9%'

type Props = { initialNotifications: NotificationItem[]; onRefresh?: () => Promise<void> }

export function NotificationsTable({ initialNotifications, onRefresh }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [refreshing, setRefreshing] = useState(false)

  // Sync when parent re-fetches (e.g. after broadcast send)
  useEffect(() => { setNotifications(initialNotifications) }, [initialNotifications])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [actingId, setActingId] = useState<string | null>(null)

  const hasActiveFilters = statusFilter !== 'all' || scopeFilter !== 'all' || priorityFilter !== 'all'

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  function clearAll() { setStatusFilter('all'); setScopeFilter('all'); setPriorityFilter('all') }

  const filtered = useMemo(() => {
    return [...notifications]
      .filter((n) => {
        if (statusFilter === 'unread' && n.readAt) return false
        if (statusFilter === 'read' && !n.readAt) return false
        if (scopeFilter !== 'all' && getScope(n) !== scopeFilter) return false
        if (priorityFilter !== 'all' && getPriority(n) !== priorityFilter) return false
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortField === 'date') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        else cmp = a.title.localeCompare(b.title)
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [notifications, statusFilter, scopeFilter, priorityFilter, sortField, sortDir])

  async function handleMarkRead(id: string) {
    setActingId(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids: [id] }),
      })
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    } finally {
      setActingId(null)
    }
  }

  async function handleDelete(id: string) {
    setActingId(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids: [id] }),
      })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } finally {
      setActingId(null)
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 text-[#9ca3af]" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-[#069668]" />
      : <ChevronDown className="h-3 w-3 text-[#069668]" />
  }

  function FilterDropdown<T extends string>({
    label, value, options, onChange,
  }: {
    label: string
    value: T
    options: Record<T, string>
    onChange: (v: T) => void
  }) {
    const isActive = value !== 'all'
    const keys = Object.keys(options) as T[]
    const [first, ...rest] = keys
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={`h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors ${isActive ? 'border-slate-400 ring-1 ring-slate-300' : ''}`}>
            <Filter className="h-3 w-3 opacity-60" />
            {label}
            {isActive && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px] py-1 text-xs rounded-[2px]">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">{label}</DropdownMenuLabel>
            <DropdownMenuItem className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer" onSelect={() => {}}>Done</DropdownMenuItem>
          </div>
          <DropdownMenuCheckboxItem checked={value === first} onCheckedChange={() => onChange(first)} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
            {options[first]}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {rest.map((key) => (
            <DropdownMenuCheckboxItem key={key} checked={value === key} onCheckedChange={() => onChange(value === key ? first : key)} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
              {options[key]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown label="Status" value={statusFilter} options={STATUS_LABELS} onChange={setStatusFilter} />
        <FilterDropdown label="Scope" value={scopeFilter} options={SCOPE_LABELS} onChange={setScopeFilter} />
        <FilterDropdown label="Priority" value={priorityFilter} options={PRIORITY_LABELS} onChange={setPriorityFilter} />
        {hasActiveFilters && (
          <button type="button" onClick={clearAll} className="h-8 px-2.5 text-xs rounded-[2px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
            Clear all
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[0.8125rem] text-[#45474c]">
            {filtered.length} {filtered.length === 1 ? 'notification' : 'notifications'}
          </span>
          {onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false) }}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-[2px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors"
              title="Refresh"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        {/* Column headers */}
        <div className="grid items-center bg-white border-b border-[#e5e7eb] px-4 gap-3" style={{ gridTemplateColumns: COLS }}>
          <button type="button" onClick={() => toggleSort('title')} className="flex items-center gap-1 py-2.5 text-[0.8125rem] font-medium text-[#45474c] select-none text-left">
            Title <SortIcon field="title" />
          </button>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Priority</span>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Scope</span>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Status</span>
          <button type="button" onClick={() => toggleSort('date')} className="flex items-center gap-1 py-2.5 text-[0.8125rem] font-medium text-[#45474c] select-none text-left">
            Date <SortIcon field="date" />
          </button>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none" />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[0.8125rem] text-[#45474c]">
            No notifications match the current filters.
          </div>
        ) : (
          filtered.map((n) => {
            const priority = getPriority(n)
            const scope = getScope(n)
            const isActing = actingId === n.id
            const isBroadcast = n.type === 'BROADCAST' || Boolean(n.metadata?.broadcast)
            return (
              <div
                key={n.id}
                className={`grid items-center px-4 gap-3 border-b border-[#e5e7eb] hover:bg-[#f9f9fb] transition-colors ${isActing ? 'opacity-50' : ''} ${n.readAt ? 'opacity-60' : ''}`}
                style={{ gridTemplateColumns: COLS, borderLeftWidth: '3px', borderLeftColor: n.readAt ? '#e5e7eb' : (priority === 'CRITICAL' ? 'rgb(225 29 72)' : priority === 'WARNING' ? 'rgb(245 158 11)' : 'rgb(34 197 94)') }}
              >
                {/* Title */}
                <div className="flex items-center gap-2 min-w-0 py-2.5">
                  {!n.readAt && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`} />}
                  <div className="min-w-0">
                    <p className={`text-[0.8125rem] truncate ${n.readAt ? 'font-medium text-[#45474c]' : 'font-semibold text-[#1b1b1d]'}`}>
                      {isBroadcast && <Megaphone className="inline h-3 w-3 mr-1 text-[#45474c]" />}
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-[#9ca3af] truncate mt-0.5">{n.body}</p>}
                  </div>
                </div>
                {/* Priority */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold leading-none w-fit ${PRIORITY_BADGE[priority]}`}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </span>
                {/* Scope */}
                <span className="text-[0.8125rem] text-[#45474c] capitalize">{scope}</span>
                {/* Status */}
                <span className="text-[0.8125rem] text-[#45474c]">{n.readAt ? 'Read' : 'Unread'}</span>
                {/* Date */}
                <span className="text-[0.8125rem] text-[#45474c]">
                  {new Date(n.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  {n.ctaUrl && (
                    <a href={n.ctaUrl} className="inline-flex items-center justify-center h-7 w-7 rounded-[2px] border border-[#e5e7eb] bg-white text-[#45474c] hover:text-[#069668] hover:border-[#069668]/40 transition-colors" title="Open link">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {!n.readAt && (
                    <button type="button" disabled={isActing} onClick={() => handleMarkRead(n.id)} title="Mark read" className="inline-flex items-center justify-center h-7 w-7 rounded-[2px] border border-[#e5e7eb] bg-white text-[#45474c] hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-40 transition-colors">
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" disabled={isActing} onClick={() => handleDelete(n.id)} title="Delete" className="inline-flex items-center justify-center h-7 w-7 rounded-[2px] border border-[#e5e7eb] bg-white text-[#45474c] hover:text-red-600 hover:border-red-300 disabled:opacity-40 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
