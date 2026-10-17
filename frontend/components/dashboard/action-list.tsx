'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { ListGroup } from '@/components/ui/list-row'

/**
 * The Action Center list, shared by the engagement and firm Overview pages (Linear-style): a
 * group per kind of work, one row per count. Severity shows only in the icon's color — no
 * colored chips or tinted tiles.
 */

export type ActionSeverity = 'critical' | 'warning' | 'info' | 'ok'

export interface ActionItem {
    key: string
    label: string
    count: number
    /** Muted line under the label; shown only while the count is above zero. */
    sub?: string
    severity: ActionSeverity
    icon: React.ElementType
    /** Opens in a new tab, as the rest of the Overview's links do. */
    href?: string
    /** Opens an in-panel drill-down; wins over href. */
    onSelect?: () => void
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 }

/** The whole row opens the work (or its drill-down); the count sits in a right-aligned column. */
export function ActionRow({ item, aside }: { item: ActionItem; aside?: React.ReactNode }) {
    const Icon = item.icon
    const active = item.count > 0
    const iconColor = !active ? 'text-fg-subtle'
        : item.severity === 'critical' ? 'text-red-600'
        : item.severity === 'warning' ? 'text-amber-600'
        : 'text-fg-muted'
    const selectable = !!item.onSelect && active
    const linkable = !selectable && !!item.href && active

    const body = (
        <>
            <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-ui ${active ? 'text-fg' : 'text-fg-muted'}`}>{item.label}</span>
                {active && item.sub && <span className="truncate text-small text-fg-subtle">{item.sub}</span>}
            </span>
            <span className={`shrink-0 tabular-nums text-ui ${active ? 'font-medium text-fg' : 'text-fg-subtle'}`}>{item.count}</span>
        </>
    )
    const rowClass = 'flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors'

    return (
        <div className="group/row flex items-center gap-0.5">
            {selectable ? (
                <button type="button" onClick={item.onSelect} className={`${rowClass} hover:bg-surface-hover`}>{body}</button>
            ) : linkable ? (
                <a href={item.href} target="_blank" rel="noopener noreferrer" className={`${rowClass} hover:bg-surface-hover`}>{body}</a>
            ) : (
                <div className={rowClass}>{body}</div>
            )}
            {aside !== undefined && <span className="flex w-6 shrink-0 justify-center">{aside}</span>}
        </div>
    )
}

/**
 * One group: the header carries a plain count of rows needing attention (no badges), those rows
 * follow — most severe, then largest, first — and everything at zero folds into one "N checks
 * passed" line instead of a column of zeros. `aside` fills a fixed slot at the end of every row, so
 * the counts stay aligned whether or not a row has one.
 */
export function ActionSection<T extends ActionItem>({ title, icon: Icon, items, headerAction, aside, footer, defaultShowClear = false }: {
    title: string
    icon: React.ElementType
    items: T[]
    headerAction?: React.ReactNode
    aside?: (item: T) => React.ReactNode
    footer?: React.ReactNode
    /** Start with the passed checks listed (when the reader just asked to see them). */
    defaultShowClear?: boolean
}) {
    const [showClear, setShowClear] = useState(defaultShowClear)
    const active = items
        .filter((i) => i.count > 0)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count)
    const clear = items.filter((i) => i.count === 0)
    const row = (it: T) => <ActionRow key={it.key} item={it} aside={aside ? (aside(it) ?? null) : undefined} />

    return (
        <ListGroup
            title={title}
            icon={<Icon className="h-3.5 w-3.5 text-fg-subtle" />}
            count={active.length > 0 ? active.length : undefined}
            action={
                <>
                    {active.length === 0 && (
                        <span className="inline-flex items-center gap-1 text-small text-fg-subtle">
                            <CheckCircle2 className="h-3.5 w-3.5" /> All clear
                        </span>
                    )}
                    {headerAction}
                </>
            }
        >
            <div className="flex flex-col pt-1">
                {active.map(row)}
                {clear.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowClear((v) => !v)}
                        aria-expanded={showClear}
                        className="flex h-8 items-center gap-1.5 rounded-control px-2 text-left text-small text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                    >
                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${showClear ? 'rotate-90' : ''}`} />
                        {clear.length} {clear.length === 1 ? 'check' : 'checks'} passed
                    </button>
                )}
                {showClear && clear.map(row)}
                {footer}
            </div>
        </ListGroup>
    )
}

/** Count of rows needing attention across groups — the plain number beside "Action Center". */
export function attentionCount(...groups: ActionItem[][]): number {
    return groups.flat().filter((i) => i.count > 0).length
}
