'use client'

import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import type { EventContentArg, EventInput } from '@fullcalendar/core'
import { Briefcase, Layers, FileText } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getEngagementColorHex } from '@/lib/calendar/engagement-color'
import { DemoFirm } from '@/lib/demo/static-demo-data'
import { buildDemoCalendarData, DemoCalendarEvent, DemoCalendarEventType } from '@/lib/demo/demo-calendar-data'
import { DemoCalendarSidebar } from '@/components/demo/demo-calendar-sidebar'
import '@/components/calendar/calendar-view.css'

const EVENT_TYPE_ICON: Record<DemoCalendarEventType, typeof Briefcase> = {
    kickoff: Briefcase,
    due: Briefcase,
    deliverable: Layers,
    document: FileText,
}

const EVENT_TYPE_LABEL: Record<DemoCalendarEventType, string> = {
    kickoff: 'Engagement',
    due: 'Engagement',
    deliverable: 'Deliverable',
    document: 'Document',
}

const EVENT_TYPE_SORT_ORDER: Record<DemoCalendarEventType, number> = {
    document: 0,
    deliverable: 1,
    kickoff: 2,
    due: 2,
}

function renderEventContent(arg: EventContentArg, eventsById: Map<string, DemoCalendarEvent>) {
    const type = arg.event.extendedProps.type as DemoCalendarEventType
    const Icon = EVENT_TYPE_ICON[type] ?? Briefcase
    const fullEvent = eventsById.get(arg.event.id)
    const label = EVENT_TYPE_LABEL[type] ?? 'Engagement'

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
                <div className="mt-1 font-medium text-[#1b1b1d]">{fullEvent?.engagementName}</div>
            </TooltipContent>
        </Tooltip>
    )
}

/** Static counterpart to calendar-view.tsx — dummy engagement events spread across the previous, current, and next month, no fetching. Event-detail modal is omitted (it requires live subtask data); clicking an event is a no-op, hover tooltip still shows details. */
export function DemoCalendarView({ firm }: { firm: DemoFirm }) {
    const data = useMemo(() => buildDemoCalendarData(firm), [firm])
    const [visibleEngagementIds, setVisibleEngagementIds] = useState<Set<string>>(
        () => new Set(data.engagements.map((e) => e.id))
    )

    const eventsById = useMemo(() => {
        const map = new Map<string, DemoCalendarEvent>()
        data.events.forEach((e) => map.set(e.id, e))
        return map
    }, [data])

    const events: EventInput[] = useMemo(() => {
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

    const handleSelectAll = () => setVisibleEngagementIds(new Set(data.engagements.map((e) => e.id)))
    const handleSelectNone = () => setVisibleEngagementIds(new Set())

    return (
        <div className="flex gap-4">
            <DemoCalendarSidebar
                engagements={data.engagements}
                visibleEngagementIds={visibleEngagementIds}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
            />
            <div className={cn('firm-calendar flex-1 min-w-0 bg-white border border-[#e5e7eb] rounded p-3')}>
                <TooltipProvider delayDuration={300}>
                    <FullCalendar
                        plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                        initialView="dayGridMonth"
                        headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
                        }}
                        buttonText={{ listWeek: 'Agenda' }}
                        height="auto"
                        eventOrder="extendedProps.sortOrder"
                        events={events}
                        eventDisplay="block"
                        eventContent={(arg) => renderEventContent(arg, eventsById)}
                    />
                </TooltipProvider>
            </div>
        </div>
    )
}
