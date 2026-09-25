import 'server-only'
import { createHash } from 'crypto'
import type { InterpretCandidates, InterpretResult } from './search-interpreter'

/**
 * In-process cache for search interpretation.
 *
 * Interpretation is deterministic for a given question asked against a given set of visible
 * entities, so an identical repeat search should not cost another model call — or another 0.5
 * credits. Without this, navigating away and re-running the same search bills twice.
 *
 * **The key must include the candidate set, not just the text.** Resolution is scoped to what the
 * caller can see: "Acme" resolves against *their* client list. If their access changes, or a
 * client is renamed or added, the same words must resolve again rather than return a stale answer
 * computed against a list that no longer exists. Hashing the candidate ids and names gives that
 * invalidation for free — any change to the visible set produces a different key.
 *
 * Deliberately in-process and unshared. A cross-instance cache (Redis) would need the same key and
 * would be a straight swap, but the win here is a user repeating themselves within a session,
 * which a local map already captures. Nothing here is correctness-critical: a miss costs one model
 * call, exactly as today.
 */

const TTL_MS = 15 * 60 * 1000
/** Bounded so a long-lived server process cannot grow this without limit. */
const MAX_ENTRIES = 500

interface Entry {
    value: InterpretResult
    expiresAt: number
}

const cache = new Map<string, Entry>()

/**
 * Fingerprints the candidate set. Ids alone would miss a rename — the model resolves against
 * *names*, so a renamed client must invalidate even though its id is unchanged.
 */
function hashCandidates(c: InterpretCandidates): string {
    const h = createHash('sha256')
    for (const kind of [c.clients, c.engagements, c.deliverables]) {
        for (const e of kind) h.update(e.id).update('\u0000').update(e.name).update('\u0001')
        h.update('\u0002')
    }
    return h.digest('hex').slice(0, 32)
}

/** Case- and whitespace-insensitive: "Acme  SOW" and "acme sow" are the same question. */
function normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildInterpretCacheKey(
    firmId: string,
    userId: string,
    text: string,
    candidates: InterpretCandidates,
): string {
    // userId is in the key as a second line of defence. The candidate hash already differs between
    // users with different access, but two users with identical scope would otherwise share an
    // entry — correct today, yet a subtle thing to rely on if scoping ever changes.
    return `${firmId}:${userId}:${hashCandidates(candidates)}:${normalizeText(text)}`
}

export function getCachedInterpretation(key: string): InterpretResult | null {
    const hit = cache.get(key)
    if (!hit) return null
    if (hit.expiresAt <= Date.now()) {
        cache.delete(key)
        return null
    }
    return hit.value
}

export function setCachedInterpretation(key: string, value: InterpretResult): void {
    if (cache.size >= MAX_ENTRIES) {
        // Map preserves insertion order, so the oldest key is first. Evicting a handful at once
        // avoids doing this on every write once the cache is warm.
        for (const k of Array.from(cache.keys()).slice(0, Math.ceil(MAX_ENTRIES * 0.1))) cache.delete(k)
    }
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
}
