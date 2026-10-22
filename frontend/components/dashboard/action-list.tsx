'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, CheckCircle2, ChevronRight } from 'lucide-react'
import { ListGroup } from '@/components/ui/list-row'
import { cn } from '@/lib/utils'

/**
 * The Action Center list, shared by the engagement and firm Overview pages
 * (.claude/plans/app-design-refinements.md, section 4): one Linear-style list, one row per check
 * with work (icon, label, a short muted explanation, the count at the end). Severity shows only in
 * the icon and count color, and only critical is red: no colored chips or tinted tiles.
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
    const critical = active && item.severity === 'critical'
    const selectable = !!item.onSelect && active
    const linkable = !selectable && !!item.href && active

    const body = (
        <>
            <Icon className={cn('h-4 w-4 shrink-0', critical ? 'text-danger' : active ? 'text-fg-muted' : 'text-fg-subtle')} />
            {/* One line: the label, then the explanation in the space that's left. */}
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className={cn('max-w-full shrink-0 truncate text-ui', active ? 'text-fg' : 'text-fg-muted')}>{item.label}</span>
                {active && item.sub && <span className="min-w-0 truncate text-small text-fg-subtle">{item.sub}</span>}
            </span>
            <span className={cn('min-w-5 shrink-0 text-right text-small tabular-nums', critical ? 'font-medium text-danger' : active ? 'font-medium text-fg-muted' : 'text-fg-subtle')}>{item.count}</span>
        </>
    )
    const rowClass = 'flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-control px-2 text-left transition-colors duration-ui-fast'

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

export interface ActionGroup<T extends ActionItem = ActionItem> {
    /** Names the group inside "N checks passed"; rows with work are one list, whatever their group. */
    title: string
    items: T[]
}

/**
 * The Action Center: every row with work in one list, most severe then largest first, whatever its
 * group. Everything at zero folds into one "N checks passed" line (with "All clear" when that's
 * everything), which opens with a height-and-fade transition onto the passed checks as muted rows,
 * grouped. `aside` fills a fixed slot at the end of every row with work, so the counts stay aligned.
 */
export function ActionList<T extends ActionItem>({ groups, aside, defaultShowClear = false }: {
    groups: ActionGroup<T>[]
    aside?: (item: T) => React.ReactNode
    /** Start with the passed checks listed. */
    defaultShowClear?: boolean
}) {
    const [showClear, setShowClear] = useState(defaultShowClear)
    const reduceMotion = useReducedMotion()
    const panelId = useId()
    const active = groups
        .flatMap((g) => g.items)
        .filter((i) => i.count > 0)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count)
    const clearGroups = groups
        .map((g) => ({ title: g.title, items: g.items.filter((i) => i.count === 0) }))
        .filter((g) => g.items.length > 0)
    const clearCount = clearGroups.reduce((n, g) => n + g.items.length, 0)

    return (
        <div className="flex flex-col">
            {active.map((it) => <ActionRow key={it.key} item={it} aside={aside ? (aside(it) ?? null) : undefined} />)}
            {clearCount > 0 && (
                <button
                    type="button"
                    onClick={() => setShowClear((v) => !v)}
                    aria-expanded={showClear}
                    aria-controls={panelId}
                    className={cn(
                        'flex h-8 items-center gap-2 rounded-control px-2 text-left text-small text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg',
                        active.length > 0 && 'mt-1'
                    )}
                >
                    <CheckCircle2 className={cn('h-4 w-4 shrink-0', active.length === 0 ? 'text-status-done-icon' : 'text-fg-subtle')} />
                    {/* The spaces keep the accessible name readable ("All clear · 6 checks passed");
                        the flex gap draws the visible spacing. */}
                    {active.length === 0 && (
                        <>
                            <span className="text-fg">All clear</span>{' '}
                            <span className="text-fg-subtle">·</span>{' '}
                        </>
                    )}
                    {clearCount} {clearCount === 1 ? 'check' : 'checks'} passed
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-ui-slow ease-ui-out', showClear && 'rotate-90')} />
                </button>
            )}
            <AnimatePresence initial={false}>
                {showClear && clearCount > 0 && (
                    <motion.div
                        id={panelId}
                        key="clear"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        // --ui-dur-slow and --ui-ease-out; no movement at all under reduced motion.
                        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-1.5 pb-1 pl-8 pt-1">
                            {clearGroups.map((g) => (
                                <div key={g.title}>
                                    {clearGroups.length > 1 && <p className="mb-0.5 text-caption text-fg-muted">{g.title}</p>}
                                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                                        {g.items.map((it) => (
                                            <div key={it.key} className="flex h-7 min-w-0 items-center gap-2.5 pr-2 text-small text-fg-subtle">
                                                <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                                                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                                                <span className="tabular-nums">0</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/**
 * @deprecated Use ActionList: one list across groups (app-design-refinements.md, section 4). Kept
 * until the refinements are signed off; nothing in the app renders it any more.
 *
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
