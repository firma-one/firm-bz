'use client'

import type { ReactNode } from 'react'
import { ChevronRight, ShieldAlert } from 'lucide-react'
import type { RaidType } from '@/lib/raid/raid-shared'
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

/** One entry: its letter, its words, where it is, who and when, and the way to it. */
export function RaidRow({ type, title, context, meta, href, testId }: {
    type: RaidType
    title: string
    /** Where it is: the engagement on the Firm Overview, its source on an engagement's. */
    context?: string | null
    /** "Alex · Nov 10", "No owner · Nov 12", "latest decision · Nov 3". */
    meta: string
    href: string
    testId?: string
}) {
    return (
        <li>
            <RaidLink
                href={href}
                data-testid={testId}
                className="group flex items-center gap-3 rounded-control px-2 py-2 text-small transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
            >
                <RaidTypeBadge type={type} />
                <span className="min-w-0 flex-1 truncate">
                    <span className="text-fg">{title}</span>
                    {context && <span className="text-fg-muted"> · {context}</span>}
                </span>
                <span className="shrink-0 text-fg-muted">{meta}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
            </RaidLink>
        </li>
    )
}
