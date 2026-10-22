'use client'

import { useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { Hint } from '@/components/ui/tooltip'
import { initialsOf } from '@/lib/initials'
import { cn } from '@/lib/utils'

/*
 * Who changed it last and when, small enough for a menu header: their avatar and a short date —
 * the time for today, "Sep 24" this year, "Sep 24, 2025" before. The hint says it in full:
 * "Modified Sep 24, 2026 at 3:40 PM by Deepak Shettigar".
 */

export function shortModifiedDate(at: Date, now = new Date()): string {
    if (isSameDay(at, now)) return format(at, 'h:mm a')
    return format(at, at.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy')
}

export function ModifiedStamp({ at, by, photoLink, className }: { at: string; by?: string | null; photoLink?: string; className?: string }) {
    const [imageError, setImageError] = useState(false)
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return null
    const full = `Modified ${format(date, "MMM d, yyyy 'at' h:mm a")}${by ? ` by ${by}` : ''}`
    return (
        <Hint label={full}>
            <span className={cn('inline-flex shrink-0 cursor-default items-center gap-1 text-caption tabular-nums text-fg-subtle', className)} aria-label={full}>
                {by && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-[8px] font-semibold text-fg-muted" aria-hidden>
                        {photoLink && !imageError
                            ? <img src={photoLink} alt="" className="h-full w-full object-cover" onError={() => setImageError(true)} />
                            : initialsOf(by)}
                    </span>
                )}
                {shortModifiedDate(date)}
            </span>
        </Hint>
    )
}
