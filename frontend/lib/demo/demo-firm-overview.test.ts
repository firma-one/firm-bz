import { describe, it, expect } from 'vitest'
import { buildDemoFirmActions, buildDemoFirmOverview } from './demo-firm-overview'
import { getDemoDeliverables } from './demo-deliverables'
import { DEMO_FIRM } from './static-demo-data'

const NOW = new Date('2026-10-17T12:00:00').getTime()

describe('buildDemoFirmOverview', () => {
    const firm = DEMO_FIRM
    const data = buildDemoFirmOverview(firm, NOW)
    const engagements = firm.clients.flatMap((c) => c.engagements)

    it('has a row per sample engagement, with the board\'s deliverables', () => {
        expect(data.engagementRows).toHaveLength(engagements.length)
        for (const row of data.engagementRows) {
            const engagement = engagements.find((e) => e.slug === row.slug)!
            expect(row.deliverables.total).toBe(getDemoDeliverables(engagement).length)
            const d = row.deliverables
            expect(d.toDo + d.inProgress + d.inReview + d.approved).toBe(d.total)
        }
    })

    it('counts every engagement in the types, as the app now does', () => {
        expect(data.contractTypes.reduce((s, t) => s + t.count, 0)).toBe(engagements.length)
    })

    it('adds up the pipeline by client', () => {
        expect(data.pipeline.total).toBe(data.pipeline.items.reduce((s, i) => s + i.value, 0))
        expect(data.pipeline.items.reduce((s, i) => s + i.engagementCount, 0)).toBe(engagements.length)
    })

    it('gives the tour\'s Action Center a comment to reply to and an invitation to resend', () => {
        const actions = buildDemoFirmActions(firm, NOW)
        expect(actions.threads).toHaveLength(1)
        expect(actions.invitations).toEqual([expect.objectContaining({ daysUntilExpiry: 2 })])
        // Every sample engagement has a lead, a due date and deliverables.
        expect(actions.setupGaps).toEqual([])
    })
})
