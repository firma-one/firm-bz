/**
 * Converted previews, held for the life of the tab.
 *
 * Converting an Office file to PDF costs 5-10s on the provider, and the pane remounts on
 * every open (the file list bumps a `key`), so reopening the same document paid that again
 * from scratch. The bytes are kept here instead.
 *
 * Keyed on the provider's `modifiedTime`, so an edit upstream produces a different key and
 * the old entry is simply never read again — a stale file cannot be served. Caveat: that
 * timestamp comes from the file list, so an entry can only be as fresh as the listing the
 * user is looking at; refreshing the list changes the key. Documents with no timestamp are
 * not cached at all rather than risk it.
 *
 * Memory only, never disk, so this does not weaken the download-discouragement posture the
 * preview route sets up. Dies with the tab.
 */
const PREVIEW_CACHE_BUDGET_BYTES = 128 * 1024 * 1024
export interface CachedPreview {
    contentType: string
    /** null for a type we hand to the iframe pane — remembering the verdict still saves the
     *  round trip needed to discover it is not a PDF. */
    bytes: ArrayBuffer | null
}
const previewCache = new Map<string, CachedPreview>()

export function cacheRead(key: string): CachedPreview | undefined {
    const hit = previewCache.get(key)
    if (!hit) return undefined
    // Re-insert so Map iteration order doubles as least-recently-used.
    previewCache.delete(key)
    previewCache.set(key, hit)
    return hit
}

export function cacheWrite(key: string, value: CachedPreview) {
    previewCache.set(key, value)

    // forEach walks in insertion order, so `keys` is oldest-first. (No for..of: the
    // project targets es5 and Map iterators are not available.)
    const keys: string[] = []
    let total = 0
    previewCache.forEach((entry, k) => {
        keys.push(k)
        total += entry.bytes?.byteLength ?? 0
    })

    let i = 0
    while (total > PREVIEW_CACHE_BUDGET_BYTES && previewCache.size > 1 && i < keys.length) {
        const oldest = keys[i++]
        if (oldest === key) continue // never evict the entry just written
        total -= previewCache.get(oldest)?.bytes?.byteLength ?? 0
        previewCache.delete(oldest)
    }
}

/** Key a document's entry. Version is the provider's modification time. */
export function previewCacheKey(projectId: string, documentId: string, version: string): string {
    return `${projectId}:${documentId}:${version}`
}

/**
 * Drop every cached version of one document.
 *
 * Reload exists because a reader believes what they are looking at is stale — most often
 * because the provider has only just finished converting, or someone edited upstream and
 * the listing has not caught up, so `modifiedTime` has not changed and the key still
 * matches. Without this, reload would re-serve the same bytes and appear to do nothing.
 */
export function evictPreview(projectId: string, documentId: string): void {
    const prefix = `${projectId}:${documentId}:`
    const doomed: string[] = []
    previewCache.forEach((_, key) => { if (key.startsWith(prefix)) doomed.push(key) })
    for (const key of doomed) previewCache.delete(key)
}
