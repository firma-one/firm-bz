/**
 * A per-instance cache for connector values that are safe to reuse for a short while — an access
 * token, a drive's base URL. One secure open makes several provider calls, and each used to read
 * the connector row again (two reads per Graph call); this makes it one read per minute.
 *
 * Entries live at most `ttlMs` and never past the `expiresAt` given to `set`. A disconnected
 * connector can keep working on another instance for up to `ttlMs`; `delete` clears this one.
 */
export function createShortLivedCache<T>(ttlMs: number) {
    const entries = new Map<string, { value: T; expiresAt: number }>()
    return {
        get(key: string): T | undefined {
            const entry = entries.get(key)
            if (!entry) return undefined
            if (entry.expiresAt <= Date.now()) {
                entries.delete(key)
                return undefined
            }
            return entry.value
        },
        set(key: string, value: T, expiresAt?: number) {
            const cap = Date.now() + ttlMs
            entries.set(key, { value, expiresAt: expiresAt === undefined ? cap : Math.min(expiresAt, cap) })
        },
        delete(key: string) {
            entries.delete(key)
        },
        clear() {
            entries.clear()
        },
    }
}

/** How long connector tokens and drive bases are reused. */
export const CONNECTOR_CACHE_TTL_MS = 60_000

/**
 * When a cached access token must be dropped: 30s before the provider's own expiry, so a call
 * never goes out with a token about to lapse. Undefined (just the TTL) when the expiry is unknown
 * or already past — e.g. right after a refresh, whose new expiry is written to the row, not returned.
 */
export function tokenCacheExpiry(tokenExpiresAt: Date | null | undefined): number | undefined {
    if (!tokenExpiresAt) return undefined
    const at = tokenExpiresAt.getTime() - 30_000
    return at > Date.now() ? at : undefined
}
