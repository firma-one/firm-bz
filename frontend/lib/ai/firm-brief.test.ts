import { describe, it, expect } from 'vitest'
import { briefFingerprint, buildSnapshot, isBriefFresh } from './firm-brief'
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

/**
 * Reminders are one user's own (notes included), but the brief is cached firm-wide in
 * Firm.settings.aiBrief and read by every admin. Nothing from them may reach the prompt.
 */
describe('buildSnapshot — per-user data', () => {
    const personal = {
        id: 'r1',
        entityKey: 'platform.clients.id',
        entityValue: 'c1',
        action: 'Chase unpaid retainer',
        entityName: 'Initech Holdings',
        note: 'partner is going through a divorce',
        labelStyle: 'red',
    }

    it('leaves the generating admin\'s reminders out of the snapshot', () => {
        const snap = buildSnapshot(firm({
            urgentReminders: [personal],
            upcomingReminders: [{ ...personal, id: 'r2', labelStyle: 'amber' }],
        }))
        expect(snap).not.toContain('Chase unpaid retainer')
        expect(snap).not.toContain('Initech Holdings')
        expect(snap).not.toContain('divorce')
        expect(snap).not.toMatch(/reminder/i)
    })
})

/**
 * The brief sits beside the Engagements card, so it must read the same facts: the card's own pace
 * rule, overdue deliverables and what can't be tracked yet. It once said "nothing is at risk" beside
 * a card counting an engagement behind pace with a deliverable overdue.
 */
describe('buildSnapshot — the Overview\'s facts', () => {
    const DAY = 86400000
    const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString()
    const row = (over: Record<string, unknown> = {}) => ({
        engagementId: 'e1', name: 'Q2 Go-To-Market Positioning', slug: 'q2', clientName: 'DataSentry', clientSlug: 'ds',
        startDate: iso(-20), dueDate: iso(80), lead: null,
        deliverables: { total: 2, toDo: 1, inProgress: 1, inReview: 0, approved: 0, overdue: 1 },
        ...over,
    })

    it('lists what the card counts as needing attention, with why', () => {
        const snap = buildSnapshot(firm({ engagementRows: [row()] }))
        expect(snap).toContain("Needs attention (the Overview's count): 1 engagement(s): Q2 Go-To-Market Positioning (DataSentry) is behind pace: 0% of deliverables approved with 20% of its time used.")
        expect(snap).toContain('Overdue deliverables: 1 in Q2 Go-To-Market Positioning (DataSentry).')
    })

    it('says which engagements cannot be tracked yet', () => {
        const snap = buildSnapshot(firm({ engagementRows: [row({ engagementId: 'e2', name: 'DPDP Platform Mock', dueDate: null })] }))
        expect(snap).toContain("Can't be tracked yet: DPDP Platform Mock (DataSentry) has no due date.")
        expect(snap).not.toContain('Needs attention (the Overview')
    })

    it('adds nothing when every engagement is on pace', () => {
        const snap = buildSnapshot(firm({ engagementRows: [row({ deliverables: { total: 2, toDo: 0, inProgress: 0, inReview: 0, approved: 2, overdue: 0 } })] }))
        expect(snap).not.toMatch(/Needs attention|Overdue deliverables|Can't be tracked/)
    })
})

describe('briefFingerprint and isBriefFresh', () => {
    const DAY = 86400000
    const now = Date.now()
    const iso = (days: number) => new Date(now + days * DAY).toISOString()
    const onPace = { engagementId: 'e1', name: 'GTM', slug: 'gtm', clientName: 'Acme', clientSlug: 'a', startDate: iso(-20), dueDate: iso(80), lead: null,
        deliverables: { total: 2, toDo: 0, inProgress: 0, inReview: 0, approved: 2, overdue: 0 } }
    const behind = { ...onPace, deliverables: { ...onPace.deliverables, approved: 0, toDo: 2 } }

    it('changes when an engagement falls behind, not when a day merely passes', () => {
        const a = briefFingerprint(firm({ engagementRows: [onPace] }), now)
        expect(briefFingerprint(firm({ engagementRows: [behind] }), now)).not.toBe(a)
        expect(briefFingerprint(firm({ engagementRows: [onPace] }), now + DAY)).toBe(a)
    })

    it('treats an hour-fresh brief as stale once the facts behind it change', () => {
        const fp = briefFingerprint(firm({ engagementRows: [onPace] }), now)
        const brief = { content: 'x', generatedAt: new Date().toISOString(), fingerprint: fp }
        expect(isBriefFresh(brief, fp)).toBe(true)
        expect(isBriefFresh(brief, briefFingerprint(firm({ engagementRows: [behind] }), now))).toBe(false)
        // Saved before fingerprints existed: replaced once.
        expect(isBriefFresh({ content: 'x', generatedAt: new Date().toISOString() }, fp)).toBe(false)
        // Nothing to compare with: age alone, as before.
        expect(isBriefFresh(brief)).toBe(true)
    })
})
