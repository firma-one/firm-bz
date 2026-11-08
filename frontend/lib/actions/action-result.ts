import { unstable_rethrow } from 'next/navigation'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { ApiError } from '@/lib/errors/api-error'
import { logger } from '@/lib/logger'

/**
 * A server action's answer when the person may need to read why it didn't work.
 *
 * A reason can't be thrown from a server action: in a production build React replaces whatever reaches
 * the browser with "Minified React error #441", and an error's class doesn't survive either, so
 * `e.message` and `instanceof` are useless there. (`next dev` keeps the message, which hides this.)
 * What an action returns does arrive. So an action a person calls from the browser answers with
 * `asResult`, and its throws that are meant to be read are `UserFacingError`s.
 */
export type ActionResult<T = void> =
    | { ok: true; data: T; warning?: string }
    | { ok: false; error: string; code?: string }

/** An error whose message was written for the person who asked, so it's safe to show as it is. */
export class UserFacingError extends Error {
    readonly code?: string

    constructor(message: string, code?: string) {
        super(message)
        this.name = 'UserFacingError'
        this.code = code
    }
}

/** Shorthand for `throw userFacing('A client with this name already exists', 'name_taken')`. */
export function userFacing(message: string, code?: string): UserFacingError {
    return new UserFacingError(message, code)
}

export const GENERIC_ACTION_FAILURE = 'Something went wrong on our side. Try again.'

/** The words to show for an error, when it carries words meant for a person. */
export function userFacingOf(e: unknown): { message: string; code?: string } | null {
    if (e instanceof UserFacingError) return { message: e.message, code: e.code }
    if (e instanceof StorageFailure) return { message: e.message, code: e.reason }
    if (e instanceof ApiError && e.statusCode < 500) return { message: e.message, code: e.code }
    return null
}

/**
 * Runs an action and answers with its result, or with words a person can read. Only errors written for
 * people pass through; anything else is logged with `context` and answers a plain sentence, so a raw
 * Prisma or provider message never reaches the screen. Redirects and not-found still throw.
 */
export async function asResult<T>(context: string, run: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        return { ok: true, data: await run() }
    } catch (e) {
        unstable_rethrow(e)
        const shown = userFacingOf(e)
        if (shown) return { ok: false, error: shown.message, ...(shown.code ? { code: shown.code } : {}) }
        logger.error(`[${context}] failed`, e instanceof Error ? e : new Error(String(e)))
        return { ok: false, error: GENERIC_ACTION_FAILURE, code: 'internal' }
    }
}

/** For the browser: the value, or throw an Error with the action's words so a catch can show them. */
export function unwrapResult<T>(result: ActionResult<T>): T {
    if (!result.ok) throw new Error(result.error)
    return result.data
}
