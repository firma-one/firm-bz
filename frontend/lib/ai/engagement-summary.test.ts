import { describe, it, expect } from 'vitest'
import { fingerprintInsights } from './engagement-summary'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/**
 * The fingerprint decides when a published summary is marked stale. Its rule is:
 * **hash what a PERSON changed, never what the CLOCK changed.**
 *
 * Violating it shipped a bug where every summary flagged stale overnight, because a
 * time-elapsed pace penalty fed the hash.
 */
const base = () => ({
    engagementDueDate: '2026-12-31',
    kickoffDate: '2026-10-01',
    deliveryHealth: { approvedCount: 1, totalCount: 4, stalledInReview: 0 },
    sharesProgress: { toDo: 3, inProgress: 0, approved: 1, finalized: 0 },
    commentThreads: {
        answered: 1, unanswered: 0, total: 1, flaggedOpen: 0,
        documents: [{ documentId: 'd1', messageCount: 3, followUpReasons: [] }],
    },
    pace: { deliveredPct: 25, timePct: 40 },
    deliverables: [{ documentId: 'd1', stage: 'in_review', dueDate: '2026-10-16' }],
    documentsDueSoon: [{ documentId: 'd1', dueDate: '2026-10-16', daysUntil: 21 }],
    revisionMetrics: [{ documentId: 'd1', revisions: 0 }],
} as unknown as EngagementInsightsResponse)

const fpWith = (mutate: (d: Record<string, unknown>) => void) => {
    const d = base() as unknown as Record<string, unknown>
    mutate(d)
    return fingerprintInsights(d as unknown as EngagementInsightsResponse)
}

describe('fingerprintInsights', () => {
    it('is stable for identical input', () => {
        expect(fingerprintInsights(base())).toBe(fingerprintInsights(base()))
    })

    describe('changes when a person changes something', () => {
        it('a deliverable stage moves', () => {
            expect(fpWith((d) => {
                (d.deliverables as Array<Record<string, unknown>>)[0].stage = 'approved'
            })).not.toBe(fingerprintInsights(base()))
        })

        it('a due date is edited', () => {
            expect(fpWith((d) => {
                (d.deliverables as Array<Record<string, unknown>>)[0].dueDate = '2026-11-01'
            })).not.toBe(fingerprintInsights(base()))
        })

        it('a comment is posted', () => {
            expect(fpWith((d) => {
                (d.commentThreads as Record<string, unknown>).documents =
                    [{ documentId: 'd1', messageCount: 4, followUpReasons: [] }]
            })).not.toBe(fingerprintInsights(base()))
        })

        it('a thread is flagged urgent', () => {
            // Without this the Collaboration section would silently go stale after someone
            // flagged a thread, since only message counts were hashed.
            expect(fpWith((d) => {
                (d.commentThreads as Record<string, unknown>).documents =
                    [{ documentId: 'd1', messageCount: 3, followUpReasons: ['urgent'] }]
            })).not.toBe(fingerprintInsights(base()))
        })

        it('work is approved', () => {
            expect(fpWith((d) => {
                (d.deliveryHealth as Record<string, unknown>).approvedCount = 2
            })).not.toBe(fingerprintInsights(base()))
        })
    })

    describe('does NOT change when only the clock moves', () => {
        it('timePct advances as the engagement burns down', () => {
            // pace is decomposed: deliveredPct is hashed, timePct is not, because timePct moves
            // every day on its own.
            expect(fpWith((d) => {
                (d.pace as Record<string, unknown>).timePct = 95
            })).toBe(fingerprintInsights(base()))
        })

        it('daysUntil counts down on an unchanged due date', () => {
            expect(fpWith((d) => {
                (d.documentsDueSoon as Array<Record<string, unknown>>)[0].daysUntil = 1
            })).toBe(fingerprintInsights(base()))
        })

        it('a deliverable becomes overdue without anyone touching it', () => {
            expect(fpWith((d) => {
                (d.deliverables as Array<Record<string, unknown>>)[0].isOverdue = true
            })).toBe(fingerprintInsights(base()))
        })
    })
})
