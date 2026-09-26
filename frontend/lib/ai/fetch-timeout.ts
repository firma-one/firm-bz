/**
 * Fetch with a hard timeout, for the AI surfaces.
 *
 * None of the AI routes can hang forever on their own: a stalled upstream leaves the caller's
 * spinner running and its input disabled until the browser's own socket timeout, which can be
 * minutes. Every AI feature is an enhancement over a page that already works, so waiting that
 * long is never the right trade — failing fast returns the user to a working page.
 *
 * Safe to import from client components: no `server-only`, no SDK, no key.
 */

/** Generation is slower than interpretation; callers pass the budget that fits their surface. */
export const AI_TIMEOUT_MS = {
    /** Short, single-shot resolution before a search runs. */
    interpret: 15_000,
    /** A brief is one non-streaming completion over a pre-computed payload. */
    brief: 45_000,
    /**
     * Streaming surfaces. The budget covers the whole stream, not the first byte — a summary
     * runs to seven sections, so this is deliberately generous.
     */
    stream: 120_000,
} as const

/** Thrown when the budget elapses, so callers can distinguish a timeout from a transport error. */
export class AiTimeoutError extends Error {
    constructor(ms: number) {
        super(`Timed out after ${Math.round(ms / 1000)}s`)
        this.name = 'AiTimeoutError'
    }
}

/**
 * `fetch` with an abort after `timeoutMs`.
 *
 * Note for streaming callers: the timer is cleared once headers arrive, so a long-running stream
 * is not cut off mid-flight by this helper. It bounds how long we wait to *start* receiving, which
 * is the case that actually hangs. A stream that dies mid-way is handled by the caller's read loop.
 */
export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs: number = AI_TIMEOUT_MS.brief,
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        return await fetch(input, { ...init, signal: controller.signal })
    } catch (error) {
        // An AbortError here is ours — no caller passes its own signal today. Translate it so the
        // UI can say "took too long" rather than the browser's opaque abort message.
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AiTimeoutError(timeoutMs)
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}
