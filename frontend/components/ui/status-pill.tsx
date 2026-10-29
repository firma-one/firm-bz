import * as React from 'react'
import { cn } from '@/lib/utils'
import { STAGE_PILL_CLASSES, statusOf, type StatusKind, type StatusValues } from '@/lib/ui/status'
import { StatusIcon } from '@/components/ui/status-icon'

/**
 * A status in the app-wide status language: the stage's icon plus the lifecycle's own label, in the
 * stage's pastel pill (lib/ui/status.ts). Also the group header for Board lanes and "By status" lists.
 *
 * Replaces the dot-style StatusPill in components/ui/tag.tsx as screens move over (waves 2 and 3).
 * No `overdue` here on purpose: overdue is a red date beside the pill, not a status.
 */
export function StatusPill<K extends StatusKind>({
    kind,
    status,
    className,
    ...props
}: {
    kind: K
    status: StatusValues[K] | string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>) {
    const { stage, label, muted } = statusOf(kind, status)
    return (
        <span
            className={cn(
                'inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-control pl-1 pr-1.5 text-caption',
                muted ? 'border border-dashed border-line-strong bg-transparent text-fg-subtle' : STAGE_PILL_CLASSES[stage],
                className
            )}
            {...props}
        >
            <StatusIcon stage={stage} size={13} />
            <span className="truncate">{label}</span>
        </span>
    )
}
