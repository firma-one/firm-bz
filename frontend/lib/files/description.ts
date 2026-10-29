/**
 * A document's description: what the firm wrote for it in the Details pane, kept in
 * `settings.description`. Searchable by its words and by meaning (lib/services/search-service.ts),
 * read by Brio, and written to the storage's own description field where it has one
 * (lib/files/native-description.ts).
 */

/** The description, trimmed; null when there's none. */
export function descriptionOf(settings: unknown): string | null {
    if (!settings || typeof settings !== 'object') return null
    const value = (settings as Record<string, unknown>).description
    return typeof value === 'string' && value.trim() ? value.trim() : null
}
