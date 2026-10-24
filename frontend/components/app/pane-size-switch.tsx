'use client'

import { Hint } from '@/components/ui/tooltip'
import { WindowGlyph, type WindowGlyphVariant } from '@/components/ui/window-glyph'
import { cn } from '@/lib/utils'
import type { PaneSize } from '@/lib/right-pane-context'

/**
 * The right pane's size, as a three-way switch (2026-10-23): side panel, half screen, full screen —
 * one click to any of them, the current one pressed. It replaces a single button that cycled
 * small → medium → large and showed only where the next click went.
 */

/** Each size as its window glyph (components/ui/window-glyph.tsx), the family the app's panel toggles share. */
const SIZES: { size: PaneSize; label: string; glyph: WindowGlyphVariant }[] = [
    { size: 'small', label: 'Side panel', glyph: 'right' },
    { size: 'medium', label: 'Half screen', glyph: 'half' },
    { size: 'large', label: 'Full screen', glyph: 'full' },
]

export function PaneSizeSwitch({ value, onChange }: { value: PaneSize; onChange: (size: PaneSize) => void }) {
    return (
        <div className="mr-0.5 inline-flex shrink-0 items-center rounded-control bg-surface-muted p-0.5" role="group" aria-label="Pane size">
            {SIZES.map(({ size, label, glyph }) => (
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
                        <WindowGlyph variant={glyph} />
                    </button>
                </Hint>
            ))}
        </div>
    )
}
