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
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Upcoming',
  'no-date': 'No date',
}

const ENTITY_LABELS: Record<EntityFilter, string> = {
  all: 'All types',
  client: 'Client',
  engagement: 'Engagement',
}

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
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-1.5 text-xs bg-white rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors ${statusFilter !== 'all' ? 'border-[#069668] ring-1 ring-[#069668]/30 text-[#069668]' : ''}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Status{statusFilter !== 'all' && `: ${STATUS_LABELS[statusFilter]}`}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key} className="text-xs">
                  {STATUS_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-1.5 text-xs bg-white rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors ${entityFilter !== 'all' ? 'border-[#069668] ring-1 ring-[#069668]/30 text-[#069668]' : ''}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Type{entityFilter !== 'all' && `: ${ENTITY_LABELS[entityFilter]}`}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuRadioGroup value={entityFilter} onValueChange={(v) => setEntityFilter(v as EntityFilter)}>
              {(Object.keys(ENTITY_LABELS) as EntityFilter[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key} className="text-xs">
                  {ENTITY_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-[0.8125rem] text-[#45474c]">
          {filtered.length} {filtered.length === 1 ? 'reminder' : 'reminders'}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        {/* Column headers */}
        <div
          className="grid items-center bg-white border-b border-[#e5e7eb] px-4 gap-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <button
            type="button"
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 h-9 text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight hover:opacity-100 text-left transition-opacity"
          >
            Entity <SortIcon field="name" />
          </button>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Action</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className="flex items-center gap-1 h-9 text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight hover:opacity-100 text-left transition-opacity"
          >
            Due date <SortIcon field="date" />
          </button>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Status</span>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Note</span>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight" />
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
