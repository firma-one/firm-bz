import { describe, it, expect } from 'vitest'
import { countByPace, engagementPace, sortByPace, type FirmEngagementRow } from './firm-engagement-pace'

const NOW = new Date('2026-10-17T12:00:00').getTime()
const DAY = 86400000
const iso = (days: number) => new Date(NOW + days * DAY).toISOString()

function row(over: Partial<FirmEngagementRow> & { approved?: number; total?: number } = {}): FirmEngagementRow {
    const { approved = 0, total = 4, ...rest } = over
    return {
        engagementId: rest.name ?? 'e',
        name: 'Engagement',
        slug: 'e',
        clientName: 'Client',
        clientSlug: 'c',
        startDate: iso(-50),
        dueDate: iso(50),
        lead: null,
        deliverables: { total, toDo: total - approved, inProgress: 0, inReview: 0, approved, overdue: 0 },
        ...rest,
    }
}

describe('engagementPace', () => {
    it('is overdue once the engagement is past its due date, whatever its deliverables', () => {
        const p = engagementPace(row({ dueDate: iso(-3), approved: 4 }), NOW)
        expect(p.key).toBe('overdue')
        expect(p.daysLeft).toBe(-3)
    })

    it('weighs deliverables approved against the time used', () => {
        // Half the time gone.
        expect(engagementPace(row({ approved: 2 }), NOW).key).toBe('on_pace')          // 50% delivered
        expect(engagementPace(row({ approved: 2, total: 5 }), NOW).key).toBe('slightly_behind') // 40%: 10 points behind
        expect(engagementPace(row({ approved: 1 }), NOW).key).toBe('behind')           // 25%: 25 points behind
        expect(engagementPace(row({ approved: 2 }), NOW)).toMatchObject({ timePct: 50, deliveredPct: 50, daysLeft: 50 })
    })

    it('says why it can\'t judge: no due date, or no deliverables yet', () => {
        expect(engagementPace(row({ dueDate: null }), NOW)).toMatchObject({ key: 'no_due_date', timePct: null, daysLeft: null })
        expect(engagementPace(row({ total: 0 }), NOW)).toMatchObject({ key: 'no_deliverables', deliveredPct: null })
    })
})

describe('sortByPace and countByPace', () => {
    const rows = [
        row({ name: 'On pace', approved: 2 }),
        row({ name: 'No date', dueDate: null }),
        row({ name: 'Behind, due later', approved: 0 }),
        row({ name: 'Slightly behind', approved: 2, total: 5 }),
        row({ name: 'Overdue', dueDate: iso(-1) }),
        row({ name: 'Behind, due sooner', approved: 0, startDate: iso(-20), dueDate: iso(20) }),
    ]

    it('puts the worst first, the soonest due first within a group', () => {
        expect(sortByPace(rows, NOW).map((r) => r.name)).toEqual(['Overdue', 'Behind, due sooner', 'Behind, due later', 'Slightly behind', 'On pace', 'No date'])
    })

    it('counts each group', () => {
        expect(countByPace(rows, NOW)).toEqual({ overdue: 1, behind: 2, slightly_behind: 1, on_pace: 1, no_deliverables: 0, no_due_date: 1 })
    })
})
