import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Board reorders its lanes; it no longer moves a deliverable between them, whose stage follows
// its documents (.claude/plans/deliverable-stages-blocked.md, section 2).

const { st, updates } = vi.hoisted(() => ({
    updates: [] as { id: string; settings: any }[],
    st: { shares: {} as Record<string, any> },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: any) => st.shares[where.id] ?? null,
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
