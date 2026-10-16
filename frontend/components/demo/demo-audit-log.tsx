'use client'

import type { ElementType } from 'react'
import { Activity, CalendarRange, Layers, User } from 'lucide-react'
import { FilterPill } from '@/components/ui/filter-pill'
import { Hint, TooltipProvider } from '@/components/ui/tooltip'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { initialsOf } from '@/lib/initials'

export type DemoAuditRow = {
    id: string
    eventScope: string
    eventAction: string
    details: string
    actorName: string
    /** Days before today. */
    offsetDays: number
    icon: ElementType
}

/**
 * Static counterpart to AuditWithFilters (components/audit/audit-with-filters.tsx): the same filter
 * pills, count line and hairline table, over rows the demo builds from its sample data. The filters
 * are shown but inert.
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
                <table className="w-full border-collapse text-left text-ui">
                    <thead className="sticky top-0 z-[1] border-b border-line bg-surface">
                        <tr>
                            <th className="h-8 w-[160px] px-2 text-small font-normal text-fg-muted first:pl-1">Date</th>
                            {showScope && <th className="h-8 w-[130px] px-2 text-small font-normal text-fg-muted">Event scope</th>}
                            <th className="h-8 w-[130px] px-2 text-small font-normal text-fg-muted">Event type</th>
                            <th className="h-8 min-w-[80px] px-2 text-small font-normal text-fg-muted">Details</th>
                            <th className="h-8 w-[200px] px-2 text-small font-normal text-fg-muted">Actor</th>
                        </tr>
                    </thead>
                    <tbody>
                        <TooltipProvider>
                            {sorted.map((row) => {
                                const Icon = row.icon
                                return (
                                    <tr key={row.id} className="h-9 border-b border-line transition-colors hover:bg-surface-hover">
                                        <td className="whitespace-nowrap px-2 py-1 first:pl-1">
                                            <RelativeDateTime
                                                date={new Date(now - row.offsetDays * 86400000).toISOString()}
                                                displayFormat="short"
                                                tooltipSide="right"
                                                textClassName="text-ui text-fg-muted"
                                            />
                                        </td>
                                        {showScope && (
                                            <td className="px-2 py-1">
                                                <div className="flex items-center gap-2">
                                                    <Icon className="h-3.5 w-3.5 text-fg-subtle" />
                                                    <span className="text-ui text-fg-muted">{row.eventScope}</span>
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-2">
                                                {!showScope && <Icon className="h-3.5 w-3.5 text-fg-subtle" />}
                                                <span className="text-fg">{row.eventAction}</span>
                                            </div>
                                        </td>
                                        <td className="max-w-[260px] truncate px-2 py-1 text-fg-muted">{row.details}</td>
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[9px] font-medium text-fg-muted">
                                                    {initialsOf(row.actorName)}
                                                </span>
                                                <span className="max-w-[160px] truncate text-fg-muted">{row.actorName}</span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </TooltipProvider>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
