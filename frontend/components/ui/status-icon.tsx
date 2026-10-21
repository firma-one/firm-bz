import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { STAGE_ICON_CLASSES, type StatusStage } from '@/lib/ui/status'

/**
 * A stage's icon, Linear-style: an empty circle fills as work moves, a filled check when it's done
 * (lib/ui/status.ts, .claude/plans/app-design-refinements.md section 2).
 *
 * Drawn in currentColor, which is the stage's icon token. Those pastels sit below 3:1 on white, so
 * the icon is never the only cue: beside a label it stays aria-hidden; standing alone (before a
 * card's code, in a sidebar row) pass `label` and it's announced as visually hidden text.
 */
export function StatusIcon({
    stage,
    size = 14,
    label,
    className,
}: {
    stage: StatusStage
    /** 13 to 16px. */
    size?: number
    /** Names the status for screen readers when no visible label sits next to the icon. */
    label?: string
    className?: string
}) {
    return (
        <span className={cn('inline-flex shrink-0', STAGE_ICON_CLASSES[stage], className)}>
            <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                {GLYPHS[stage]}
            </svg>
            {label && <span className="sr-only">{label}</span>}
        </span>
    )
}

const RING = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
const DISC = <circle cx="8" cy="8" r="7" fill="currentColor" />
const CHECK = (
    <path d="M5.2 8.3l1.9 1.9 3.8-4" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)

const GLYPHS: Record<StatusStage, ReactNode> = {
    'not-started': RING,
    underway: (
        <>
            {RING}
            <path d="M8 4.5A3.5 3.5 0 0 1 8 11.5Z" fill="currentColor" />
        </>
    ),
    waiting: (
        <>
            {RING}
            <path d="M8 4.5A3.5 3.5 0 1 1 4.5 8H8Z" fill="currentColor" />
        </>
    ),
    done: (
        <>
            {DISC}
            {CHECK}
        </>
    ),
    paused: (
        <>
            {RING}
            <path d="M6.6 5.8v4.4M9.4 5.8v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
    ),
    closed: (
        <>
            {DISC}
            {CHECK}
        </>
    ),
    problem: (
        <>
            {DISC}
            <path d="M8 4.6v4.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="8" cy="11.2" r="1" fill="white" />
        </>
    ),
}
