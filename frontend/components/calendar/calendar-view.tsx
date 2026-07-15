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
import { getEngagementColorHex } from '@/lib/calendar/engagement-color'
import { Loader2, Briefcase, Layers, FileText } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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

function eventFullName(event: CalendarEvent): string {
  return event.documentName ?? event.engagementName
}

function renderEventContent(arg: EventContentArg, eventsById: Map<string, CalendarEvent>) {
  const type = arg.event.extendedProps.type as CalendarEventType
  const Icon = EVENT_TYPE_ICON[type] ?? Briefcase
  const fullEvent = eventsById.get(arg.event.id)
  const label = EVENT_TYPE_LABEL[type] ?? 'Engagement'
  const name = fullEvent ? eventFullName(fullEvent) : arg.event.title

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 min-w-0 px-0.5">
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{arg.event.title}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent variant="light" side="top" className="max-w-[240px]">
        <div className="flex items-center gap-1.5 text-[#8a8d94]">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 font-medium text-[#1b1b1d]">{name}</div>
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
        const color = getEngagementColorHex(e.engagementId)
        return {
          id: e.id,
          title: e.title,
          start: e.date,
          allDay: true,
          backgroundColor: color.bg,
          borderColor: color.border,
          textColor: color.text,
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

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-[#45474c]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading calendar…
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <CalendarSidebar
        engagements={data.engagements}
        visibleEngagementIds={visibleEngagementIds}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
      />
      <div className={cn('firm-calendar flex-1 min-w-0 bg-white border border-[#e5e7eb] rounded p-3', isRefreshing && 'firm-calendar--refreshing')}>
        <TooltipProvider delayDuration={300}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'refreshButton dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          customButtons={{
            refreshButton: {
              text: '',
              hint: 'Refresh calendar',
              click: loadData,
            },
          }}
          height="auto"
          eventOrder="extendedProps.sortOrder"
          events={events}
          eventClick={handleEventClick}
          eventDisplay="block"
          eventContent={(arg) => renderEventContent(arg, eventsById)}
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
