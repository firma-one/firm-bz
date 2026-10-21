'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import { CalendarSidebar } from './calendar-sidebar'
import { CalendarEventDetailModal } from './calendar-event-detail-modal'
import { getFirmCalendarData, type CalendarData, type CalendarEvent, type CalendarEventType } from '@/lib/actions/calendar'
import { getEngagementTagColor } from '@/lib/calendar/engagement-color'
import { Briefcase, ChevronLeft, ChevronRight, FileText, Layers, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'
import { StatusIcon } from '@/components/ui/status-icon'
import { statusOf } from '@/lib/ui/status'
import './calendar-view.css'

const EVENT_TYPE_ICON: Record<CalendarEventType, typeof Briefcase> = {
  kickoff: Briefcase,
  due: Briefcase,
  followUp: Briefcase,
  deliverable: Layers,
  document: FileText,
}

const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  kickoff: 'Engagement',
  due: 'Engagement',
  followUp: 'Engagement',
  deliverable: 'Deliverable',
  document: 'Document',
}

// Stacking order for same-day events, smallest-scope first (top) to
// largest-scope last (bottom): Document, then Deliverable, then Engagement.
// Verified via isolated repro: FullCalendar's day-grid renders ascending
// eventOrder values top-to-bottom, so the lowest value must be Document.
const EVENT_TYPE_SORT_ORDER: Record<CalendarEventType, number> = {
  document: 0,
  deliverable: 1,
  kickoff: 2,
  due: 2,
  followUp: 2,
}

/** The view switcher, Notion Calendar style. "Agenda" is FullCalendar's list-week view. */
const VIEWS = [
  { type: 'dayGridMonth', label: 'Month' },
  { type: 'timeGridWeek', label: 'Week' },
  { type: 'timeGridDay', label: 'Day' },
  { type: 'listWeek', label: 'Agenda' },
] as const

function eventFullName(event: CalendarEvent): string {
  return event.documentName ?? event.engagementName
}

function renderEventContent(arg: EventContentArg, eventsById: Map<string, CalendarEvent>) {
  const type = arg.event.extendedProps.type as CalendarEventType
  const Icon = EVENT_TYPE_ICON[type] ?? Briefcase
  const fullEvent = eventsById.get(arg.event.id)
  const label = EVENT_TYPE_LABEL[type] ?? 'Engagement'
  const name = fullEvent ? eventFullName(fullEvent) : arg.event.title
  // Deliverables and documents lead with their stage's icon (the status language), named for
  // screen readers and in the tooltip; engagement events keep their briefcase.
  const status = (type === 'deliverable' || type === 'document') && fullEvent?.status ? statusOf('deliverable', fullEvent.status) : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 min-w-0 px-0.5">
          {status
            ? <StatusIcon stage={status.stage} size={12} label={status.label} />
            : <Icon className="h-3 w-3 shrink-0 opacity-70" />}
          <span className="truncate">{arg.event.title}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent variant="light" side="top" className="max-w-[240px]">
        <div className="flex items-center gap-1.5 text-fg-subtle">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-caption">{label}{status && ` · ${status.label}`}</span>
        </div>
        <div className="mt-1 font-medium text-fg">{name}</div>
      </TooltipContent>
    </Tooltip>
  )
}

interface CalendarViewProps {
  firmSlug: string
}

