import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Board reorders its lanes; it no longer moves a deliverable between them, whose stage follows
// its documents (.claude/plans/deliverable-stages-blocked.md, section 2).

const { st, updates } = vi.hoisted(() => ({
    updates: [] as { id: string; settings: any }[],
    st: { shares: {} as Record<string, any>, canManage: true, dbDown: false },
}))

vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    blockIfEngagementCompleted: async () => null,
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => st.canManage }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: any) => { if (st.dbDown) throw new Error('connection reset'); return st.shares[where.id] ?? null },
            update: async ({ where, data }: any) => { updates.push({ id: where.id, settings: data.settings }) },
        },
    },
}))

import { PUT } from './route'

const share = (id: string, status: string, orderIndex: number) => ({
    id, settings: { share: { createdAt: 'x' }, activity: { status, orderIndex, updatedAt: 'x' } },
})
const put = (body: object) => PUT({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p' }) })

beforeEach(() => {
    updates.length = 0
    st.canManage = true
    st.dbDown = false
    st.shares = { a: share('a', 'to_do', 0), b: share('b', 'to_do', 1), c: share('c', 'in_progress', 0) }
})

describe('PUT shares/order', () => {
    it('reorders a lane', async () => {
        const res = await put({ to_do: ['b', 'a'], in_progress: ['c'] })
        expect(res.status).toBe(200)
        expect(updates.map((u) => [u.id, u.settings.activity.status, u.settings.activity.orderIndex])).toEqual([
            ['b', 'to_do', 0],
            ['a', 'to_do', 1],
        ])
    })

    it("leaves a deliverable listed in another lane where it is", async () => {
        const res = await put({ to_do: ['a', 'b'], in_review: ['c'] })
        expect(await res.json()).toEqual({ ok: true, skipped: 1 })
        expect(updates).toEqual([])
    })
})

// P2-22: a refused reorder says why, in words, so the Board's "Move failed" toast can carry them.
describe('PUT shares/order refusals', () => {
    it('says who may reorder', async () => {
        st.canManage = false
        const res = await put({ to_do: ['b', 'a'] })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "You can't reorder this Board." })
    })

    it('answers plain words when it fails on our side', async () => {
        st.dbDown = true
        const res = await put({ to_do: ['b', 'a'] })
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'Something went wrong on our side. Try again.' })
    })
})
