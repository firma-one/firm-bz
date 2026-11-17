import { cn } from '@/lib/utils'

/*
 * A page's sub-tabs (Discussions › Threads | Memos, Files › All files | Recent | Health), one look
 * wherever they appear (2026-11-17): borderless pills in a row, the open one filled with the selected
 * tint, the rest quiet until hovered. The way Linear and Vercel draw a page's views, and the sidebar's own
 * selected row. A segmented control, boxed, stays for picking a value (the timeline's 30D | 90D | All).
 */

/** The row the sub-tabs sit in. */
export const SUB_TABS_ROW = 'inline-flex shrink-0 flex-wrap items-center gap-0.5'

/** One sub-tab: label, then its count and lock. */
export function subTabClass(selected: boolean): string {
    return cn(
        'inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-small font-medium transition-colors duration-ui-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
        selected ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
    )
}

/** A sub-tab's count, quiet beside its label. */
export const SUB_TAB_COUNT = 'tabular-nums font-normal text-fg-subtle'
