/**
 * Section contract for the engagement summary — shared by the prompt, the publish gate and the UI.
 *
 * Deliberately free of any server-only dependency so client components can import it: the Publish
 * button needs the same completeness check the server enforces.
 */

/**
 * `authored: 'lead'` sections are reserved for human judgment by design, not because the model
 * is incapable of producing plausible text for them. Mitigation plans, contingencies and forward
 * commitments bind the firm to a course of action, and that decision belongs to a person who is
 * accountable for it. The model emits the heading with a placeholder; publishing is blocked
 * until a lead replaces it.
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
export const LEAD_PLACEHOLDER = '_Awaiting the Engagement Lead\u2019s input._'

/**
 * A section still counts as unfilled if it merely restates the placeholder.
 *
 * Exact-matching LEAD_PLACEHOLDER was too brittle: the model emits a straight apostrophe where
 * the constant has a curly one, so the gate silently passed and Publish was enabled with the
 * placeholder still in the text. This gate protects client-facing content, so it matches on
 * intent — normalised punctuation, plus the "awaiting …" phrasing in any form.
 */
function isPlaceholderText(body: string): boolean {
    const normalised = body
        .replace(/[\u2018\u2019]/g, "'")   // curly -> straight apostrophes
        .replace(/[_*`]/g, '')              // markdown emphasis
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    if (!normalised) return true
    return /^awaiting the engagement lead'?s input\.?$/.test(normalised)
        || /^to be completed by the engagement lead\.?$/.test(normalised)
}

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
        if (isPlaceholderText(body)) unfilled.push(section.heading)
    }
    return unfilled
}
