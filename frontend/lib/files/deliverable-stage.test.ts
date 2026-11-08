import { beforeEach, describe, expect, it, vi } from 'vitest'

// What's internal only isn't part of what's delivered, so it doesn't count toward the deliverable's stage:
// it can neither hold a deliverable back nor move one along.

const { st } = vi.hoisted(() => ({ st: { rows: [] as any[] } }))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRawUnsafe: async () => st.rows.filter((r) => !r.isFolder).map((r) => ({ id: r.id })),
        engagementDocument: { findMany: async ({ where }: any) => (where.id ? st.rows.filter((r) => where.id.in.includes(r.id)) : st.rows) },
        engagementMember: { count: async () => 0 },
    },
}))
vi.mock('./apply-stage-change', () => ({
    applyStageChange: vi.fn(),
    accessWidenedBy: () => ({ externalCollaborators: false, viewers: false }),
    currentStageOf: (row: any) => row.settings?.activity?.status ?? 'to_do',
}))

import { derivedMove } from './deliverable-stage'

const PRIVATE = { lock: { type: 'private' } }
const doc = (id: string, status: string, settings: object = {}, parentId = 'ext-D') =>
    ({ id, externalId: `ext-${id}`, parentId, isFolder: false, fileName: id, createdBy: null, settings: { activity: { status }, ...settings } })
const folder = (id: string, settings: object = {}, parentId: string | null = 'ext-D') =>
    ({ id, externalId: `ext-${id}`, parentId, isFolder: true, fileName: id, createdBy: null, settings })
const deliverable = (status: string) => folder('D', { activity: { status } }, null)

beforeEach(() => { st.rows = [] })

describe('derivedMove, with internal only documents', () => {
    it("doesn't let one hold the deliverable back", async () => {
        const D = deliverable('in_progress')
        st.rows = [D, doc('a', 'approved'), doc('b', 'in_progress', PRIVATE)]
        expect(await derivedMove('e', D, new Map())).toMatchObject({ from: 'in_progress', to: 'approved', approves: true })
    })

    it("doesn't count what an internal only folder holds", async () => {
        const D = deliverable('in_progress')
        st.rows = [D, folder('fo', PRIVATE), doc('a', 'in_review'), doc('b', 'in_progress', {}, 'ext-fo')]
        expect(await derivedMove('e', D, new Map())).toMatchObject({ to: 'in_review' })
    })

    it("doesn't move the deliverable when one moves", async () => {
        const D = deliverable('to_do')
        st.rows = [D, doc('a', 'to_do'), doc('b', 'to_do', PRIVATE)]
        expect(await derivedMove('e', D, new Map([['b', 'in_review']]))).toBeNull()
    })

    it('leaves it at To do when nothing else is on the Board', async () => {
        const D = deliverable('in_progress')
        st.rows = [D, doc('a', 'in_progress', PRIVATE)]
        expect(await derivedMove('e', D, new Map())).toMatchObject({ to: 'to_do' })
    })

    it('goes by the marks it is given, when one is about to change', async () => {
        const D = deliverable('in_progress')
        st.rows = [D, doc('a', 'approved'), doc('b', 'in_progress')]
        expect(await derivedMove('e', D, new Map(), new Set(['ext-b']))).toMatchObject({ to: 'approved' })

        const approved = deliverable('approved')
        st.rows = [approved, doc('a', 'approved'), doc('b', 'in_progress', PRIVATE)]
        expect(await derivedMove('e', approved, new Map(), new Set())).toMatchObject({ to: 'in_progress' })
    })
})
