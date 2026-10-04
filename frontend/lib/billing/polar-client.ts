/**
 * Server-only: shared Polar client factory and API version pin.
 *
 * Polar uses date-based API versioning (YYYY-MM). A request that carries no
 * `Polar-Version` header follows *Current*, which rolls forward on the first
 * week of January, April, July and October — so an unpinned integration has its
 * contract changed under it every quarter with no code change.
 *
 * Every call we make pins `POLAR_API_VERSION` instead. Moving to a newer
 * version is then a single deliberate edit here, made after reviewing the
 * changelog for the endpoints we actually use (products, customers,
 * subscriptions, checkouts, customer portal).
 *
 * Note: webhook endpoints are versioned separately, server-side, and are not
 * affected by this header.
 */

import { HTTPClient, Polar } from '@polar-sh/sdk'

/** Pinned Polar API contract. Bump deliberately, never implicitly. */
export const POLAR_API_VERSION = '2026-04'

export function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

/** Headers for hand-rolled `fetch` calls against the Polar REST API. */
export function polarVersionHeaders(extra?: Record<string, string>): Record<string, string> {
    return { 'Polar-Version': POLAR_API_VERSION, ...extra }
}

/**
 * The SDK has no version option of its own, so the pin is injected per request.
 * `new Request(req, ...)` is the documented way to amend a request in a
 * `beforeRequest` hook — the original is discarded by the caller.
 */
function versionPinnedHttpClient(): HTTPClient {
    const client = new HTTPClient()
    client.addHook('beforeRequest', (req) => {
        const next = new Request(req)
        next.headers.set('Polar-Version', POLAR_API_VERSION)
        return next
    })
    return client
}

/** Build a Polar SDK client pinned to {@link POLAR_API_VERSION}. */
export function createPolarClient(accessToken: string): Polar {
    return new Polar({
        accessToken,
        server: polarServer(),
        httpClient: versionPinnedHttpClient(),
    })
}
