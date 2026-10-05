import { describe, it, expect } from 'vitest'
import { buildSnapshot } from './firm-brief'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

/**
 * The firm brief is the AI surface with the widest reach — it sees the whole firm, not one
 * engagement — so what it sends is the most consequential payload in the product.
 *
 * These tests fix the privacy boundary in place: the brief reports the SHAPE of the pipeline, never
 * its monetary value, and never pairs a client's name with what they are worth. That pairing was
 * the most sensitive data in any request we make, and it supported a line the prompt forbids
 * writing anyway.
 */
function firm(over: Record<string, unknown> = {}): FirmInsightsResponse {
    return {
        currencySymbol: '£',
        pipelineValue: 400_000,
        closingSoonValue: 100_000,
        revenueAtRisk: 80_000,
        clientPipelineBreakdown: [
            { clientName: 'Acme Corporation', value: 250_000 },
            { clientName: 'DataSentry', value: 150_000 },
        ],
        clientCounts: { ACTIVE: 2, PROSPECT: 1, ON_HOLD: 0, PAST: 0 },
        activeEngagements: 3,
        totalEngagementCount: 5,
        engagementStatusBreakdown: { PLANNED: 1, PAUSED: 1 },
        overdueDueDates: 0,
        nearingDueDates: 0,
        ...over,
    } as unknown as FirmInsightsResponse
}

describe('buildSnapshot — monetary privacy', () => {
    it('sends no currency symbol or formatted amount', () => {
        const snap = buildSnapshot(firm())
        expect(snap).not.toContain('£')
        // The old `money()` helper rendered 100000 as "100K" and 1200000 as "1.2M".
        expect(snap).not.toMatch(/\d+(\.\d+)?[KM]\b/)
    })

    it('never emits a raw pipeline figure', () => {
        const snap = buildSnapshot(firm())
        for (const amount of ['400000', '100000', '80000', '250000', '150000']) {
            expect(snap, `leaked ${amount}`).not.toContain(amount)
        }
    })

    /** The most sensitive pairing in the payload: who the client is, and what they are worth. */
    it('never pairs a client name with a value', () => {
        const snap = buildSnapshot(firm())
        expect(snap).not.toContain('Acme Corporation')
        expect(snap).not.toContain('DataSentry')
    })

    it('describes pipeline as a share, which is what the advice turns on', () => {
        const snap = buildSnapshot(firm())
        // 100k of 400k closing soon; 80k of 400k at risk.
        expect(snap).toMatch(/25% of pipeline is closing within 30 days/)
        expect(snap).toMatch(/20% of pipeline/)
        expect(snap).toMatch(/2 client\(s\) carry pipeline value/)
    })

    it('does not divide by zero when there is no pipeline', () => {
        const snap = buildSnapshot(firm({
            pipelineValue: 0, closingSoonValue: 0, revenueAtRisk: 0, clientPipelineBreakdown: [],
        }))
        expect(snap).toMatch(/none of the pipeline/)
        expect(snap).not.toMatch(/NaN|Infinity/)
    })

    it('still reports counts, which are actionable without amounts', () => {
        const snap = buildSnapshot(firm())
        expect(snap).toMatch(/3 active of 5 total/)
    })
})
