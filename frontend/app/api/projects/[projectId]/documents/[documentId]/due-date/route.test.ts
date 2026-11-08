import { describe, it, expect, vi, beforeEach } from 'vitest'

// The due-date route under the nesting rule (.claude/plans/due-date-rule.md): a conflict answers
// 409 with what to resolve; a chosen fix moves the other dates through the same path.

const { st, calls } = vi.hoisted(() => ({
    st: {
        plan: { conflict: null as any, documents: [] as any[], engagementDue: null as Date | null },
        privateIds: new Set<string>(),
        txFails: false,
        putBackFails: false,
        inngestUp: true,
        notifyFails: false,
    },
    calls: { updates: [] as any[], engagement: [] as any[], fixes: [] as any[], reminders: [] as string[], notified: [] as string[], putBack: [] as any[] },
}))

vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    blockIfEngagementCompleted: async () => null,
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, canViewProjectSettings: async () => true }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates/reminder', () => ({ renderReminderEmail: () => ({}) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: async (name: string) => { calls.reminders.push(name); return st.inngestUp } }))
vi.mock('@/lib/notification-links', () => ({ documentLink: () => '/x' }))
vi.mock('@/lib/files/due-date-check', () => ({
    planDueDate: async (_e: string, _t: unknown, _d: unknown, fixes: unknown) => { calls.fixes.push(fixes); return st.plan },
}))
vi.mock('@/lib/engagement-sharing-ids', () => ({ privateExternalIds: async () => st.privateIds, getSharedAndAncestorIdsForPersona: vi.fn() }))
vi.mock('@/lib/actions/project', () => ({
    updateEngagement: async (...args: unknown[]) => { calls.engagement.push(args); return { ok: true, data: undefined } },
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
        engagementMember: { findMany: async () => [{ userId: 'me', role: 'eng_admin' }, { userId: 'staff', role: 'eng_member' }, { userId: 'client', role: 'eng_viewer' }] },
        engagement: {
            findUnique: async () => ({ slug: 'e', dueDate: new Date('2027-01-31T00:00:00Z'), client: { slug: 'cl', firm: { slug: 'fi', group: { slug: 'g' } } } }),
            update: async ({ data }: any) => { if (st.putBackFails) throw new Error('db down'); calls.putBack.push(data) },
        },
        notification: {
            updateMany: async () => ({}),
            createMany: async ({ data }: any) => { if (st.notifyFails) throw new Error('db blip'); calls.notified.push(...data.map((n: any) => n.userId)); return {} },
        },
        $transaction: async (ops: Promise<unknown>[]) => {
            await Promise.all(ops)
            if (st.txFails) throw new Error('connection reset')
        },
    },
}))

import { PATCH } from './route'

const patch = (documentId: string, body: object) =>
    PATCH({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId }) })

beforeEach(() => {
    st.plan = { conflict: null, documents: [], engagementDue: null }
    st.privateIds = new Set()
    st.txFails = false
    st.putBackFails = false
    st.inngestUp = true
    st.notifyFails = false
    for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
})

describe('the notice of a new due date', () => {
    it('goes to every other member', async () => {
        await patch('d1', { dueDate: '2026-11-12' })
        expect(calls.notified).toEqual(['staff', 'client'])
    })

    it('stays with the firm for a private file', async () => {
        st.privateIds = new Set(['ext-d1'])
        await patch('d1', { dueDate: '2026-11-12' })
        expect(calls.notified).toEqual(['staff'])
    })
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

describe('a due date that fails part way (P1-62)', () => {
    it("puts the engagement's date back when the documents' dates couldn't be saved, and says nothing changed", async () => {
        st.plan.engagementDue = new Date('2027-02-10T00:00:00Z')
        st.txFails = true
        const res = await patch('D', { dueDate: '2027-02-10', fixes: ['move_engagement'] })
        expect(res.status).toBe(500)
        expect(calls.putBack).toEqual([{ dueDate: new Date('2027-01-31T00:00:00Z') }])
        expect(await res.json()).toEqual({ error: "Couldn't set the due date. Something went wrong on our side, and nothing changed. Try again." })
        expect(calls.notified).toEqual([])
    })

    it("says the engagement's date moved when it couldn't be put back", async () => {
        st.plan.engagementDue = new Date('2027-02-10T00:00:00Z')
        st.txFails = true
        st.putBackFails = true
        const res = await patch('D', { dueDate: '2027-02-10', fixes: ['move_engagement'] })
        const body = await res.json()
        expect(res.status).toBe(500)
        expect(body.error).toMatch(/^Couldn't set the due date\. The engagement's due date moved to .+, but D\.xlsx didn't\. Try again\.$/)
        expect(body.engagementDueDate).toBe('2027-02-10T00:00:00.000Z')
    })

    it('saves no date unless all of them are saved', async () => {
        st.plan.documents = [{ id: 'D', due: new Date('2026-11-12T00:00:00Z') }]
        st.txFails = true
        const res = await patch('d1', { dueDate: '2026-11-12', fixes: ['move_deliverable'] })
        expect(res.status).toBe(500)
        expect(calls.reminders).toEqual([])
        expect(calls.putBack).toEqual([])
    })

    it('keeps the saved date and warns when its reminders could not be scheduled', async () => {
        st.inngestUp = false
        const res = await patch('D', { dueDate: '2026-11-12' })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({
            dueDate: new Date('2026-11-12').toISOString(),
            warning: "Due date saved, but its reminders and notices for D.xlsx couldn't all be updated. Set the date again to retry.",
        })
    })

    it('keeps the saved date and warns when its notices could not be written', async () => {
        st.notifyFails = true
        const res = await patch('d1', { dueDate: '2026-11-12' })
        expect(res.status).toBe(200)
        expect((await res.json()).warning).toMatch(/d1\.xlsx/)
    })

    it('answers plain words when something else fails', async () => {
        st.plan = null as any
        const res = await patch('d1', { dueDate: '2026-11-12' })
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: "Couldn't set the due date. Something went wrong on our side. Try again." })
    })
})
