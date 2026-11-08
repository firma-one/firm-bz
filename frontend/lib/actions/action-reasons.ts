import { asResult, userFacing, userFacingOf, type ActionResult, type UserFacingError } from '@/lib/actions/action-result'
import { prisma } from '@/lib/prisma'

/**
 * Words the server actions share, and `asResult` for an action that can answer "done, but…".
 *
 * Next to lib/actions/action-result.ts (shared and stable) rather than in it. A plain module, not a
 * 'use server' one: these are helpers the actions import, never endpoints.
 */

/** The session is gone: the one thing the person can do is sign in again. */
export function signedOut(): UserFacingError {
    return userFacing('Your session has ended. Sign in again.', 'unauthorized')
}

/** A plain not-allowed check, said plainly: "You don't have permission to change this client." */
export function notAllowed(toDoWhat?: string): UserFacingError {
    return userFacing(toDoWhat ? `You don't have permission to ${toDoWhat}.` : "You don't have permission to do this.", 'forbidden')
}

/** The thing was deleted, or never was: "This client was deleted. Refresh the page." */
export function gone(what: string): UserFacingError {
    return userFacing(`${what} Refresh the page.`, 'not_found')
}

/**
 * `asResult` for an action whose work can be done with a problem the person should know about:
 * `run` answers `{ data, warning? }`, and the result carries the warning beside the data.
 */
export async function asResultWithWarning<T>(
    context: string,
    run: () => Promise<{ data: T; warning?: string }>,
): Promise<ActionResult<T>> {
    const result = await asResult(context, run)
    if (!result.ok) return result
    return { ok: true, data: result.data.data, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

/** An error's words when they were written for people (a StorageFailure, a userFacing throw), else none. */
export function readableReason(e: unknown): string | undefined {
    return userFacingOf(e)?.message
}

/** "Google Drive", "OneDrive", or "storage" when the connector's type can't be read. */
export async function connectorProviderName(connectorId: string | null | undefined): Promise<string> {
    if (!connectorId) return 'storage'
    try {
        const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
        if (connector?.type === 'GOOGLE_DRIVE') return 'Google Drive'
        if (connector?.type === 'ONEDRIVE') return 'OneDrive'
    } catch {
        // The sentence still reads without the name.
    }
    return 'storage'
}

/**
 * The engagement-manager gate (lib/permissions/require-engagement-manager.ts), in words a person can
 * read. That gate throws plain errors that would reach the browser as #441; anything else it throws
 * (the database) passes through as it is.
 */
export async function requireEngagementManagerTo(engagementId: string, toDoWhat: string) {
    const { requireEngagementManager } = await import('@/lib/permissions/require-engagement-manager')
    try {
        return await requireEngagementManager(engagementId)
    } catch (e) {
        const message = e instanceof Error ? e.message : ''
        if (message === 'Unauthorized') throw signedOut()
        if (message === 'Engagement not found') throw gone('This engagement was deleted.')
        if (message === 'Insufficient permissions') throw notAllowed(toDoWhat)
        throw e
    }
}
