import { cn } from '@/lib/utils'

/**
 * One icon family for where a panel sits in the window (2026-10-23): a window outline with the
 * panel's share of it drawn in — the left sidebar, a right pane at side-panel / half / full size, a
 * floating window, and a side rail inside a view (Brio's history, the PDF's pages). Filled means
 * the panel is showing; unfilled draws just its edge, so a toggle doesn't need two different icons.
 */
export type WindowGlyphVariant = 'left' | 'right' | 'half' | 'full' | 'float'

/** The filled panel for each variant, inside the window's 13×11 outline (x 1.5–14.5, y 2.5–13.5). */
const PANELS: Record<WindowGlyphVariant, { x: number; y: number; width: number; height: number; edge?: number }> = {
    left: { x: 3.5, y: 4.5, width: 3, height: 7, edge: 6 },
    right: { x: 9.5, y: 4.5, width: 3, height: 7, edge: 10 },
    half: { x: 7.5, y: 4.5, width: 5, height: 7, edge: 8 },
    full: { x: 3.5, y: 4.5, width: 9, height: 7 },
    float: { x: 8.5, y: 7.5, width: 4, height: 4 },
}

export function WindowGlyph({
    variant,
    filled = true,
    className,
}: {
    variant: WindowGlyphVariant
    /** The panel is showing. Unfilled, a side panel is drawn as its edge only. */
    filled?: boolean
    className?: string
}) {
    const p = PANELS[variant]
    return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={cn('h-4 w-4 shrink-0', className)}>
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
            {filled || p.edge === undefined ? (
                <rect x={p.x} y={p.y} width={p.width} height={p.height} rx="0.75" fill="currentColor" />
            ) : (
                <line x1={p.edge} y1="2.5" x2={p.edge} y2="13.5" stroke="currentColor" strokeWidth="1.25" />
            )}
        </svg>
    )
}
