'use client'

import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PaneSize } from '@/lib/right-pane-context'

/**
 * The right pane's size, as a three-way switch (2026-10-23): side panel, half screen, full screen —
 * one click to any of them, the current one pressed. It replaces a single button that cycled
 * small → medium → large and showed only where the next click went.
 */

/** Window-tiling glyph: a window outline with the share of it the pane takes filled in. */
function TileGlyph({ fillX }: { fillX: number }) {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
            <rect x={fillX} y="4.5" width={12.5 - fillX} height="7" rx="0.75" fill="currentColor" />
        </svg>
    )
}

const SIZES: { size: PaneSize; label: string; fillX: number }[] = [
    { size: 'small', label: 'Side panel', fillX: 9.5 },
    { size: 'medium', label: 'Half screen', fillX: 7.5 },
    { size: 'large', label: 'Full screen', fillX: 3.5 },
]

export function PaneSizeSwitch({ value, onChange }: { value: PaneSize; onChange: (size: PaneSize) => void }) {
    return (
        <div className="mr-0.5 inline-flex shrink-0 items-center rounded-control bg-surface-muted p-0.5" role="group" aria-label="Pane size">
            {SIZES.map(({ size, label, fillX }) => (
                <Hint key={size} label={label} side="bottom">
                    <button
                        type="button"
                        aria-label={label}
                        aria-pressed={value === size}
                        onClick={() => { if (value !== size) onChange(size) }}
                        className={cn(
                            'flex h-6 w-7 items-center justify-center rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30',
                            value === size ? 'bg-surface text-fg shadow-sm ring-1 ring-line-strong' : 'text-fg-subtle hover:text-fg'
                        )}
                    >
                        <TileGlyph fillX={fillX} />
                    </button>
                </Hint>
            ))}
        </div>
    )
}
