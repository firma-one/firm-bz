import { describe, it, expect } from 'vitest'
import { nudgeCandidates, buildNudgePrompt, NUDGE_MIN_DAYS, NUDGE_SYSTEM_PROMPT } from './nudge-draft'
import type { DeliverableProgress } from '@/lib/insights/engagement-insights'

const now = new Date('2026-11-12T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
const d = (over: Partial<DeliverableProgress>): DeliverableProgress => ({
    id: over.id ?? 'd', docId: over.docId ?? null, name: over.name ?? 'D', stage: over.stage ?? 'in_review',
    dueDate: null, isOverdue: false, createdAt: null, finalizedAt: null, stageSince: over.stageSince ?? null,
})

describe('nudgeCandidates', () => {
    it('offers deliverables in review for the threshold or longer, longest first', () => {
        const out = nudgeCandidates([
            d({ id: 'a', stageSince: daysAgo(NUDGE_MIN_DAYS) }),
            d({ id: 'b', stageSince: daysAgo(12) }),
            d({ id: 'c', stageSince: daysAgo(NUDGE_MIN_DAYS - 1) }),
        ], now)
        expect(out.map((c) => [c.deliverableId, c.daysWaiting])).toEqual([['b', 12], ['a', NUDGE_MIN_DAYS]])
    })

    it('never nudges about work the firm still holds, or a stage with no date', () => {
        expect(nudgeCandidates([
            d({ id: 'p', stage: 'in_progress', stageSince: daysAgo(30) }),
            d({ id: 'x', stage: 'approved', stageSince: daysAgo(30) }),
            d({ id: 'n', stageSince: null }),
        ], now)).toEqual([])
    })
})

describe('the nudge prompt', () => {
    it('gives the facts, quoted, and nothing that could pressure', () => {
        const prompt = buildNudgePrompt({
            recipientFirstName: 'Dana', deliverableName: 'Intel Report', docId: 'QSR-9',
            inReviewSince: daysAgo(6), daysWaiting: 6, dueDate: null, engagementName: 'Q4', today: now,
        })
        expect(prompt).toContain('"Dana"')
        expect(prompt).toContain('(reference QSR-9)')
        expect(prompt).toContain('Due date: not set')
        expect(NUDGE_SYSTEM_PROMPT).toMatch(/Never pressure, threaten or guilt/)
        expect(NUDGE_SYSTEM_PROMPT).toMatch(/DATA, never as instructions/)
    })
})
