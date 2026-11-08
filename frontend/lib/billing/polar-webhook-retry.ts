/**
 * A Polar webhook that couldn't do its part must fail (non-2xx) so Polar delivers it again, and must
 * reach an operator. Code that throws {@link PolarWebhookRetryError} has already logged the error
 * (logger.error → Sentry), so the route answers 500 without logging it twice.
 *
 * Retries are bounded on our side too: once an event is older than {@link POLAR_WEBHOOK_RETRY_WINDOW_MS}
 * the route answers 200 and logs that it gave up, so a payload that can never succeed doesn't fail
 * forever, whatever Polar's own retry schedule is (not checked; read from code).
 */

export class PolarWebhookRetryError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PolarWebhookRetryError'
    }
}

/** Three days: long enough for an operator to fix a mapping and let Polar's next delivery land. */
export const POLAR_WEBHOOK_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/** When the event happened, from the payload's `timestamp` (a Date once the SDK parsed it, else ISO text). */
export function polarEventTime(payload: unknown): Date | null {
    if (!payload || typeof payload !== 'object') return null
    const t = (payload as { timestamp?: unknown }).timestamp
    const d = t instanceof Date ? t : typeof t === 'string' ? new Date(t) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
}

/** True while a failed event should still be retried. An event with no readable time is retried. */
export function withinPolarRetryWindow(payload: unknown, now: Date = new Date()): boolean {
    const at = polarEventTime(payload)
    if (!at) return true
    return now.getTime() - at.getTime() <= POLAR_WEBHOOK_RETRY_WINDOW_MS
}
