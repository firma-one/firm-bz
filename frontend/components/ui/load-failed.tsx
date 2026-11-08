import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyPanel } from '@/components/ui/empty-panel'

/**
 * What a list or pane shows when its load failed, in place of its empty state. A failed load must
 * never read as "nothing here" ("You're all caught up", "No results", "No members yet"): the person
 * would act on it. Same quiet shape as EmptyPanel, with the reason and a way to try again.
 */
export interface LoadFailedProps {
    /** What didn't load, as it reads after "Couldn't load": "your Inbox", "the Board", "members". */
    what: string
    /** Why, when known: the server's or the storage's words. */
    reason?: string | null
    onRetry?: () => void
    compact?: boolean
    className?: string
}

export function LoadFailed({ what, reason, onRetry, compact, className }: LoadFailedProps) {
    return (
        <EmptyPanel
            role="alert"
            compact={compact}
            className={className}
            icon={<AlertCircle />}
            title={`Couldn't load ${what}`}
            description={reason || 'Something went wrong. Try again.'}
            action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button> : undefined}
        />
    )
}
