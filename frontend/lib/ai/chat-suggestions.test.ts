import { describe, it, expect } from 'vitest'
import { buildChatSuggestions } from './chat-suggestions'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/** Minimal snapshot; each test overlays only the signals it cares about. */
function snapshot(overrides: Record<string, unknown> = {}): EngagementInsightsResponse {
    return {
        deliveryHealth: { overdueCount: 0, stalledInReview: 0, approvedCount: 0, totalCount: 0 },
        commentThreads: { unanswered: 0, flaggedOpen: 0, answered: 0, total: 0 },
        planningHygiene: {
            deliverableTotal: 0, deliverableWithDueDate: 0,
            docTotal: 0, docWithDueDate: 0, docWithAssignee: 0,
        },
        pace: { deliveredPct: 0, timePct: 0, hasDeadline: false },
        sharesProgress: { inProgress: 0 },
        firstTimeRight: { firstTime: 0, reworked: 0, totalApproved: 0 },
        documentsDueSoon: [],
        healthScore: { score: 100 },
        ...overrides,
    } as unknown as EngagementInsightsResponse
}

describe('buildChatSuggestions', () => {
    it('falls back to generic questions when nothing is wrong', () => {
        const out = buildChatSuggestions(snapshot())
        expect(out).toContain('Summarise where this engagement stands')
        // The whole point: a clean engagement must not be asked what is overdue.
        expect(out.join(' ')).not.toMatch(/overdue/i)
    })

    it('offers an overdue question only when something is overdue', () => {
        const clean = buildChatSuggestions(snapshot())
        expect(clean.some((s) => /overdue/i.test(s))).toBe(false)

        const late = buildChatSuggestions(snapshot({
            deliveryHealth: { overdueCount: 3, stalledInReview: 0 },
        }))
        expect(late[0]).toBe('Which 3 deliverables are overdue?')
    })

    it('uses singular phrasing for a single overdue item', () => {
        const out = buildChatSuggestions(snapshot({
            deliveryHealth: { overdueCount: 1, stalledInReview: 0 },
        }))
        expect(out[0]).toBe("What's overdue, and how late is it?")
    })

    it('ranks overdue work above planning hygiene', () => {
        const out = buildChatSuggestions(snapshot({
            deliveryHealth: { overdueCount: 2, stalledInReview: 0 },
            planningHygiene: { deliverableTotal: 5, deliverableWithDueDate: 0, docTotal: 10, docWithDueDate: 0, docWithAssignee: 10 },
        }))
        expect(out.indexOf('Which 2 deliverables are overdue?'))
            .toBeLessThan(out.indexOf('What work is missing a due date?'))
    })

    it('suggests the comment question only when a reply is owed', () => {
        expect(buildChatSuggestions(snapshot()).some((s) => /awaiting our reply/i.test(s))).toBe(false)
        const out = buildChatSuggestions(snapshot({
            commentThreads: { unanswered: 2, flaggedOpen: 0 },
        }))
        expect(out).toContain('Which 2 comments are awaiting our reply?')
    })

    it('only asks about pace when there is a deadline to be behind', () => {
        // Far behind, but no deadline — the question would be unanswerable.
        const noDeadline = buildChatSuggestions(snapshot({
            pace: { deliveredPct: 10, timePct: 80, hasDeadline: false },
        }))
        expect(noDeadline.some((s) => /behind schedule/i.test(s))).toBe(false)

        const withDeadline = buildChatSuggestions(snapshot({
            pace: { deliveredPct: 10, timePct: 80, hasDeadline: true },
        }))
        expect(withDeadline).toContain('Are we behind schedule, and on what?')
    })

    it('drops questions already asked', () => {
        const first = buildChatSuggestions(snapshot())
        const asked = new Set([first[0]])
        expect(buildChatSuggestions(snapshot(), asked)).not.toContain(first[0])
    })

    it('returns at most four, and never duplicates', () => {
        const out = buildChatSuggestions(snapshot({
            deliveryHealth: { overdueCount: 2, stalledInReview: 3 },
            commentThreads: { unanswered: 1, flaggedOpen: 2 },
            planningHygiene: { deliverableTotal: 5, deliverableWithDueDate: 0, docTotal: 10, docWithDueDate: 0, docWithAssignee: 0 },
            pace: { deliveredPct: 10, timePct: 80, hasDeadline: true },
            healthScore: { score: 62 },
        }))
        expect(out).toHaveLength(4)
        expect(new Set(out).size).toBe(4)
    })

    it('still returns something when the snapshot has not loaded', () => {
        expect(buildChatSuggestions(null).length).toBeGreaterThan(0)
        expect(buildChatSuggestions(undefined)).toContain('Summarise where this engagement stands')
    })
})
