import { BRAND_NAME } from '@/config/brand'

/**
 * Words for sign-in and sign-up failures, shared by the sign-in flow and the sign-up form.
 */

/** A rejected server action (the request never got there, or the server fell over). */
export const SERVER_UNREACHABLE = `Couldn't reach ${BRAND_NAME}. Check your connection and try again.`

export function authRequestFailure(e: unknown): string {
    if (e instanceof TypeError) return SERVER_UNREACHABLE
    const msg = e instanceof Error ? e.message : ''
    if (/fetch|network|load failed/i.test(msg)) return SERVER_UNREACHABLE
    return 'Something went wrong on our side. Try again.'
}

/**
 * Turnstile keeps failing where a blocker or the browser stops it (the known 600010). Retry a few
 * times, then stop and say what to do, instead of "Retrying…" forever (P1-21).
 */
export const TURNSTILE_MAX_ERRORS = 3
export const TURNSTILE_RETRYING = 'The security check failed. Trying again…'
export const TURNSTILE_BLOCKED =
    "We couldn't run the security check. Turn off blockers for this site or try another browser, then press Continue to try again."

/** What to do after the `count`th Turnstile error in a row. */
export function turnstileErrorStep(count: number): 'retry' | 'retry_with_notice' | 'stop' {
    if (count >= TURNSTILE_MAX_ERRORS) return 'stop'
    return count > 1 ? 'retry_with_notice' : 'retry'
}

/**
 * `/signin?error=auth_code_error` from `/auth/callback`: Google or Microsoft sign-in came back but
 * the session couldn't be set up (P1-19). The provider's sentence comes along when there is one.
 */
export function authCallbackErrorMessage(code: string | null, description: string | null): string | null {
    if (code !== 'auth_code_error') return null
    const detail = description?.trim()
    return detail
        ? `Google or Microsoft sign-in didn't finish · ${detail.replace(/\.?$/, '.')} Please try again.`
        : "Google or Microsoft sign-in didn't finish. Please try again, or get a code by email."
}
