import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyPanel } from '@/components/ui/empty-panel'

/**
 * What a search shows when it couldn't run, in place of "No results" (EM-6). A failed search read as
 * an empty one tells the person the document isn't there, and they may upload it again. Same quiet
 * shape as LoadFailed (components/ui/load-failed.tsx), worded for a search.
 */
export function SearchFailed({ reason, onRetry, compact, className }: {
    reason?: string | null
    onRetry?: () => void
    compact?: boolean
    className?: string
}) {
    return (
        <EmptyPanel
            role="alert"
            compact={compact}
            className={className}
            icon={<AlertCircle />}
            title="Search couldn't run"
            description={searchFailureText(reason)}
            action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button> : undefined}
        />
    )
}

/** The reason, without a "Search couldn't run." the route may already have put first. */
export function searchFailureText(reason?: string | null): string {
    const text = (reason ?? '').replace(/^Search couldn['’]t run\.?\s*/i, '').trim()
    return text || 'Something went wrong. Try again.'
}

/**
 * The error for a search answer that wasn't ok. The auth guards answer bare "Unauthorized" and
 * "Forbidden", so those statuses get words of their own; otherwise the route's words when it gave some.
 */
export async function searchFailureFrom(res: Response): Promise<Error> {
    if (res.status === 401) return new Error('Sign in again to search.')
    if (res.status === 403) return new Error("You don't have access to search here.")
    const body = await res.json().catch(() => null) as { error?: unknown } | null
    const said = typeof body?.error === 'string' && body.error.trim() ? body.error : null
    return new Error(said ?? `The server answered ${res.status}. Try again.`)
}
