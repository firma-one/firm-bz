/**
 * When `/d` can't provision someone's first firm it sends them to `/d/onboarding` with the reason
 * in this query param, and onboarding says so with a Retry that goes back to `/d` (P1-22).
 * Client-safe: no server imports.
 */
export const PROVISION_ERROR_PARAM = 'provision_error'

/** Words for a provisioning failure, without internal detail. */
export function provisionFailureReason(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err ?? '')
    if (/polar/i.test(msg)) return "Our billing provider didn't answer. Try again in a minute."
    if (/fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timed out|Can't reach database/i.test(msg)) {
        return "Our servers didn't answer. Try again in a minute."
    }
    return 'Something went wrong on our side. Try again.'
}
