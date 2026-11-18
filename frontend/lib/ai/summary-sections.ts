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
    // Collaboration sits after Progress and before Risks: responsiveness is part of how the
    // engagement is running, not a risk in itself. An unanswered thread only becomes a risk once
    // it is old enough to threaten delivery, and Risks already covers that case.
    { heading: 'Collaboration', authored: 'ai' },
    { heading: 'Risks', authored: 'ai' },
    { heading: 'Mitigation & Contingency', authored: 'lead' },
    { heading: 'Needs Attention', authored: 'ai' },
    { heading: 'Next Steps', authored: 'lead' },
] as const

/** Text the model writes into lead-authored sections, and the marker publishing checks for. */
export const LEAD_PLACEHOLDER = '_Awaiting the Lead\u2019s input._'

/**
 * A section still counts as unfilled if it merely restates the placeholder.
 *
 * Exact-matching LEAD_PLACEHOLDER was too brittle: the model emits a straight apostrophe where
 * the constant has a curly one, so the gate silently passed and Publish was enabled with the
 * placeholder still in the text. This gate protects client-facing content, so it matches on
 * intent — normalised punctuation, plus the "awaiting …" phrasing in any form.
 */
export function isPlaceholderText(body: string): boolean {
    const normalised = body
        .replace(/[\u2018\u2019]/g, "'")   // curly -> straight apostrophes
        .replace(/[_*`]/g, '')              // markdown emphasis
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    if (!normalised) return true
    // "Engagement Lead" is the older wording, still in drafts saved before the role was renamed.
    return /^awaiting the (engagement )?lead'?s input\.?$/.test(normalised)
        || /^to be completed by the (engagement )?lead\.?$/.test(normalised)
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

/** The headings a lead writes (Mitigation & Contingency, Next Steps), in summary order. */
export const LEAD_SECTIONS: string[] = SUMMARY_SECTIONS.filter((s) => s.authored === 'lead').map((s) => s.heading)

/**
 * A summary split at its `## ` headings, in order. Text before the first heading comes back with
 * a null heading. Bodies are trimmed. Used by the review pane to draw each section, so the
 * lead-authored ones can be edited in place.
 */
export function splitSections(text: string): { heading: string | null; body: string }[] {
    const parts = text.split(/^## /m)
    const out: { heading: string | null; body: string }[] = []
    const preamble = parts[0].trim()
    if (preamble) out.push({ heading: null, body: preamble })
    for (const part of parts.slice(1)) {
        const nl = part.indexOf('\n')
        const heading = (nl === -1 ? part : part.slice(0, nl)).trim()
        const body = nl === -1 ? '' : part.slice(nl + 1).trim()
        out.push({ heading, body })
    }
    return out
}

/**
 * The summary as it publishes (.claude/plans/publish-and-send-update.md): a lead section nobody
 * wrote, still the placeholder or empty, is left out, heading and all, and so is any other heading
 * with nothing under it. Publishing used to refuse them instead, so "NA" was typed to get past.
 * Leaving them out keeps the old promise: the client-facing summary never claims a mitigation plan
 * or next steps that no person wrote. Text that loses nothing comes back as it was.
 */
export function dropUnfilledLeadSections(text: string): string {
    const sections = splitSections(text)
    const kept = sections.filter((s) => {
        if (s.heading === null) return true
        if (LEAD_SECTIONS.includes(s.heading)) return !isPlaceholderText(s.body)
        return s.body.trim() !== ''
    })
    if (kept.length === sections.length) return text.trim()
    return kept.map((s) => (s.heading === null ? s.body : `## ${s.heading}\n${s.body}`)).join('\n\n').trim()
}

/** The lead sections a summary doesn't have written: absent, empty or still the placeholder. */
export function missingLeadSections(text: string): string[] {
    const sections = splitSections(text)
    return LEAD_SECTIONS.filter((heading) => {
        const section = sections.find((s) => s.heading === heading)
        return !section || isPlaceholderText(section.body)
    })
}

/** Whether the summary names any risk: a Risks section with something in it. */
export function hasRisks(text: string): boolean {
    return splitSections(text).some((s) => s.heading === 'Risks' && s.body.trim() !== '')
}

const canonicalIndex = (heading: string | null) => (heading === null ? -1 : SUMMARY_SECTIONS.findIndex((s) => s.heading === heading))

/**
 * The summary with an empty heading for each lead section it lacks, placed where it belongs in
 * summary order, so an editor can offer them to fill in. Left empty, they're dropped again when
 * published (dropUnfilledLeadSections).
 */
export function withLeadSections(text: string): string {
    const sections = splitSections(text)
    let added = false
    for (const heading of LEAD_SECTIONS) {
        if (sections.some((s) => s.heading === heading)) continue
        const at = canonicalIndex(heading)
        let insertAt = sections.length && sections[0].heading === null ? 1 : 0
        sections.forEach((s, i) => {
            const ci = canonicalIndex(s.heading)
            if (ci !== -1 && ci < at) insertAt = i + 1
        })
        sections.splice(insertAt, 0, { heading, body: '' })
        added = true
    }
    if (!added) return text
    return sections.map((s) => (s.heading === null ? s.body : `## ${s.heading}\n${s.body}`)).join('\n\n').trim() + '\n'
}

/**
 * Replaces one section's body, leaving every other section exactly as it was. A heading the draft
 * does not have is appended at the end.
 */
export function writeSection(text: string, heading: string, body: string): string {
    const marker = `## ${heading}`
    const start = text.indexOf(marker)
    if (start === -1) return `${text.trimEnd()}\n\n${marker}\n${body.trim()}\n`
    const bodyStart = start + marker.length
    const next = text.slice(bodyStart).search(/\n##\s/)
    const after = next === -1 ? '' : text.slice(bodyStart + next)
    return `${text.slice(0, bodyStart)}\n${body.trim()}\n${after}`
}
