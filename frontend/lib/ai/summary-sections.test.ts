import { describe, it, expect } from 'vitest'
import { findUnfilledSections, LEAD_PLACEHOLDER, SUMMARY_SECTIONS } from './summary-sections'

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
