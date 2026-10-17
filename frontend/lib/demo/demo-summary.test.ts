import { describe, it, expect } from 'vitest'
import { buildDemoSummary, prettyName, type DemoSummaryInput } from './demo-summary'
import { SUMMARY_SECTIONS, findUnfilledSections, splitSections } from '@/lib/ai/summary-sections'

const input: DemoSummaryInput = {
    engagementName: 'Q3 - Growth Marketing Retainer',
    deliverables: [
        { docId: 'QGM-7', name: '01__Market_Research', stage: 'approved', dueDate: '2026-09-20', isOverdue: false },
        { docId: 'QGM-11', name: '02__Campaign_Plan', stage: 'in_review', dueDate: '2026-10-14', isOverdue: true },
        { docId: 'QGM-16', name: '03__Creative_Assets', stage: 'in_progress', dueDate: '2026-10-26', isOverdue: false },
    ],
    timePct: 76,
    deliveredPct: 33,
    daysLeft: 21,
    planningGaps: 8,
    resolvedThreads: 4,
}

describe('buildDemoSummary', () => {
    it('writes the seven sections Brio writes, in order', () => {
        const headings = splitSections(buildDemoSummary(input, { leadFilled: true })).map((s) => s.heading)
        expect(headings).toEqual(SUMMARY_SECTIONS.map((s) => s.heading))
    })

    it('fills the lead’s sections for the published sample', () => {
        expect(findUnfilledSections(buildDemoSummary(input, { leadFilled: true }))).toEqual([])
    })

    it('leaves the lead’s sections to the visitor in a fresh draft', () => {
        expect(findUnfilledSections(buildDemoSummary(input, { leadFilled: false }))).toEqual(['Mitigation & Contingency', 'Next Steps'])
    })

    it('names overdue work and falling behind as risks', () => {
        const risks = splitSections(buildDemoSummary(input, { leadFilled: true })).find((s) => s.heading === 'Risks')!.body
        expect(risks).toContain('QGM-11 — Campaign Plan is past its')
        expect(risks).toContain('33% of deliverables are approved with 76% of the time used')
    })
})

describe('prettyName', () => {
    it('turns a folder name into a title', () => {
        expect(prettyName('01__Market_&_Competitive_Intelligence_Report')).toBe('Market & Competitive Intelligence Report')
    })
})