export function CalendarView({ firmSlug }: CalendarViewProps) {
  const [data, setData] = useState<CalendarData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [visibleEngagementIds, setVisibleEngagementIds] = useState<Set<string>>(new Set())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const hasLoadedOnce = useRef(false)
  const calendarRef = useRef<FullCalendar>(null)
  // Mirrors FullCalendar's current range for the React toolbar (headerToolbar is off).
  const [title, setTitle] = useState('')
  const [viewType, setViewType] = useState<string>('dayGridMonth')
  const calendarApi = () => calendarRef.current?.getApi()

  const loadData = useCallback(async () => {
    if (hasLoadedOnce.current) setIsRefreshing(true)
    else setIsLoading(true)
    try {
      const result = await getFirmCalendarData(firmSlug)
      setData(result)
      // Default all engagements visible on first load only; preserve the
      // user's toggle choices across manual refreshes, dropping any
      // engagement ids that no longer exist and keeping newly-added ones off
      // by default so a refresh doesn't silently reveal new calendars.
      if (!hasLoadedOnce.current) {
        setVisibleEngagementIds(new Set(result.engagements.map((e) => e.id)))
      } else {
        setVisibleEngagementIds((prev) => {
          const validIds = new Set(result.engagements.map((e) => e.id))
          return new Set(Array.from(prev).filter((id) => validIds.has(id)))
        })
      }
      hasLoadedOnce.current = true
    } catch {
      setData({ engagements: [], events: [] })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [firmSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const eventsById = useMemo(() => {
    const map = new Map<string, CalendarEvent>()
    if (data) for (const e of data.events) map.set(e.id, e)
    return map
  }, [data])

  const events: EventInput[] = useMemo(() => {
    if (!data) return []
    return data.events
      .filter((e) => visibleEngagementIds.has(e.engagementId))
      .map((e) => {
        const color = getEngagementTagColor(e.engagementId)
        return {
          id: e.id,
          title: e.title,
          start: e.date,
          allDay: true,
          // Tag tokens: tinted chip, darker text. The border color only shows as the list view's dot.
          backgroundColor: `var(--ui-tag-${color}-bg)`,
          borderColor: `var(--ui-tag-${color}-fg)`,
          textColor: `var(--ui-tag-${color}-fg)`,
          extendedProps: { type: e.type, sortOrder: EVENT_TYPE_SORT_ORDER[e.type] },
        }
      })
  }, [data, visibleEngagementIds])

  const handleToggle = (engagementId: string) => {
    setVisibleEngagementIds((prev) => {
      const next = new Set(prev)
      if (next.has(engagementId)) next.delete(engagementId)
      else next.add(engagementId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (!data) return
    setVisibleEngagementIds(new Set(data.engagements.map((e) => e.id)))
  }

  const handleSelectNone = () => setVisibleEngagementIds(new Set())

  const handleEventClick = (arg: EventClickArg) => {
    const event = eventsById.get(arg.event.id)
    if (event) setSelectedEvent(event)
  }

  // "Agenda" (list-week) is meant to answer "what's due across the firm this
  // week" at a glance, so opening it always shows every engagement and jumps
  // back to the current week — the user can still narrow via the sidebar or
  // navigate to other weeks afterward. Fires for the toolbar's Agenda button
  // too, since changeView() mounts the list view the same way.
  const currentViewType = useRef<string | null>(null)
  const handleViewDidMount = (viewType: string) => {
    if (viewType === 'listWeek' && currentViewType.current !== 'listWeek' && data) {
      setVisibleEngagementIds(new Set(data.engagements.map((e) => e.id)))
      calendarRef.current?.getApi()?.today()
    }
    currentViewType.current = viewType
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-small text-fg-muted" role="status">
        <LoadingSpinner size="sm" />
        Loading calendar…
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      <CalendarSidebar
        engagements={data.engagements}
        visibleEngagementIds={visibleEngagementIds}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
      />
      <div className="firm-calendar firm-calendar--notion min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-h3 text-fg">{title}</h2>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="sm" onClick={() => calendarApi()?.today()}>Today</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => calendarApi()?.prev()} aria-label="Previous" title="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => calendarApi()?.next()} aria-label="Next" title="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadData} disabled={isRefreshing} aria-label="Refresh calendar" title="Refresh">
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
          <div className="inline-flex items-center rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v.type}
                type="button"
                aria-pressed={viewType === v.type}
                onClick={() => calendarApi()?.changeView(v.type)}
                className={cn(
                  'rounded-[4px] px-2.5 py-1 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                  viewType === v.type ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <TooltipProvider delayDuration={300}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          dayHeaderFormat={{ weekday: 'short' }}
          datesSet={(arg) => { setTitle(arg.view.title); setViewType(arg.view.type) }}
          height="auto"
          eventOrder="extendedProps.sortOrder"
          events={events}
          eventClick={handleEventClick}
          eventDisplay="block"
          eventContent={(arg) => renderEventContent(arg, eventsById)}
          viewDidMount={(arg) => handleViewDidMount(arg.view.type)}
        />
        </TooltipProvider>
      </div>
      <CalendarEventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  )
}
