'use client'

import type { ElementType } from 'react'
import { Activity, Briefcase, CalendarRange, Clock3, Layers, Type, User } from 'lucide-react'
import { FilterPill } from '@/components/ui/filter-pill'
import { Hint, TooltipProvider } from '@/components/ui/tooltip'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Tag } from '@/components/ui/tag'
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
import { initialsOf } from '@/lib/initials'

export type DemoAuditRow = {
    id: string
    eventScope: string
    eventAction: string
    details: string
    actorName: string
    /** Client and engagement the event belongs to, for the firm-wide log's Where column. */
    client?: string
    engagement?: string
    /** Days before today. */
    offsetDays: number
    icon: ElementType
}

/**
 * Static counterpart to AuditWithFilters (components/audit/audit-with-filters.tsx): the same filter
 * pills, count line and grid table, over rows the demo builds from its sample data. The filters
 * are shown but inert. `showScope` is the firm-wide log: a Scope filter, and Scope and Where columns.
 */
export function DemoAuditLog({ rows, showScope = true }: { rows: DemoAuditRow[]; showScope?: boolean }) {
    const sorted = [...rows].sort((a, b) => a.offsetDays - b.offsetDays)
    const now = Date.now()

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <Hint label="Filters aren't available in this demo" side="bottom">
                <div className="mb-3 flex w-fit flex-wrap items-center gap-1.5">
                    <FilterPill icon={<CalendarRange />} label="Date" />
                    {showScope && <FilterPill icon={<Layers />} label="Scope" />}
                    <FilterPill icon={<Activity />} label="Type" />
                    <FilterPill icon={<User />} label="Actor" />
                </div>
            </Hint>

            <p className="mb-1 text-caption text-fg-subtle">
                <span className="tabular-nums">{sorted.length}</span> events · audit history is permanent
            </p>

            <div className="min-h-0 flex-1 overflow-auto">
                <NotionTable scrollContainer={false} className="table-fixed">
                    <NotionTableHeader className="sticky top-0 z-[1] bg-surface">
                        <NotionTableHead icon={<Clock3 />} className="w-[170px]">Date</NotionTableHead>
                        <NotionTableHead icon={<Activity />} className="w-[150px]">Event</NotionTableHead>
                        {showScope && <NotionTableHead icon={<Layers />} className="w-[120px]">Scope</NotionTableHead>}
                        <NotionTableHead icon={<Type />}>Details</NotionTableHead>
                        {showScope && <NotionTableHead icon={<Briefcase />} className="w-[240px]">Where</NotionTableHead>}
                        <NotionTableHead icon={<User />} className="w-[180px]">Actor</NotionTableHead>
                        <NotionTableActionsHead className="w-8" />
                    </NotionTableHeader>
                    <NotionTableBody>
                        <TooltipProvider>
                            {sorted.map((row) => {
                                const Icon = row.icon
                                return (
                                    <NotionTableRow key={row.id}>
                                        <NotionTableCell className="whitespace-nowrap">
                                            <RelativeDateTime
                                                date={new Date(now - row.offsetDays * 86400000).toISOString()}
                                                displayFormat="short"
                                                tooltipSide="right"
                                                textClassName="text-ui text-fg-muted"
                                                iconClassName="hidden"
                                            />
                                        </NotionTableCell>
                                        <NotionTableCell>
                                            <div className="flex items-center gap-2">
                                                <Hint label={`${row.eventScope} event`}>
                                                    <span className="flex shrink-0"><Icon className="h-3.5 w-3.5 text-fg-subtle" /></span>
                                                </Hint>
                                                <Tag color={row.eventAction === 'Deleted' ? 'red' : 'gray'}>{row.eventAction}</Tag>
                                            </div>
                                        </NotionTableCell>
                                        {showScope && <NotionTableCell className="truncate text-fg-muted">{row.eventScope}</NotionTableCell>}
                                        <NotionTableCell>
                                            <span className="block truncate">{row.details}</span>
                                        </NotionTableCell>
                                        {showScope && (
                                            <NotionTableCell>
                                                <div className="flex min-w-0 items-center gap-1">
                                                    {row.client && <span className={row.engagement ? 'max-w-[50%] shrink-0 truncate text-fg-muted' : 'min-w-0 truncate'}>{row.client}</span>}
                                                    {row.client && row.engagement && <span className="shrink-0 text-fg-subtle">›</span>}
                                                    {row.engagement && <span className="min-w-0 truncate">{row.engagement}</span>}
                                                </div>
                                            </NotionTableCell>
                                        )}
                                        <NotionTableCell>
                                            <div className="flex items-center gap-1.5">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[9px] font-medium text-fg-muted">
                                                    {initialsOf(row.actorName)}
                                                </span>
                                                <span className="max-w-[160px] truncate text-fg-muted">{row.actorName}</span>
                                            </div>
                                        </NotionTableCell>
                                        <NotionTableActions aria-hidden />
                                    </NotionTableRow>
                                )
                            })}
                        </TooltipProvider>
                    </NotionTableBody>
                </NotionTable>
            </div>
        </div>
    )
}
