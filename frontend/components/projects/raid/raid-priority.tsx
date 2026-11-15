'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RAID_PRIORITIES, RAID_PRIORITY_BARS, RAID_PRIORITY_LABEL, type RaidPriority } from '@/lib/raid/raid-shared'
import { cn } from '@/lib/utils'

/**
 * A Risk's or an Issue's priority as gray signal bars (mock, Deepak, 2026-11-14): three bars, as many
 * filled as it matters, High three. Gray, so no color is shared with the R, A, I, D letters, and the word
 * beside them, so nobody has to learn the bars.
 */

const BARS: Array<{ x: number; y: number; h: number }> = [
    { x: 1, y: 8, h: 5 },
    { x: 5.5, y: 5, h: 8 },
    { x: 10, y: 2, h: 11 },
]

export function PriorityBars({ priority, className }: { priority: RaidPriority; className?: string }) {
    const filled = RAID_PRIORITY_BARS[priority]
    return (
        <svg viewBox="0 0 14 14" className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden>
            {BARS.map((b, i) => (
                <rect key={i} x={b.x} y={b.y} width={3} height={b.h} rx={1} className={i < filled ? 'fill-fg' : 'fill-line-strong'} />
            ))}
        </svg>
    )
}

/** The bars and the word; a dash for an Assumption or a Decision, which have none. */
export function RaidPriorityMark({ priority, className }: { priority: RaidPriority | null; className?: string }) {
    if (!priority) return <span className={cn('text-fg-subtle', className)} aria-label="No priority">—</span>
    return (
        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-fg-muted', className)}>
            <PriorityBars priority={priority} />
            {RAID_PRIORITY_LABEL[priority]}
        </span>
    )
}

/** Choosing High, Medium or Low, in the look of the log's Owner picker. */
export function RaidPriorityPicker({ value, onChange, label, disabled, className }: {
    value: RaidPriority
    onChange: (priority: RaidPriority) => void
    /** "Priority of …", for screen readers. */
    label: string
    disabled?: boolean
    className?: string
}) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as RaidPriority)} disabled={disabled}>
            <SelectTrigger
                aria-label={label}
                className={cn('-mx-1 h-7 w-auto min-w-[5.5rem] gap-1 border-transparent bg-transparent px-1 text-small hover:bg-surface-hover', className)}
            >
                <SelectValue>
                    <RaidPriorityMark priority={value} />
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {RAID_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                        <RaidPriorityMark priority={p} className="text-fg" />
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
