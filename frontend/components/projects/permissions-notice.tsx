'use client'

import { AlertCircle } from 'lucide-react'
import { failureFrom } from '@/lib/files/action-failure'

/**
 * Loading the caller's permissions for a firm or client view, and what to say when that fails.
 *
 * A failed load used to fall back to "no permissions": Settings, Audit, Members and New client
 * vanished, exactly as though the person lacked access, and an admin had no way to tell. Now it says
 * so, quietly, with a retry, and the admin-only pages stay hidden only until it loads.
 */

/** GET /api/permissions/firm…, or throws with the route's reason (fetch's TypeError when it never left). */
export async function fetchFirmPermissions(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url)
    if (!res.ok) throw await failureFrom(res)
    return res.json()
}

export function PermissionsNotice({ reason, onRetry }: { reason: string; onRetry: () => void }) {
    return (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card bg-surface-muted px-3 py-2 text-small text-fg-muted">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-tag-yellow-fg" aria-hidden />
            <span>Couldn&apos;t load your permissions · {reason} Pages for admins stay hidden until they load.</span>
            <button type="button" onClick={onRetry} className="font-medium text-fg underline-offset-2 hover:underline">
                Try again
            </button>
        </div>
    )
}
