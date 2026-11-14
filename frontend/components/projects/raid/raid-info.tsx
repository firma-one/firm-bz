'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { RAID_MEANING } from '@/lib/raid/raid-shared'
import { cn } from '@/lib/utils'

/**
 * RAID, explained wherever the app says it (Deepak, 2026-11-14): not everyone knows the term, so an info
 * icon follows it with what it stands for. The app's counterpart of the website's `withRaidTip`
 * (components/marketing/v2/raid-tip.tsx), with the same words (`RAID_MEANING`).
 *
 * One icon per block, on its first RAID: a heading's icon covers the "Open RAID log" button beside it.
 */

function RaidMeaning() {
    return (
        <span className="block max-w-[280px] text-xs leading-relaxed">
            <span className="block font-semibold">RAID log</span>
            {RAID_MEANING} Internal only.
        </span>
    )
}

/**
 * The info icon. `nested` inside something already clickable (a tab, a link): a plain mark that shows the
 * tip on hover, since a button can't sit inside another control.
 */
export function RaidInfo({ nested = false, className }: { nested?: boolean; className?: string }) {
    const classes = cn('inline-flex shrink-0 items-center align-middle text-fg-subtle transition-colors hover:text-fg-muted', className)
    return (
        <Hint label={<RaidMeaning />}>
            {nested ? (
                <span className={classes} aria-hidden data-testid="raid-info">
                    <Info className="h-3 w-3" />
                </span>
            ) : (
                <button type="button" aria-label="What RAID means" className={classes} onClick={(e) => e.preventDefault()} data-testid="raid-info">
                    <Info className="h-3 w-3" />
                </button>
            )}
        </Hint>
    )
}

/** "RAID" and the word after it ("log", "suggestions", "entries"), kept on one line with its icon. */
const RAID_TERM = /\bRAID(?: (?:logs?|suggestions?|entries|entry|check))?/

/** `text` with the info icon after its first RAID term; unchanged when there is none. */
export function withRaidInfo(text: string, opts: { nested?: boolean } = {}): ReactNode {
    const match = RAID_TERM.exec(text)
    if (!match) return text
    const end = match.index + match[0].length
    return (
        <>
            {text.slice(0, match.index)}
            <span className="whitespace-nowrap">
                {match[0]}
                <RaidInfo nested={opts.nested} className="ml-1" />
            </span>
            {text.slice(end)}
        </>
    )
}
