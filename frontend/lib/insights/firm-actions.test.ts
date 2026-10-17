import { describe, it, expect } from 'vitest'
import { firmActionCount, firmActionsFromInsights, setupGapsOf } from './firm-actions'
import type { FirmEngagementRow } from './firm-engagement-pace'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

const row = (over: Partial<FirmEngagementRow> = {}): FirmEngagementRow => ({
    engagementId: 'e1', name: 'GTM', slug: 'gtm', clientName: 'Acme', clientSlug: 'acme',
    startDate: '2026-09-01', dueDate: '2026-12-01', lead: { name: 'Ana', avatarUrl: null },
    deliverables: { total: 2, toDo: 2, inProgress: 0, inReview: 0, approved: 0, overdue: 0 },
    ...over,
})

describe('setupGapsOf', () => {
    it('names what an engagement still needs', () => {
        expect(setupGapsOf(row())).toEqual([])
        expect(setupGapsOf(row({ lead: null, dueDate: null, deliverables: { total: 0, toDo: 0, inProgress: 0, inReview: 0, approved: 0, overdue: 0 } })))
            .toEqual(['lead', 'due date', 'deliverables'])
    })
})

describe('firmActionsFromInsights', () => {
    const insights = {
        engagementsDueSoon: [
            { engagementId: 'a', engagementName: 'Late', engagementSlug: 'late', clientName: 'Acme', clientSlug: 'acme', dueDate: '', daysUntil: -3, status: 'ACTIVE' },
            { engagementId: 'b', engagementName: 'Soon', engagementSlug: 'soon', clientName: 'Acme', clientSlug: 'acme', dueDate: '', daysUntil: 5, status: 'ACTIVE' },
        ],
        prospectsToDecide: [
            { clientId: 'p1', clientName: 'Past', clientSlug: 'past', expectedCloseDate: '2026-10-01', daysPast: 16 },
        ],
        engagementRows: [row(), row({ engagementId: 'e2', name: 'Bare', lead: null })],
        unansweredThreads: [],
        clientsWithoutEngagement: [{ clientId: 'c', clientName: 'Idle', clientSlug: 'idle', pastValue: 0 }],
        invitationsToResend: [],
        currencySymbol: '$',
    } as unknown as FirmInsightsResponse

    const a = firmActionsFromInsights(insights)

    it('keeps only the work to do now', () => {
        expect(a.overdueEngagements).toEqual([expect.objectContaining({ slug: 'late', daysOverdue: 3 })])
        expect(a.prospects.map((p) => p.clientName)).toEqual(['Past'])
        expect(a.setupGaps).toEqual([expect.objectContaining({ name: 'Bare', missing: ['lead'] })])
        expect(a.idleClients).toHaveLength(1)
    })

    it('counts the kinds of work, not the items', () => {
        expect(firmActionCount(a)).toBe(4)
    })
})
