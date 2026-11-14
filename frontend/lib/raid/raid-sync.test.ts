import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The sync on read: the engagement's own signals become entries, follow their signal, and close
 * themselves, while what people wrote (owner, mitigation) is never touched. The database and the
 * insights are mocked.
 */

const h = vi.hoisted(() => ({
    status: 'ACTIVE' as string,
    insights: vi.fn(),
    existing: [] as Array<Record<string, unknown>>,
    createMany: vi.fn(async () => ({ count: 0 })),
    update: vi.fn(async () => ({})),
    boardRows: [] as unknown[],
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: async () => (h.status === 'GONE' ? null : { status: h.status }) },
        $queryRawUnsafe: async () => h.boardRows,
        engagementDocument: { findMany: async () => [] },
        docCommentThread: { findMany: async () => [] },
        engagementRaidItem: { findMany: async () => h.existing, createMany: h.createMany, update: h.update },
    },
}))
vi.mock('@/lib/insights/engagement-insights', () => ({ computeEngagementInsights: h.insights }))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: async () => new Map() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { healthPointsOf, resetRaidSyncThrottle, syncRaidSignals } from './raid-sync'

const NOW = new Date('2026-11-12T12:00:00Z')

function insights(p: { planningGaps?: number; overdue?: boolean } = {}) {
    return {
        deliverables: p.overdue
            ? [{ id: 'd9', docId: 'QSR-9', name: 'Report', stage: 'in_progress', dueDate: '2026-11-07T00:00:00Z', isOverdue: true, finalizedAt: null, stageSince: null, createdAt: null }]
            : [],
        unansweredThreads: [],
        commentThreads: { documents: [] },
        pace: { deliveredPct: 0, timePct: 0, hasDeadline: false },
        // planningGapCount: deliverable due dates + document due dates + document assignees missing.
        planningHygiene: { deliverableTotal: p.planningGaps ?? 0, deliverableWithDueDate: 0, docTotal: 0, docWithDueDate: 0, docWithAssignee: 0 },
    }
}

beforeEach(() => {
    resetRaidSyncThrottle()
    h.status = 'ACTIVE'
    h.existing = []
    h.boardRows = []
    h.insights.mockReset().mockResolvedValue(insights())
    h.createMany.mockClear()
    h.update.mockClear()
})

describe('syncRaidSignals', () => {
    it('opens an entry per new signal, keyed by it, with no owner and no notes', async () => {
        h.insights.mockResolvedValue(insights({ overdue: true }))
        await syncRaidSignals('p1', 'f1', { now: NOW })
        const data = (h.createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[]; skipDuplicates: boolean }])[0]
        expect(data.skipDuplicates).toBe(true)
        expect(data.data).toEqual([expect.objectContaining({
            engagementId: 'p1', firmId: 'f1', type: 'ISSUE', status: 'OPEN', sourceKind: 'STATUS',
            sourceRef: 'overdue:d9', signalKey: 'overdue:d9', title: 'QSR-9 · Report overdue by 5 days',
        })])
        expect(data.data[0]).not.toHaveProperty('ownerUserId')
        expect(data.data[0]).not.toHaveProperty('notes')
    })

    it("keeps people's edits: a retitle and a close write the title and status, never the owner or the notes", async () => {
        h.insights.mockResolvedValue(insights({ planningGaps: 3 }))
        h.existing = [
            { id: 'e-plan', signalKey: 'planning', status: 'OPEN', title: '15 planning gaps · missing due dates or assignees', closedBy: null, priority: 'LOW', prioritySetBy: null },
            { id: 'e-pace', signalKey: 'pace', status: 'OPEN', title: 'Behind pace', closedBy: null, priority: 'HIGH', prioritySetBy: null },
        ]
        await syncRaidSignals('p1', 'f1', { now: NOW })

        const calls = h.update.mock.calls as unknown as Array<[{ where: { id: string }; data: Record<string, unknown> }]>
        expect(calls.map(([c]) => c.where.id).sort()).toEqual(['e-pace', 'e-plan'])
        for (const [c] of calls) {
            expect(c.data).not.toHaveProperty('ownerUserId')
            expect(c.data).not.toHaveProperty('notes')
        }
        expect(calls.find(([c]) => c.where.id === 'e-plan')![0].data).toEqual({ title: '3 planning gaps · missing due dates or assignees' })
        expect(calls.find(([c]) => c.where.id === 'e-pace')![0].data).toEqual({
            status: 'CLOSED', closedAt: NOW, closedReason: 'Resolved · back on pace', closedBy: null,
        })
    })

    it("grades an entry saved before priorities, and never changes one a person chose", async () => {
        h.insights.mockResolvedValue(insights({ planningGaps: 3, overdue: true }))
        h.existing = [
            { id: 'e-plan', signalKey: 'planning', status: 'OPEN', title: '3 planning gaps · missing due dates or assignees', closedBy: null, priority: null, prioritySetBy: null },
        ]
        await syncRaidSignals('p1', 'f1', { now: NOW })
        const calls = h.update.mock.calls as unknown as Array<[{ where: { id: string }; data: Record<string, unknown> }]>
        // No Health deduction in this data: planning gaps default to Low.
        expect(calls.find(([c]) => c.where.id === 'e-plan')![0].data).toEqual({ priority: 'LOW' })

        h.update.mockClear()
        resetRaidSyncThrottle()
        h.existing = [
            { id: 'e-plan', signalKey: 'planning', status: 'OPEN', title: '3 planning gaps · missing due dates or assignees', closedBy: null, priority: 'HIGH', prioritySetBy: 'u-lead' },
        ]
        await syncRaidSignals('p1', 'f1', { now: NOW })
        expect(h.update).not.toHaveBeenCalled()
    })

    it('leaves a completed engagement as it was', async () => {
        h.status = 'COMPLETED'
        await syncRaidSignals('p1', 'f1', { now: NOW })
        expect(h.insights).not.toHaveBeenCalled()
        expect(h.createMany).not.toHaveBeenCalled()
    })

    it('runs at most once a minute per engagement unless forced', async () => {
        await syncRaidSignals('p1', 'f1', { now: NOW })
        await syncRaidSignals('p1', 'f1', { now: new Date(NOW.getTime() + 30_000) })
        expect(h.insights).toHaveBeenCalledTimes(1)
        await syncRaidSignals('p1', 'f1', { now: new Date(NOW.getTime() + 30_000), force: true })
        expect(h.insights).toHaveBeenCalledTimes(2)
    })

    it('never throws: a failed sync is logged and tried again on the next read', async () => {
        h.insights.mockRejectedValueOnce(new Error('db down'))
        await expect(syncRaidSignals('p1', 'f1', { now: NOW })).resolves.toBeUndefined()
        await syncRaidSignals('p1', 'f1', { now: NOW })
        expect(h.insights).toHaveBeenCalledTimes(2)
    })
})

describe('healthPointsOf', () => {
    it("reads the Health score's deductions for Behind pace and Planning gaps by their labels", () => {
        expect(healthPointsOf([
            { label: 'Behind pace (0% delivered vs 37% elapsed)', points: 16 },
            { label: 'Planning gaps (15 missing)', points: 9 },
            { label: '1 overdue deliverable', points: 15 },
        ])).toEqual({ pace: 16, planning: 9 })
        expect(healthPointsOf([])).toEqual({ pace: undefined, planning: undefined })
    })
})
