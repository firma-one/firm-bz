import { describe, it, expect } from 'vitest'
import { closeReasonFor, planRaidSync, raidSignals, type ExistingAutoItem, type RaidSignalInputs } from './raid-signals'

/**
 * The free half of the RAID log: which of the engagement's own signals become entries, in what words,
 * and how they close themselves. Pure: nothing here reads a database.
 */

const NOW = new Date('2026-11-12T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

type Deliverable = RaidSignalInputs['deliverables'][number]
const deliverable = (p: Partial<Deliverable> & Pick<Deliverable, 'id' | 'name'>): Deliverable => ({
    docId: null, stage: 'in_progress', dueDate: null, isOverdue: false, finalizedAt: null, stageSince: null, ...p,
})

const inputs = (p: Partial<RaidSignalInputs> = {}): RaidSignalInputs => ({
    now: NOW,
    deliverables: [],
    unansweredThreads: [],
    threadRefs: new Map(),
    pace: { deliveredPct: 0, timePct: 0, hasDeadline: false },
    planningGaps: 0,
    blocked: [],
    approvers: new Map(),
    ...p,
})

describe('raidSignals', () => {
    it('makes an Issue of an overdue deliverable, counting the days, raised the day after it was due', () => {
        const [s] = raidSignals(inputs({
            deliverables: [deliverable({ id: 'd9', docId: 'QSR-9', name: 'Market Report', dueDate: daysAgo(5), isOverdue: true, stage: 'in_review', stageSince: daysAgo(14) })],
        }))
        expect(s).toMatchObject({ key: 'overdue:d9', sourceKind: 'STATUS', type: 'ISSUE', status: 'OPEN', title: 'QSR-9 · Market Report overdue by 5 days' })
        expect(s.raisedAt.toISOString().slice(0, 10)).toBe(daysAgo(4).slice(0, 10))
    })

    it('makes an Issue of a deliverable waiting on the Reviewer, unless it is overdue already', () => {
        const signals = raidSignals(inputs({
            deliverables: [
                deliverable({ id: 'r1', docId: 'QSR-4', name: 'Guide', stage: 'in_review', stageSince: daysAgo(8) }),
                deliverable({ id: 'r2', docId: 'QSR-5', name: 'Deck', stage: 'in_review', stageSince: daysAgo(2) }),
                deliverable({ id: 'r3', docId: 'QSR-9', name: 'Report', stage: 'in_review', stageSince: daysAgo(14), dueDate: daysAgo(3), isOverdue: true }),
            ],
        }))
        expect(signals.map((s) => s.key)).toEqual(['overdue:r3', 'review:r1'])
        expect(signals[1].title).toBe('QSR-4 · Guide in review for 8 days')
    })

    it('makes an Issue of a blocked document, with what it waits on and the note', () => {
        const [s] = raidSignals(inputs({
            blocked: [{ documentId: 'doc1', ref: 'QSR-2', fileName: 'Sales export', reason: 'client', note: 'Waiting on their Q3 export', at: daysAgo(3) }],
        }))
        expect(s).toMatchObject({ key: 'blocked:doc1', type: 'ISSUE', title: 'QSR-2 · Sales export blocked · Waiting on client · Waiting on their Q3 export' })
    })

    it('makes an Issue of a client thread waiting 3 days or more; a fresher one only keeps an open entry open', () => {
        const signals = raidSignals(inputs({
            unansweredThreads: [
                { documentId: 't1', documentName: 'Interview Guide', lastMessageAt: daysAgo(5) },
                { documentId: 't2', documentName: 'Deck', lastMessageAt: daysAgo(1) },
            ],
            threadRefs: new Map([['t1', 'QSR-14']]),
        }))
        expect(signals[0]).toMatchObject({ key: 'waiting:t1', title: 'Reply on QSR-14 · Interview Guide has waited 5 days' })
        expect(signals[0].keepOnly).toBeUndefined()
        expect(signals[1]).toMatchObject({ key: 'waiting:t2', keepOnly: true })
    })

    it('makes Risks of behind pace (the health score rule) and planning gaps (the Action Center count)', () => {
        const signals = raidSignals(inputs({
            deliverables: [deliverable({ id: 'd1', name: 'A' })],
            pace: { deliveredPct: 0, timePct: 36, hasDeadline: true },
            planningGaps: 15,
        }))
        expect(signals.map((s) => [s.key, s.sourceKind, s.type, s.title])).toEqual([
            ['pace', 'HEALTH', 'RISK', 'Behind pace · 0% delivered against 36% of time used'],
            ['planning', 'HEALTH', 'RISK', '15 planning gaps · missing due dates or assignees'],
        ])
    })

    it('is not behind pace within 15 points', () => {
        expect(raidSignals(inputs({ deliverables: [deliverable({ id: 'd1', name: 'A' })], pace: { deliveredPct: 20, timePct: 35, hasDeadline: true } }))).toEqual([])
    })

    it('records an approval as a Decision, naming who approved it', () => {
        const [s] = raidSignals(inputs({
            deliverables: [deliverable({ id: 'd3', docId: 'QSR-3', name: 'Market Sizing', stage: 'approved', finalizedAt: daysAgo(10) })],
            approvers: new Map([['d3', 'Dana']]),
        }))
        expect(s).toMatchObject({ key: 'approved:d3', sourceKind: 'BOARD', type: 'DECISION', status: 'RECORDED', title: 'QSR-3 · Market Sizing approved by Dana' })
        expect(s.raisedAt.toISOString()).toBe(daysAgo(10))
    })
})

describe('closeReasonFor', () => {
    const ctx = {
        now: NOW,
        deliverables: [
            deliverable({ id: 'approved', name: 'A', stage: 'approved', finalizedAt: '2026-11-14T09:00:00Z' }),
            deliverable({ id: 'moved', name: 'B', stage: 'in_progress' }),
        ],
        resolvedThreads: new Set(['resolved-thread']),
    }

    it.each([
        ['overdue:approved', 'Resolved · approved Nov 14'],
        ['overdue:moved', 'Resolved · due date moved'],
        ['overdue:gone', 'Resolved · no longer on the Board'],
        ['review:approved', 'Resolved · approved Nov 14'],
        ['review:moved', 'Resolved · out of review'],
        ['blocked:doc1', 'Resolved · unblocked Nov 12'],
        ['waiting:answered-thread', 'Resolved · answered'],
        ['waiting:resolved-thread', 'Resolved · thread resolved'],
        ['pace', 'Resolved · back on pace'],
        ['planning', 'Resolved · planned'],
        ['approved:d3', 'Approval reopened · Nov 12'],
    ])('%s closes as "%s"', (key, reason) => {
        expect(closeReasonFor(key, ctx)).toBe(reason)
    })
})

describe('priorities', () => {
    it("gives each Risk and Issue a priority: Health's grade where Health scores it, and the approved defaults", () => {
        const signals = raidSignals(inputs({
            deliverables: [deliverable({ id: 'd9', docId: 'QSR-9', name: 'Market Report', dueDate: daysAgo(5), isOverdue: true, stage: 'in_review', stageSince: daysAgo(14) })],
            unansweredThreads: [{ documentId: 't1', documentName: 'Guide', lastMessageAt: daysAgo(5) }],
            pace: { deliveredPct: 0, timePct: 37, hasDeadline: true },
            planningGaps: 15,
            healthPoints: { pace: 16, planning: 9 },
        }))
        const priorityOf = (key: string) => signals.find((x) => x.key === key)?.priority
        expect(priorityOf('overdue:d9')).toBe('HIGH')
        expect(priorityOf('waiting:t1')).toBe('MEDIUM')
        // 16 and 9 points: High and Medium, as the Health score's own list grades them.
        expect(priorityOf('pace')).toBe('HIGH')
        expect(priorityOf('planning')).toBe('MEDIUM')
    })

    it('without the Health deductions, Behind pace is Medium and planning gaps Low', () => {
        const signals = raidSignals(inputs({ deliverables: [deliverable({ id: 'd1', name: 'Deck' })], pace: { deliveredPct: 0, timePct: 40, hasDeadline: true }, planningGaps: 2 }))
        expect(signals.find((x) => x.key === 'pace')?.priority).toBe('MEDIUM')
        expect(signals.find((x) => x.key === 'planning')?.priority).toBe('LOW')
    })

    it('follows a changed grade, unless a person chose the priority', () => {
        const ctx = { now: NOW, deliverables: [], resolvedThreads: new Set<string>() }
        const signals = raidSignals(inputs({ planningGaps: 15, healthPoints: { planning: 9 } }))
        const base = { id: 'e1', signalKey: 'planning', status: 'OPEN' as const, title: '15 planning gaps · missing due dates or assignees', closedBy: null }
        expect(planRaidSync([{ ...base, priority: 'LOW', prioritySetBy: null }], signals, ctx).reprioritize).toEqual([{ id: 'e1', priority: 'MEDIUM' }])
        expect(planRaidSync([{ ...base, priority: 'LOW', prioritySetBy: 'u-lead' }], signals, ctx).reprioritize).toEqual([])
        // Reopened by the sync: the grade again, unless a person had chosen one.
        const closed = { ...base, status: 'CLOSED' as const, priority: 'HIGH' as const }
        expect(planRaidSync([{ ...closed, prioritySetBy: null }], signals, ctx).reopen[0].keepPriority).toBe(false)
        expect(planRaidSync([{ ...closed, prioritySetBy: 'u-lead' }], signals, ctx).reopen[0].keepPriority).toBe(true)
    })
})

describe('planRaidSync', () => {
    const ctx = { now: NOW, deliverables: [], resolvedThreads: new Set<string>() }
    const existing = (p: Partial<ExistingAutoItem> & Pick<ExistingAutoItem, 'id' | 'signalKey'>): ExistingAutoItem =>
        ({ status: 'OPEN', title: 'Old words', closedBy: null, priority: null, prioritySetBy: null, ...p })

    it('opens an entry for a new signal, and none for one that only keeps an entry open', () => {
        const signals = raidSignals(inputs({
            unansweredThreads: [
                { documentId: 't1', documentName: 'Guide', lastMessageAt: daysAgo(5) },
                { documentId: 't2', documentName: 'Deck', lastMessageAt: daysAgo(1) },
            ],
        }))
        expect(planRaidSync([], signals, ctx).create.map((s) => s.key)).toEqual(['waiting:t1'])
    })

    it('keeps a thread entry open while it still awaits the firm, even if a newer client message restarted the wait', () => {
        const signals = raidSignals(inputs({ unansweredThreads: [{ documentId: 't1', documentName: 'Guide', lastMessageAt: daysAgo(1) }] }))
        const plan = planRaidSync([existing({ id: 'e1', signalKey: 'waiting:t1', title: 'Reply on Guide has waited 1 day' })], signals, ctx)
        expect(plan.close).toEqual([])
        expect(plan.create).toEqual([])
    })

    it('follows the signal\'s words, and changes nothing else about the entry', () => {
        const signals = raidSignals(inputs({ planningGaps: 3 }))
        const plan = planRaidSync([existing({ id: 'e1', signalKey: 'planning', title: '15 planning gaps · missing due dates or assignees' })], signals, ctx)
        expect(plan.retitle).toEqual([{ id: 'e1', title: '3 planning gaps · missing due dates or assignees' }])
        // A retitle carries the title alone: never an owner or notes.
        expect(Object.keys(plan.retitle[0]).sort()).toEqual(['id', 'title'])
    })

    it('closes a live entry whose signal is gone, with the reason', () => {
        const plan = planRaidSync([
            existing({ id: 'e1', signalKey: 'pace' }),
            existing({ id: 'e2', signalKey: 'approved:d3', status: 'RECORDED' }),
            existing({ id: 'e3', signalKey: 'planning', status: 'CLOSED', closedBy: null }),
        ], [], ctx)
        expect(plan.close).toEqual([
            { id: 'e1', reason: 'Resolved · back on pace' },
            { id: 'e2', reason: 'Approval reopened · Nov 12' },
        ])
    })

    it('reopens an entry the sync closed when its signal returns, but never one a person closed', () => {
        const signals = raidSignals(inputs({ planningGaps: 2, deliverables: [deliverable({ id: 'd1', name: 'A' })], pace: { deliveredPct: 0, timePct: 80, hasDeadline: true } }))
        const plan = planRaidSync([
            existing({ id: 'by-sync', signalKey: 'planning', status: 'CLOSED', closedBy: null }),
            existing({ id: 'by-person', signalKey: 'pace', status: 'CLOSED', closedBy: 'u-alex' }),
        ], signals, ctx)
        expect(plan.reopen.map((r) => r.id)).toEqual(['by-sync'])
        expect(plan.create).toEqual([])
        expect(plan.close).toEqual([])
    })
})
