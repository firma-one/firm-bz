'use client'

import { AlertTriangle } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { statusOf } from '@/lib/ui/status'
import type { ActivityStatus } from '@/lib/sharing-settings'
import { cn } from '@/lib/utils'

/**
 * The Due cell's warning for work underway with no due date (needsDueDate in lib/ui/due-date.ts):
 * In progress or In review and nothing to finish by, which reads as unplanned work.
 */
export function MissingDueWarning({ stage, className }: { stage: ActivityStatus; className?: string }) {
    const label = statusOf('deliverable', stage).label
    return (
        <Hint label={`${label} with no due date. Set one so the work is planned.`}>
            <span
                className={cn('inline-flex shrink-0 items-center text-tag-yellow-fg', className)}
                aria-label={`${label} with no due date`}
                role="img"
            >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
        </Hint>
    )
}
