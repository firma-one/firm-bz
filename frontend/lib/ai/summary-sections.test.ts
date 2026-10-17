import { describe, it, expect } from 'vitest'
import { findUnfilledSections, LEAD_PLACEHOLDER, LEAD_SECTIONS, SUMMARY_SECTIONS, splitSections, writeSection } from './summary-sections'

const build = (mitigation: string, nextSteps: string) => `## Summary
Things are on track.

## Progress
Two deliverables approved.

## Collaboration
One thread on QSR-9, answered.

## Risks
Nothing material.

## Mitigation & Contingency
${mitigation}

## Needs Attention
Nothing requires immediate attention.

## Next Steps
${nextSteps}
`

describe('findUnfilledSections', () => {
    it('flags both lead sections when the model leaves its placeholder', () => {
        expect(findUnfilledSections(build(LEAD_PLACEHOLDER, LEAD_PLACEHOLDER)))
            .toEqual(['Mitigation & Contingency', 'Next Steps'])
    })

    it('passes when a human has written both', () => {
        expect(findUnfilledSections(build('Reassign QSR-9 to Priya.', 'Client call Thursday.')))
            .toEqual([])
    })

    it('flags a straight apostrophe where the constant has a curly one', () => {
        // The bug this gate shipped with: LEAD_PLACEHOLDER uses U+2019, the model emits U+0027,
        // exact matching passed, and Publish was enabled with the placeholder still in the text.
        const straight = "_Awaiting the Engagement Lead's input._"
        expect(straight).not.toBe(LEAD_PLACEHOLDER)
        expect(findUnfilledSections(build(straight, straight))).toHaveLength(2)
    })

    it.each([
        ['without markdown emphasis', 'Awaiting the Engagement Lead’s input.'],
        ['with extra whitespace', '  _Awaiting  the Engagement Lead’s   input._  '],
        ['with different casing', '_AWAITING THE ENGAGEMENT LEAD’S INPUT._'],
        ['phrased as to-be-completed', 'To be completed by the Engagement Lead.'],
        ['left entirely empty', ''],
    ])('flags a placeholder %s', (_label, text) => {
        expect(findUnfilledSections(build(text, 'Real next step.')))
            .toEqual(['Mitigation & Contingency'])
    })

    it('ignores a section that is absent entirely', () => {
        // Summaries generated before Collaboration existed must stay publishable.
        expect(findUnfilledSections('## Summary\nShort.\n')).toEqual([])
    })

    it('only gates lead-authored sections', () => {
        const aiSections = SUMMARY_SECTIONS.filter((s) => s.authored === 'ai').map((s) => s.heading)
        const flagged = findUnfilledSections(build(LEAD_PLACEHOLDER, LEAD_PLACEHOLDER))
        for (const heading of aiSections) expect(flagged).not.toContain(heading)
    })
})

describe('splitSections and writeSection', () => {
    const draft = build(LEAD_PLACEHOLDER, LEAD_PLACEHOLDER)

    it('splits a summary at its headings, in order', () => {
        const sections = splitSections(draft)
        expect(sections.map((s) => s.heading)).toEqual(SUMMARY_SECTIONS.map((s) => s.heading))
        expect(sections[0].body).toBe('Things are on track.')
    })

    it('names the sections a lead writes', () => {
        expect(LEAD_SECTIONS).toEqual(['Mitigation & Contingency', 'Next Steps'])
    })

    it('fills one section and leaves the rest as they were', () => {
        const filled = writeSection(draft, 'Mitigation & Contingency', 'Weekly check-ins with the client.')
        expect(findUnfilledSections(filled)).toEqual(['Next Steps'])
        const before = splitSections(draft)
        const after = splitSections(filled)
        expect(after.map((s) => s.heading)).toEqual(before.map((s) => s.heading))
        expect(after.filter((s) => s.heading !== 'Mitigation & Contingency')).toEqual(before.filter((s) => s.heading !== 'Mitigation & Contingency'))
        expect(after.find((s) => s.heading === 'Mitigation & Contingency')?.body).toBe('Weekly check-ins with the client.')
    })

    it('fills the last section too', () => {
        const filled = writeSection(draft, 'Next Steps', 'Confirm scope by Friday.')
        expect(splitSections(filled).at(-1)).toEqual({ heading: 'Next Steps', body: 'Confirm scope by Friday.' })
    })

    it('appends a section the draft does not have', () => {
        const filled = writeSection('## Summary\nAll good.', 'Next Steps', 'Close out.')
        expect(splitSections(filled)).toEqual([
            { heading: 'Summary', body: 'All good.' },
            { heading: 'Next Steps', body: 'Close out.' },
        ])
    })
})
