import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * A system admin route's failure, with the real reason. These routes answer only the Firma team
 * (`isSysAdminUser`), the people who can act on a database or provider message, so the error's own
 * text is the useful part rather than something to hide: "Couldn't load the stuck firms · relation
 * "firm" does not exist" beats "Failed to query stuck firms".
 *
 * `action` is what failed, read after "Couldn't": "load the stuck firms", "save the overrides".
 */
export function adminFailure(action: string, error: unknown, status = 500): NextResponse {
    logger.error(`[system] couldn't ${action}`, error as Error)
    return NextResponse.json({ error: `Couldn't ${action} · ${adminReason(error)}` }, { status })
}

/** The error's own words, for an admin. */
export function adminReason(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return typeof error === 'string' && error ? error : 'No reason was given.'
}
