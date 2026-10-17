/**
 * Deliverable folders are often named for sorting in Drive: "01__Market & Competitive
 * Intelligence Report", "02_GTM_Strategy". Shown as titles, the number and underscores are noise;
 * the number can still matter (it is the firm's order), so it is returned apart to show muted.
 */
export function splitFolderOrdinal(name: string): { ordinal: string | null; title: string } {
    const m = name.match(/^(\d{1,3})[\s._-]+(.+)$/)
    const tidy = (s: string) => s.replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    if (m) return { ordinal: m[1], title: tidy(m[2]) }
    return { ordinal: null, title: tidy(name) }
}

/** The folder's title without its ordering number: "Market & Competitive Intelligence Report". */
export function displayFolderName(name: string): string {
    return splitFolderOrdinal(name).title
}
