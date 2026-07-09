/**
 * Strips filler/stopwords from free text before embedding, so a query like
 * "show me sales playbook" embeds as "sales playbook" rather than being diluted
 * by conversational filler. Standalone module — not a modification of the
 * stopword list inlined in app/api/projects/[projectId]/search/route.ts.
 */
const STOPWORDS = new Set([
    'show', 'me', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
    'is', 'it', 'be', 'as', 'by', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can',
    'may', 'all', 'each', 'every', 'file', 'files',
])

export function cleanSemanticQuery(text: string): string {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    const filtered = words.filter((w) => !STOPWORDS.has(w.toLowerCase()))
    return (filtered.length > 0 ? filtered : words).join(' ')
}
