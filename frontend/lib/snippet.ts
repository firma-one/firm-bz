/**
 * Extractive alternative to lib/summarization.ts's model-generated summary: the leading
 * slice of the document text, whitespace-collapsed and cut at a word boundary. Selected
 * via SEARCH_SUMMARY_MODE in SearchService.indexFile — the distilbart path is retained
 * unchanged until snippet mode is signed off.
 */
export function extractSnippet(text: string, maxLen = 500): string | null {
    if (!text || text.length < 100) return null // mirrors generateSummary's too-short guard
    const collapsed = text.replace(/\s+/g, ' ').trim()
    if (collapsed.length < 100) return null
    if (collapsed.length <= maxLen) return collapsed
    const slice = collapsed.slice(0, maxLen)
    const lastSpace = slice.lastIndexOf(' ')
    // Only backtrack to the word boundary when it doesn't cost too much of the budget —
    // a single pathological unbroken token shouldn't shrink the snippet to nothing.
    return (lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trim()
}
