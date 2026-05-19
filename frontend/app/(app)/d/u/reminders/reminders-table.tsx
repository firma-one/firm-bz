"use client"

import { useState, useMemo } from "react"
import { markReminderDone, getUserReminders, type ReminderWithContext } from "@/lib/actions/user-reminders"
import {
  Users,
  CalendarClock,
  Building2,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react"

const ENTITY_ICONS: Record<string, React.ElementType> = {
  'platform.clients': Users,
  'platform.engagements': CalendarClock,
  'platform.firms': Building2,
  'platform.documents': FileText,
}

function entityIcon(entityKey: string): React.ElementType {
  const k = entityKey.split('.').slice(0, 2).join('.')
  return ENTITY_ICONS[k] ?? CalendarClock
}

type StatusFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no-date'
type EntityFilter = 'all' | 'client' | 'engagement'
type SortField = 'date' | 'name'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<ReminderWithContext['labelStyle'], string> = {
  slate:  'bg-[#f3f4f6] text-[#45474c]',
  amber:  'bg-[#FDF0EA] text-[#C4572B]',
  orange: 'bg-[#FBDDD1] text-[#A33D1E]',
  red:    'bg-[#F9C8BE] text-[#7A2414]',
}

function matchesStatusFilter(r: ReminderWithContext, f: StatusFilter): boolean {
  if (f === 'all') return true
  if (f === 'no-date') return r.delta === null
  if (f === 'overdue') return r.delta !== null && r.delta < 0
  if (f === 'today') return r.delta === 0
  if (f === 'upcoming') return r.delta !== null && r.delta > 0
  return true
}

function matchesEntityFilter(r: ReminderWithContext, f: EntityFilter): boolean {
  if (f === 'all') return true
  if (f === 'client') return r.entityKey.includes('clients')
  if (f === 'engagement') return r.entityKey.includes('engagement')
  return true
}

const COLS = '1fr 14% 13% 13% 14% 9%'

type Props = { initialReminders: ReminderWithContext[] }

export function RemindersTable({ initialReminders }: Props) {
  const [reminders, setReminders] = useState(initialReminders)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [actingId, setActingId] = useState<string | null>(null)

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const visible = reminders.filter((r) => r.hiddenAt === null)
    const f = visible
      .filter((r) => matchesStatusFilter(r, statusFilter))
      .filter((r) => matchesEntityFilter(r, entityFilter))
    return [...f].sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        if (!a.dateValue && !b.dateValue) cmp = 0
        else if (!a.dateValue) cmp = 1
        else if (!b.dateValue) cmp = -1
        else cmp = new Date(a.dateValue).getTime() - new Date(b.dateValue).getTime()
      } else {
        cmp = a.entityName.localeCompare(b.entityName)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [reminders, statusFilter, entityFilter, sortField, sortDir])

  async function handleMarkDone(id: string) {
    setActingId(id)
    try {
      await markReminderDone(id)
      const refreshed = await getUserReminders()
      setReminders(refreshed)
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

  return (
    <div className="px-6 py-6">
      <div className="bg-white border border-[#e5e7eb] rounded-[2px] overflow-hidden">
        {/* Filters + count */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e5e7eb] bg-[#f9f9fb] flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[0.75rem] font-medium text-[#45474c]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-7 rounded-[2px] border border-[#e5e7eb] bg-white px-2 text-[0.75rem] text-[#1b1b1d] focus:outline-none focus:ring-1 focus:ring-[#069668]"
            >
              <option value="all">All</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Upcoming</option>
              <option value="no-date">No date</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[0.75rem] font-medium text-[#45474c]">Type</label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
              className="h-7 rounded-[2px] border border-[#e5e7eb] bg-white px-2 text-[0.75rem] text-[#1b1b1d] focus:outline-none focus:ring-1 focus:ring-[#069668]"
            >
              <option value="all">All types</option>
              <option value="client">Client</option>
              <option value="engagement">Engagement</option>
            </select>
          </div>
          <div className="ml-auto text-[0.75rem] text-[#45474c]">
            {filtered.length} {filtered.length === 1 ? 'reminder' : 'reminders'}
          </div>
        </div>

        {/* Column headers */}
        <div
          className="grid items-center bg-[#f9f9fb] border-b border-[#e5e7eb] px-4 gap-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <button
            type="button"
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 h-9 text-[0.75rem] font-semibold text-[#45474c] hover:text-[#1b1b1d] text-left"
          >
            Entity <SortIcon field="name" />
          </button>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Action</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className="flex items-center gap-1 h-9 text-[0.75rem] font-semibold text-[#45474c] hover:text-[#1b1b1d] text-left"
          >
            Due date <SortIcon field="date" />
          </button>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Status</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Note</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]" />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[0.8125rem] text-[#45474c]">
            No reminders match the current filters.
          </div>
        ) : (
          filtered.map((r) => {
            const Icon = entityIcon(r.entityKey)
            const isActing = actingId === r.id
            return (
              <div
                key={r.id}
                className={`grid items-center h-10 px-4 gap-3 border-b border-[#e5e7eb] hover:bg-[#f9f9fb] transition-colors ${isActing ? 'opacity-50' : ''}`}
                style={{ gridTemplateColumns: COLS }}
              >
                <a href={r.ctaUrl ?? '#'} className="flex items-center gap-2 min-w-0 group">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                  <span className="text-[0.8125rem] font-medium text-[#1b1b1d] truncate group-hover:text-[#069668] transition-colors">
                    {r.entityName}
                  </span>
                </a>
                <span className="text-[0.8125rem] text-[#45474c] truncate">{r.action}</span>
                <span className="text-[0.8125rem] text-[#45474c]">
                  {r.dateValue
                    ? new Date(r.dateValue).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
                    : <span className="text-[#9ca3af]">—</span>
                  }
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold leading-none w-fit ${STATUS_COLORS[r.labelStyle]}`}>
                  {r.label || 'No date'}
                </span>
                <span className="text-[0.8125rem] text-[#45474c] truncate">
                  {r.note || <span className="text-[#9ca3af]">—</span>}
                </span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleMarkDone(r.id)}
                    title="Mark done"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] border border-[#e5e7eb] bg-white text-[0.75rem] text-[#45474c] hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-40 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Done
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
