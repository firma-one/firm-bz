import { describe, it, expect, vi, beforeEach } from 'vitest'

// The assignee route's refusals are read by people (P1-65): each says why in plain words.

const { st } = vi.hoisted(() => ({
    st: { user: { id: 'me' } as { id: string } | null, canManage: true, member: true, doc: true, dbDown: false, saved: [] as any[] },
}))

vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    blockIfEngagementCompleted: async () => null,
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, canViewProjectSettings: async () => st.canManage }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementMember: { findFirst: async () => (st.member ? { userId: 'u1' } : null) },
        engagementDocument: {
            findFirst: async () => (st.doc ? { id: 'd', settings: {} } : null),
            update: async ({ data }: any) => { if (st.dbDown) throw new Error('connection reset'); st.saved.push(data.settings) },
        },
    },
}))

import { PATCH } from './route'

const patch = (body: object) => PATCH({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd' }) })

beforeEach(() => {
    Object.assign(st, { user: { id: 'me' }, canManage: true, member: true, doc: true, dbDown: false, saved: [] })
})

describe('PATCH assignee', () => {
    it('saves the assignee', async () => {
        const res = await patch({ assigneeUserId: 'u1' })
        expect(res.status).toBe(200)
        expect(st.saved).toEqual([{ assigneeUserId: 'u1' }])
    })

    it.each([
        ['a session that ended', () => { st.user = null }, 401, 'Your session has ended. Sign in again.'],
        ['someone who may not', () => { st.canManage = false }, 403, 'Only a Lead can change the assignee.'],
        ['a person who left', () => { st.member = false }, 400, "That person isn't a member of this engagement any more. Refresh to see who is."],
        ['a file that left', () => { st.doc = false }, 404, 'This file is no longer in this engagement. Refresh to see it as it is.'],
        ['a failure on our side', () => { st.dbDown = true }, 500, "Couldn't change the assignee. Something went wrong on our side. Try again."],
    ])('says why for %s', async (_label, set, status, error) => {
        set()
        const res = await patch({ assigneeUserId: 'u1' })
        expect(res.status).toBe(status)
        expect(await res.json()).toEqual({ error })
    })
})
