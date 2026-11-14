'use client'

import type { ReactNode } from 'react'
import { CalendarDays, ChevronRight, ShieldAlert, UserRound } from 'lucide-react'
import type { RaidType } from '@/lib/raid/raid-shared'
import { cn } from '@/lib/utils'
import { RaidLink, RaidTypeBadge } from './raid-tab'

/**
 * The RAID log's short form, one look wherever it's shown (Deepak, 2026-11-14): the Firm Overview's open
 * risks and issues, and the engagement Overview's RAID section. A header like the Action Center's (icon,
 * title, a count line with each type's colored letter), then rows: the type's letter, the entry, where it
 * is, who owns it and when it was raised, and the way to the RAID tab.
 */

/** One part of a count line: "[I] 3 issues". */
export interface RaidCount {
    type: RaidType
    count: number
    one: string
    many: string
}

/** "[I] 3 issues · [R] 4 risks", each with its type's colored letter, as in the RAID tab's filters. */
export function RaidCountLine({ parts, suffix }: { parts: RaidCount[]; suffix?: ReactNode }) {
    return (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-small text-fg-muted">
            {parts.map((p) => (
                <span key={p.type} className="inline-flex items-center gap-1 tabular-nums">
                    <RaidTypeBadge type={p.type} decorative small />
                    {p.count} {p.count === 1 ? p.one : p.many}
                </span>
            ))}
            {suffix}
        </span>
    )
}

/** The section's header: icon, title, what's next to it, and actions at the right; a hairline under it. */
export function RaidSectionHeader({ id, title, after, actions }: { id: string; title: string; after?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line pb-2">
            <div className="flex min-w-0 items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                <h2 id={id} className="truncate text-h3 text-fg">{title}</h2>
            </div>
            {after}
            {actions && (
                <>
                    <span className="flex-1" />
                    <div className="flex flex-wrap items-center gap-2">{actions}</div>
                </>
            )}
        </div>
    )
}

/**
 * One entry: its letter, its words, where it is, who owns it and when it was raised, and the way to it.
 *
 * `place` (the client and engagement, on the Firm Overview) gets its own column, apart from the entry's
 * words, and so do the owner and the day, each after its icon as in the app's tables: UserRound a person,
 * CalendarDays a date (Deepak, 2026-11-14). Every row has the same columns, so they line up down the list.
 * Where the list is narrow, the place goes on a second line under the words, and the owner and day sit
 * together at the right.
 */
export function RaidRow({ type, title, context, place, owner, day, href, testId }: {
    type: RaidType
    title: string
    /** After the words: its source on an engagement's Overview, "latest decision". */
    context?: ReactNode
    /** Where it is, in a column of its own: the client and engagement on the Firm Overview. */
    place?: ReactNode
    /** The owner's first name; none says "No owner". */
    owner: string | null | undefined
    /** When it was raised: "Nov 12". */
    day: string
    href: string
    testId?: string
}) {
    const hasPlace = place != null
    const icon = 'h-3.5 w-3.5 shrink-0 text-fg-subtle'
    return (
        <li className="@container">
            <RaidLink
                href={href}
                data-testid={testId}
                className={cn(
                    'group grid grid-cols-[22px_minmax(0,1fr)_auto_14px] items-center gap-x-3 gap-y-0.5 rounded-control px-2 py-2 text-small transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                    hasPlace
                        ? '@4xl:grid-cols-[22px_minmax(0,1fr)_24rem_6.5rem_4.5rem_14px]'
                        : '@4xl:grid-cols-[22px_minmax(0,1fr)_6.5rem_4.5rem_14px]',
                )}
            >
                <RaidTypeBadge type={type} />
                <span className="min-w-0 truncate">
                    <span className="text-fg">{title}</span>
                    {context && <span className="text-fg-muted"> · {context}</span>}
                </span>
                {hasPlace && (
                    <span className="col-start-2 row-start-2 min-w-0 truncate text-caption text-fg-muted @4xl:col-start-auto @4xl:row-start-auto @4xl:text-small">
                        {place}
                    </span>
                )}
                {/* One cell when narrow; on a wide list its two parts are columns of their own (contents). */}
                <span className="flex items-center gap-3 text-fg-muted @4xl:contents">
                    <span className="flex min-w-0 items-center gap-1" title={owner ? 'Owner' : undefined}>
                        <UserRound className={icon} aria-hidden />
                        <span className="truncate">{owner ?? 'No owner'}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1" title="Raised">
                        <CalendarDays className={icon} aria-hidden />
                        <span className="truncate">{day}</span>
                    </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
            </RaidLink>
        </li>
    )
}
