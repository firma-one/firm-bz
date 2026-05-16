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

/** Controls what text is rendered inline next to the clock icon. */
export type RelativeDateTimeFormat =
  | 'relative' // "18m ago"  (default)
  | 'short'    // "May 06, 2026"
  | 'iso'      // "2026-05-06 15:46:03.116 UTC"
  | 'verbose'  // "18m ago · Wed, May 06, 2026 21:17 GMT+5:30"

function formatShortDate(date: Date | string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function formatISODate(date: Date | string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const iso = d.toISOString()
  const [datePart, timePart] = iso.split('T')
  return `${datePart} ${timePart.replace('Z', '')} UTC`
}

export function RelativeDateTime({
  date,
  className,
  textClassName,
  iconClassName,
  tooltipSide = 'top',
  iconOnly = false,
  displayFormat = 'relative',
}: {
  date: Date | string
  className?: string
  textClassName?: string
  iconClassName?: string
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  iconOnly?: boolean
  displayFormat?: RelativeDateTimeFormat
}) {
  const relative = useMemo(() => formatRelativeTime(date), [date])
  const full = useMemo(() => formatVerboseDateTimeWithTZ(date), [date])

  const displayText = useMemo(() => {
    if (displayFormat === 'short') return formatShortDate(date)
    if (displayFormat === 'iso') return formatISODate(date)
    if (displayFormat === 'verbose') return `${relative} · ${full}`
    return relative
  }, [displayFormat, date, relative, full])

  const isMonoFormat = displayFormat === 'iso'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1.5 cursor-default', className)}>
          <span
            aria-hidden
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 transition-colors',
              iconClassName
            )}
          >
            <Clock className="h-3.5 w-3.5" />
          </span>
          {!iconOnly && (
            <span className={cn('tabular-nums', isMonoFormat && 'font-mono text-xs', textClassName)}>
              {displayText}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className={LIGHT_TOOLTIP_CLASS}>
        {`${relative} · ${full}`}
      </TooltipContent>
    </Tooltip>
  )
}

