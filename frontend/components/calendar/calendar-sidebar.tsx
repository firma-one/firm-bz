'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getEngagementTagColor } from '@/lib/calendar/engagement-color'
import type { CalendarEngagement } from '@/lib/actions/calendar'

interface CalendarSidebarProps {
  engagements: CalendarEngagement[]
  visibleEngagementIds: Set<string>
  onToggle: (engagementId: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
}

export function CalendarSidebar({
  engagements,
  visibleEngagementIds,
  onToggle,
  onSelectAll,
  onSelectNone,
}: CalendarSidebarProps) {
  const groupedByClient = useMemo(() => {
    const groups = new Map<string, { clientName: string; engagements: CalendarEngagement[] }>()
    for (const e of engagements) {
      const existing = groups.get(e.clientId)
      if (existing) {
        existing.engagements.push(e)
      } else {
        groups.set(e.clientId, { clientName: e.clientName, engagements: [e] })
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [engagements])

  return (
    <TooltipProvider delayDuration={300}>
    <div className="w-56 shrink-0 border-r border-line pr-4">
      <div className="mb-2 flex h-7 items-center justify-between">
        <span className="text-small font-medium text-fg-muted">Calendars</span>
        <div className="flex items-center gap-0.5 text-small">
          <button type="button" onClick={onSelectAll} className="rounded-control px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">All</button>
          <button type="button" onClick={onSelectNone} className="rounded-control px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">None</button>
        </div>
      </div>

      {engagements.length === 0 && (
        <p className="py-4 text-small text-fg-muted">No engagements yet.</p>
      )}

      <div className="space-y-3 overflow-y-auto">
        {groupedByClient.map((group) => (
          <div key={group.clientName}>
            <p className="mb-0.5 flex items-center gap-1.5 px-1.5 text-caption text-fg-subtle">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{group.clientName}</span>
            </p>
            <div>
              {group.engagements.map((e) => {
                const color = getEngagementTagColor(e.id)
                const checked = visibleEngagementIds.has(e.id)
                return (
                  <label
                    key={e.id}
                    className="group flex h-7 cursor-pointer items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-hover"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(e.id)}
                      className="border-line-strong"
                      style={checked ? { backgroundColor: `var(--ui-tag-${color}-fg)`, borderColor: `var(--ui-tag-${color}-fg)`, color: '#fff' } : undefined}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn('truncate text-ui', checked ? 'text-fg' : 'text-fg-muted')}>
                          {e.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent variant="light" side="top">{e.name}</TooltipContent>
                    </Tooltip>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
    </TooltipProvider>
  )
}
