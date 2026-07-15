'use client'

import { useMemo } from 'react'
import { Building2, Briefcase } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getEngagementColor } from '@/lib/calendar/engagement-color'
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
    <div className="w-64 shrink-0 border-r border-[#e5e7eb] pr-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#45474c]">Calendars</span>
        <div className="flex items-center gap-2 text-[11px]">
          <button onClick={onSelectAll} className="text-primary hover:underline">All</button>
          <span className="text-[#d1d5db]">|</span>
          <button onClick={onSelectNone} className="text-primary hover:underline">None</button>
        </div>
      </div>

      {engagements.length === 0 && (
        <p className="text-sm text-[#45474c] py-4">No engagements found.</p>
      )}

      <div className="space-y-4 overflow-y-auto">
        {groupedByClient.map((group) => (
          <div key={group.clientName}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#1b1b1d] mb-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#8a8d94] shrink-0" />
              {group.clientName}
            </p>
            <div className="space-y-1.5">
              {group.engagements.map((e) => {
                const color = getEngagementColor(e.id)
                const checked = visibleEngagementIds.has(e.id)
                return (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(e.id)}
                      className={cn('border-slate-300 data-[state=checked]:text-white', checked && color.dot, checked && color.border)}
                    />
                    <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', color.dot)} />
                    <Briefcase className="h-3.5 w-3.5 text-[#8a8d94] shrink-0" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm text-[#45474c] group-hover:text-[#1b1b1d] truncate">
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
