import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function formatVerboseDateTimeWithTZ(date: Date | string | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''

  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const monthDayYear = d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const tz = d.toLocaleString('en-US', { timeZoneName: 'short' }).split(' ').pop() ?? ''
  return `${weekday}, ${monthDayYear} ${time} ${tz}`
}

const LIGHT_TOOLTIP_CLASS =
  'z-[9999] max-w-[340px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-words'

export function RelativeDateTime({
  date,
  className,
  textClassName,
  iconClassName,
  tooltipSide = 'top',
  iconOnly = false,
}: {
  date: Date | string
  className?: string
  textClassName?: string
  iconClassName?: string
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  iconOnly?: boolean
}) {
  const relative = useMemo(() => formatRelativeTime(date), [date])
  const full = useMemo(() => formatVerboseDateTimeWithTZ(date), [date])

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label="Show full date time"
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition-colors',
              iconClassName
            )}
          >
            <Clock className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className={LIGHT_TOOLTIP_CLASS}>
          {iconOnly ? full : `${relative} · ${full}`}
        </TooltipContent>
      </Tooltip>
      {!iconOnly && <span className={cn('tabular-nums', textClassName)}>{relative}</span>}
    </span>
  )
}

