import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unlocking for the next phase (.claude/plans/document-approval-record.md, section 4): edit access
// comes back, the approval is kept and marked reopened, and an approved document goes to To do.

const { st, calls } = vi.hoisted(() => ({
    st: { role: 'eng_admin' as string, settings: {} as Record<string, any> },
    calls: { unlocked: [] as any[], written: [] as any[], moved: [] as any[], derived: [] as any[] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.role }),
    isEngagementLeadRole: (r: string) => r === 'eng_admin',
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ organizationId: 'f', externalId: 'ext-d1' }) }))
vi.mock('@/lib/files/storage-lock', () => ({
    unlockFileInStorage: async (...args: any[]) => { calls.unlocked.push(args) },
}))
vi.mock('@/lib/files/apply-stage-change', () => ({
    applyStageChange: async (row: any, next: string, _ctx: unknown, opts: any) => { calls.moved.push({ id: row.id, next, opts }) },
}))
vi.mock('@/lib/files/deliverable-stage', () => ({
    STAGE_ROW_SELECT: {},
    derivedMove: async () => ({ deliverable: { id: 'D' }, to: 'in_progress' }),
    applyDerivedMove: async (move: any) => { calls.derived.push(move) },
}))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => ({ id: 'D', docId: 'QSR-1', name: 'Report' }) }))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async ({ where }: any) => (where.id === 'D'
                ? { id: 'D', settings: {} }
                : { id: 'd1', clientId: 'c', connectorId: 'conn', fileName: 'Plan.xlsx', parentId: 'ext-D', settings: st.settings }),
            update: async ({ data }: any) => { calls.written.push(data.settings) },
        },
    },
}))

import { PATCH } from './route'

const patch = () => PATCH({} as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) })
const approval = { id: 'ap-1', version: { id: '3.0', label: '3.0', savedAt: 'x' }, archived: { fileId: 'c1', name: 'n' }, approvedAt: 'x', approvedBy: 'u-ana' }

beforeEach(() => {
    st.role = 'eng_admin'
    st.settings = {
        activity: { status: 'approved' },
        share: { finalizedAt: 'x' },
        lock: { type: 'finalize', downgraded: [{ permissionId: 'p1', previousRole: 'editor' }] },
        approvals: [approval],
    }
    for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
})

describe('PATCH unlock', () => {
    it('restores edit access in storage', async () => {
        const res = await patch()
        expect(res.status).toBe(200)
        expect(calls.unlocked).toEqual([['conn', 'ext-d1', [{ permissionId: 'p1', previousRole: 'editor' }]]])
    })

    it('keeps the approval, marked reopened, and drops the lock', async () => {
        await patch()
        const written = calls.written[0]
        expect(written).not.toHaveProperty('lock')
        expect(written.share.finalizedAt).toBeNull()
        expect(written.approvals).toEqual([{ ...approval, unlockedAt: expect.any(String), unlockedBy: 'me' }])
    })

    it('takes an approved document back to To do, its deliverable with it', async () => {
        await patch()
        expect(calls.moved).toEqual([{ id: 'd1', next: 'to_do', opts: { auditMeta: { reopened: true, approvalId: 'ap-1', versionName: 'Version 3.0' } } }])
        expect(calls.derived).toHaveLength(1)
    })

    it('leaves the stage of a document that was only finalized', async () => {
        st.settings = { activity: { status: 'in_progress' }, lock: { type: 'finalize', downgraded: [] } }
        await patch()
        expect(calls.moved).toEqual([])
        expect(calls.written[0]).not.toHaveProperty('approvals')
    })

    it('is for leads only', async () => {
        st.role = 'eng_member'
        const res = await patch()
        expect(res.status).toBe(403)
        expect(calls.unlocked).toEqual([])
    })
})
