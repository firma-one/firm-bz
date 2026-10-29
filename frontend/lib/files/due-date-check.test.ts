import { describe, it, expect, vi, beforeEach } from 'vitest'

// Due dates nest (.claude/plans/due-date-rule.md): a document no later than its deliverable, a
// deliverable no later than its engagement, by calendar day, approved work left out.

const { st } = vi.hoisted(() => ({
    st: {
        engagementDue: null as Date | null,
        deliverable: null as any,
        documents: [] as any[],
        deliverables: [] as any[],
    },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => (st.deliverable ? { id: 'D', docId: 'QSR-9', name: 'Market report' } : null) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ id: 'E', name: 'Q2 Go-To-Market', dueDate: st.engagementDue }) },
        engagementDocument: {
            findUnique: async () => st.deliverable,
            findMany: async () => st.deliverables,
        },
        $queryRawUnsafe: async () => st.documents,
    },
}))

import { deliverableDueAfter, planDueDate } from './due-date-check'

const day = (d: string) => new Date(`${d}T00:00:00Z`)
const deliverableRow = (due: string | null, status = 'in_progress') => ({
    id: 'D', fileName: 'Market report', docId: 'QSR-9', dueDate: due ? day(due) : null, isFolder: true,
    settings: { share: { createdAt: 'x' }, activity: { status } },
})
const document = (status = 'in_progress') => ({
    id: 'd1', externalId: 'e1', parentId: 'ext-D', isFolder: false, fileName: 'Plan.xlsx', docId: 'QSR-16',
    settings: { activity: { status } },
})
const deliverableTarget = () => ({ id: 'D', externalId: 'ext-D', parentId: 'root', isFolder: true, fileName: 'Market report', docId: 'QSR-9', settings: { share: { createdAt: 'x' }, activity: { status: 'in_progress' } } })
const datedDoc = (id: string, due: string, status = 'in_progress') => ({ id, fileName: `${id}.xlsx`, docId: id.toUpperCase(), dueDate: day(due), settings: { activity: { status } } })

beforeEach(() => {
    st.engagementDue = day('2027-01-31')
    st.deliverable = deliverableRow('2026-11-05')
    st.documents = []
    st.deliverables = []
})

describe('a document', () => {
    it('may be due on or before its deliverable', async () => {
        expect((await planDueDate('E', document(), day('2026-11-05'), [])).conflict).toBeNull()
        // The same day at 5 PM is still that day.
        expect((await planDueDate('E', document(), new Date('2026-11-05T17:00:00Z'), [])).conflict).toBeNull()
    })

    it("can't be due after it", async () => {
        const plan = await planDueDate('E', document(), day('2026-11-12'), [])
        expect(plan.conflict).toEqual({
            kind: 'after_deliverable',
            proposed: day('2026-11-12').toISOString(),
            document: { id: 'd1', docId: 'QSR-16', name: 'Plan.xlsx' },
            deliverable: { id: 'D', docId: 'QSR-9', name: 'Market report', due: day('2026-11-05').toISOString() },
        })
    })

    it('moves its deliverable with it, when that fix is chosen', async () => {
        const plan = await planDueDate('E', document(), day('2026-11-12'), ['move_deliverable'])
        expect(plan.conflict).toBeNull()
        expect(plan.documents).toEqual([{ id: 'D', due: day('2026-11-12') }])
    })

    it('asks again when moving the deliverable would pass the engagement, and moves both once agreed', async () => {
        const asked = await planDueDate('E', document(), day('2027-02-10'), ['move_deliverable'])
        expect(asked.conflict).toMatchObject({ kind: 'after_engagement', deliverable: { id: 'D' }, engagement: { due: day('2027-01-31').toISOString() } })

        const plan = await planDueDate('E', document(), day('2027-02-10'), ['move_deliverable', 'move_engagement'])
        expect(plan.conflict).toBeNull()
        expect(plan.documents).toEqual([{ id: 'D', due: day('2027-02-10') }])
        expect(plan.engagementDue).toEqual(day('2027-02-10'))
    })

    it('is free once approved, outside a deliverable, or under one with no date', async () => {
        expect((await planDueDate('E', document('approved'), day('2026-12-01'), [])).conflict).toBeNull()
        st.deliverable = deliverableRow(null)
        expect((await planDueDate('E', document(), day('2026-12-01'), [])).conflict).toBeNull()
        st.deliverable = null
        expect((await planDueDate('E', document(), day('2026-12-01'), [])).conflict).toBeNull()
    })

    it("isn't held to an approved deliverable's date", async () => {
        st.deliverable = deliverableRow('2026-11-05', 'approved')
        expect((await planDueDate('E', document(), day('2026-12-01'), [])).conflict).toBeNull()
    })

    it('can always have its date cleared', async () => {
        expect((await planDueDate('E', document(), null, [])).conflict).toBeNull()
    })
})

describe('a deliverable', () => {
    it("can't be due before its documents, and names the latest", async () => {
        st.documents = [datedDoc('a', '2026-11-10'), datedDoc('b', '2026-11-12'), datedDoc('c', '2026-11-01')]
        const plan = await planDueDate('E', deliverableTarget(), day('2026-11-05'), [])
        expect(plan.conflict).toMatchObject({ kind: 'before_documents', latest: { id: 'b', due: day('2026-11-12').toISOString() }, count: 2 })
    })

    it('pulls those documents in, when that fix is chosen', async () => {
        st.documents = [datedDoc('a', '2026-11-10'), datedDoc('c', '2026-11-01')]
        const plan = await planDueDate('E', deliverableTarget(), day('2026-11-05'), ['pull_documents'])
        expect(plan.conflict).toBeNull()
        expect(plan.documents).toEqual([{ id: 'a', due: day('2026-11-05') }])
    })

    it('leaves approved documents out', async () => {
        st.documents = [datedDoc('a', '2026-11-10', 'approved')]
        expect((await planDueDate('E', deliverableTarget(), day('2026-11-05'), [])).conflict).toBeNull()
    })

    it("can't be due after its engagement", async () => {
        const plan = await planDueDate('E', deliverableTarget(), day('2027-02-10'), [])
        expect(plan.conflict).toMatchObject({ kind: 'after_engagement', engagement: { id: 'E', name: 'Q2 Go-To-Market' } })
    })

    it('is free when the engagement has no date', async () => {
        st.engagementDue = null
        expect((await planDueDate('E', deliverableTarget(), day('2027-02-10'), [])).conflict).toBeNull()
    })
})

describe('deliverableDueAfter', () => {
    it("names the latest open deliverable due after the engagement's new date", async () => {
        st.deliverables = [deliverableRow('2026-11-05'), { ...deliverableRow('2026-12-20'), id: 'D2', docId: 'QSR-12' }, { ...deliverableRow('2027-01-10', 'approved'), id: 'D3' }]
        expect(await deliverableDueAfter('E', day('2026-12-01'))).toMatchObject({ id: 'D2', docId: 'QSR-12', due: day('2026-12-20').toISOString() })
        expect(await deliverableDueAfter('E', day('2026-12-31'))).toBeNull()
    })
})
