/**
 * Section contract for the engagement summary — shared by the prompt, the publish gate and the UI.
 *
 * Deliberately free of any server-only dependency so client components can import it: the Publish
 * button needs the same completeness check the server enforces.
 */

/**
 * `authored: 'lead'` sections are ones the model must never fill. Mitigation plans, contingencies
 * and forward commitments are human judgment, not facts derivable from delivery data. The model
 * emits the heading with a placeholder; publishing is blocked until a lead replaces it.
 */
export const SUMMARY_SECTIONS = [
    { heading: 'Summary', authored: 'ai' },
    { heading: 'Progress', authored: 'ai' },
    { heading: 'Risks', authored: 'ai' },
    { heading: 'Mitigation & Contingency', authored: 'lead' },
    { heading: 'Needs Attention', authored: 'ai' },
    { heading: 'Next Steps', authored: 'lead' },
] as const

/** Text the model writes into lead-authored sections, and the marker publishing checks for. */
export const LEAD_PLACEHOLDER = '_To be completed by the Engagement Lead._'

/**
 * Returns the lead-authored sections still holding the placeholder (or left empty).
 *
 * A plain string check, not an AI call: "did a human replace this text" has exactly one correct
 * answer, and a gate that is occasionally wrong is not a gate. It deliberately does not judge
 * whether what they wrote is any good — that judgment is the human's, which is the whole point.
 */
export function findUnfilledSections(text: string): string[] {
    const unfilled: string[] = []
    for (const section of SUMMARY_SECTIONS) {
        if (section.authored !== 'lead') continue
        const start = text.indexOf(`## ${section.heading}`)
        if (start === -1) continue
        const rest = text.slice(start + section.heading.length + 3)
        const next = rest.search(/\n##\s/)
        const body = (next === -1 ? rest : rest.slice(0, next)).trim()
        if (!body || body === LEAD_PLACEHOLDER) unfilled.push(section.heading)
    }
    return unfilled
}
