import { describe, it, expect, vi, beforeEach } from 'vitest'

// The due-date route under the nesting rule (.claude/plans/due-date-rule.md): a conflict answers
// 409 with what to resolve; a chosen fix moves the other dates through the same path.

const { st, calls } = vi.hoisted(() => ({
    st: { plan: { conflict: null as any, documents: [] as any[], engagementDue: null as Date | null } },
    calls: { updates: [] as any[], engagement: [] as any[], fixes: [] as any[], reminders: [] as string[] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, canViewProjectSettings: async () => true }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates/reminder', () => ({ renderReminderEmail: () => ({}) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: async (name: string) => { calls.reminders.push(name) } }))
vi.mock('@/lib/notification-links', () => ({ documentLink: () => '/x' }))
vi.mock('@/lib/files/due-date-check', () => ({
    planDueDate: async (_e: string, _t: unknown, _d: unknown, fixes: unknown) => { calls.fixes.push(fixes); return st.plan },
}))
vi.mock('@/lib/actions/project', () => ({
    updateEngagement: async (...args: unknown[]) => { calls.engagement.push(args) },
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: any) => ({
                id: where.id, externalId: `ext-${where.id}`, parentId: null, docId: where.id.toUpperCase(), fileName: `${where.id}.xlsx`,
                dueDate: null, isFolder: where.id === 'D', settings: where.id === 'D' ? { share: { createdAt: 'x' } } : {}, firmId: 'f', clientId: 'c', engagementId: 'p',
            }),
            update: async ({ where, data }: any) => { calls.updates.push({ id: where.id, dueDate: data.dueDate }) },
        },
        engagementMember: { findMany: async () => [] },
        engagement: { findUnique: async () => ({ slug: 'e', client: { slug: 'cl', firm: { slug: 'fi', group: { slug: 'g' } } } }) },
        notification: { updateMany: async () => ({}), createMany: async () => ({}) },
    },
}))

import { PATCH } from './route'

const patch = (documentId: string, body: object) =>
    PATCH({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId }) })

beforeEach(() => {
    st.plan = { conflict: null, documents: [], engagementDue: null }
    for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
})

describe('PATCH due-date', () => {
    it('answers a conflict with what to resolve, and saves nothing', async () => {
        st.plan.conflict = { kind: 'after_deliverable', proposed: 'x' }
        const res = await patch('d1', { dueDate: '2026-11-12' })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ needsResolution: { kind: 'after_deliverable', proposed: 'x' } })
        expect(calls.updates).toEqual([])
    })

    it('passes the chosen fixes on, ignoring unknown ones', async () => {
        await patch('d1', { dueDate: '2026-11-12', fixes: ['move_deliverable', 'drop_table'] })
        expect(calls.fixes).toEqual([['move_deliverable']])
    })

    it("moves the fix's other dates through the same path, reminders and all", async () => {
        st.plan.documents = [{ id: 'D', due: new Date('2026-11-12T00:00:00Z') }]
        const res = await patch('d1', { dueDate: '2026-11-12', fixes: ['move_deliverable'] })
        expect(res.status).toBe(200)
        expect(calls.updates).toEqual([
            { id: 'd1', dueDate: new Date('2026-11-12') },
            { id: 'D', dueDate: new Date('2026-11-12T00:00:00Z') },
        ])
        expect(calls.reminders).toContain('deliverable.due_date.set')
        expect(await res.json()).toMatchObject({ alsoChanged: [{ id: 'D', dueDate: '2026-11-12T00:00:00.000Z' }] })
    })

    it('moves the engagement first, when that fix is chosen', async () => {
        st.plan.engagementDue = new Date('2027-02-10T00:00:00Z')
        const res = await patch('D', { dueDate: '2027-02-10', fixes: ['move_engagement'] })
        expect(calls.engagement).toEqual([['p', { dueDate: '2027-02-10T00:00:00.000Z' }, 'fi', 'cl']])
        expect(await res.json()).toMatchObject({ engagementDueDate: '2027-02-10T00:00:00.000Z' })
    })
})
