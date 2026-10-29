import { describe, it, expect, vi, beforeEach } from 'vitest'

// A deliverable's stage follows its documents (.claude/plans/deliverable-stages-blocked.md, section 2):
// a document's move carries it, asking first when that shows it to clients or approves it.

const { st, applied, approvals } = vi.hoisted(() => ({
    applied: [] as { id: string; next: string; derived: boolean }[],
    approvals: { archived: [] as any[], recorded: [] as any[], fail: false },
    st: {
        role: 'eng_admin' as string,
        rows: {} as Record<string, any>,
        inDeliverable: true,
        /** The engagement's client members, by role. */
        members: { eng_ext_collaborator: 1, eng_viewer: 2 } as Record<string, number>,
    },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', firmId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async (_p: string, id: string) => ({ organizationId: 'f', externalId: `ext-${id}` }) }))
vi.mock('@/lib/permission-helpers', () => ({ getProjectPersona: async () => st.role }))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => (st.inDeliverable ? { id: 'D', docId: 'QSR-1', name: 'Market report' } : null) }))
vi.mock('@/lib/files/apply-stage-change', async (importActual) => ({
    ...(await importActual<typeof import('@/lib/files/apply-stage-change')>()),
    applyStageChange: async (row: any, next: string, _ctx: unknown, opts: { derived?: boolean } = {}) => {
        applied.push({ id: row.id, next, derived: !!opts.derived })
        return { oldStatus: 'x' }
    },
}))
vi.mock('@/lib/files/approval-archive', () => {
    class ApprovalStorageError extends Error {}
    return {
        ApprovalStorageError,
        archiveApprovedVersion: async (input: any) => {
            approvals.archived.push(input)
            if (approvals.fail) throw new ApprovalStorageError("Couldn't reach Google Drive to archive the approved version. Try again, or reconnect the storage.")
            return {
                record: { id: 'ap-1', version: { id: '3.0', label: '3.0', savedAt: '2026-10-28T10:00:00Z' }, archived: { fileId: 'copy-1', name: 'd2 · approved Version 3.0' }, approvedAt: 'x', approvedBy: 'me' },
                lock: { type: 'finalize' },
            }
        },
        recordApproval: async (id: string, approval: any) => { approvals.recorded.push({ id, approval }) },
    }
})
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ slug: 'eq-seer', firmId: 'f' }) },
        engagementMember: { count: async ({ where }: any) => st.members[where.role] ?? 0 },
        engagementDocument: {
            findUnique: async ({ where }: any) => {
                if (where.id) return st.rows[where.id] ?? null
                const externalId = where.engagementId_firmId_externalId.externalId
                return Object.values(st.rows).find((r: any) => r.externalId === externalId) ?? null
            },
            findMany: async ({ where }: any) => where.id.in.map((id: string) => st.rows[id]),
        },
        // The deliverable's documents, at any depth
        $queryRawUnsafe: async () => Object.values(st.rows).filter((r: any) => !r.isFolder).map((r: any) => ({ id: r.id })),
    },
}))

import { PATCH } from './route'

const row = (id: string, settings: object, isFolder = false) => ({
    id, externalId: `ext-${id}`, fileName: id, settings, createdBy: 'u1', isFolder, parentId: isFolder ? 'root' : 'ext-D',
})
const deliverable = (status: string, share: object = {}) => row('D', { share: { createdAt: '2026-10-01', ...share }, activity: { status } }, true)
const doc = (id: string, status?: string, extra: object = {}) => row(id, { ...(status ? { activity: { status } } : {}), ...extra })
const setRows = (...rows: any[]) => { st.rows = Object.fromEntries(rows.map((r) => [r.id, r])) }

const patch = (documentId: string, body: object) =>
    PATCH({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId }) })

beforeEach(() => {
    st.role = 'eng_admin'
    st.inDeliverable = true
    st.members = { eng_ext_collaborator: 1, eng_viewer: 2 }
    applied.length = 0
    approvals.archived.length = 0
    approvals.recorded.length = 0
    approvals.fail = false
})

describe('moving a document', () => {
    it("moves just the document while its deliverable's stage stays", async () => {
        setRows(deliverable('in_progress', { externalCollaborator: { enabled: true } }), doc('d1', 'in_progress'), doc('d2', 'to_do'))
        const res = await patch('d2', { status: 'in_progress' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([{ id: 'd2', next: 'in_progress', derived: false }])
        expect((await res.json()).deliverable).toEqual({ id: 'D', status: 'in_progress' })
    })

    it('asks before its deliverable is shown to external contributors, and moves both once agreed', async () => {
        setRows(deliverable('to_do'), doc('d1', 'to_do'), doc('d2', 'to_do'))
        const asked = await patch('d1', { status: 'in_progress' })
        expect(asked.status).toBe(409)
        expect((await asked.json()).needsConfirmation).toMatchObject({
            deliverable: { id: 'D', name: 'D' }, from: 'to_do', to: 'in_progress', externalCollaborators: 1, viewers: 0, approves: false,
        })
        expect(applied).toEqual([])

        const res = await patch('d1', { status: 'in_progress', confirm: true })
        expect(res.status).toBe(200)
        expect(applied).toEqual([
            { id: 'd1', next: 'in_progress', derived: false },
            { id: 'D', next: 'in_progress', derived: true },
        ])
    })

    it("doesn't ask when nobody is in the role it opens to", async () => {
        st.members = {}
        setRows(deliverable('to_do'), doc('d1', 'to_do'), doc('d2', 'to_do'))
        const res = await patch('d1', { status: 'in_progress' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([
            { id: 'd1', next: 'in_progress', derived: false },
            { id: 'D', next: 'in_progress', derived: true },
        ])
    })

    it('says how many reviewers would newly see its documents', async () => {
        setRows(deliverable('in_progress', { externalCollaborator: { enabled: true } }), doc('d1', 'in_progress'))
        const asked = await patch('d1', { status: 'in_review' })
        expect((await asked.json()).needsConfirmation).toMatchObject({ to: 'in_review', externalCollaborators: 0, viewers: 2 })
    })

    it('asks before approving its deliverable', async () => {
        setRows(deliverable('in_review', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'approved'), doc('d2', 'in_review'))
        const asked = await patch('d2', { status: 'approved' })
        expect(asked.status).toBe(409)
        expect((await asked.json()).needsConfirmation).toMatchObject({ to: 'approved', approves: true, viewers: 0 })
        expect(applied).toEqual([])
    })

    it("doesn't ask when its deliverable only moves back", async () => {
        setRows(deliverable('in_review', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'in_review'), doc('d2', 'in_review'))
        const res = await patch('d1', { status: 'in_progress' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([
            { id: 'd1', next: 'in_progress', derived: false },
            { id: 'D', next: 'in_progress', derived: true },
        ])
    })

    it('leaves Not started documents out of the deliverable', async () => {
        setRows(deliverable('to_do'), doc('d1'), doc('d2'))
        const res = await patch('d1', { status: 'to_do' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([{ id: 'd1', next: 'to_do', derived: false }])
    })

    it("can't move a document once its deliverable is approved", async () => {
        setRows(deliverable('approved', { finalizedAt: '2026-10-20' }), doc('d1', 'approved'))
        const res = await patch('d1', { status: 'in_review' })
        expect(res.status).toBe(403)
        expect(applied).toEqual([])
    })

    it("keeps to the role's moves: a member can't approve", async () => {
        st.role = 'eng_member'
        setRows(deliverable('in_review', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'in_review'))
        const res = await patch('d1', { status: 'approved' })
        expect(res.status).toBe(403)
    })

    it('moves a document outside any deliverable on its own', async () => {
        st.inDeliverable = false
        setRows(doc('d1', 'to_do'))
        const res = await patch('d1', { status: 'in_progress' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([{ id: 'd1', next: 'in_progress', derived: false }])
    })

    it("doesn't send a client the document's Blocked flag", async () => {
        st.role = 'eng_ext_collaborator'
        setRows(deliverable('in_progress', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'in_progress', { blocked: { reason: 'team', at: 'x', by: 'u' } }))
        const res = await patch('d1', { status: 'in_review', confirm: true })
        expect(res.status).toBe(200)
        expect((await res.json()).sharing.settings).not.toHaveProperty('blocked')
    })
})

describe('a deliverable itself', () => {
    it("isn't moved by the firm: its stage follows its documents", async () => {
        setRows(deliverable('to_do'), doc('d1', 'to_do'))
        const res = await patch('D', { status: 'in_progress' })
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('derived_stage')
        expect(applied).toEqual([])
    })

    it("takes an external contributor's Submit for review to its In progress documents", async () => {
        st.role = 'eng_ext_collaborator'
        setRows(deliverable('in_progress', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'in_progress'), doc('d2', 'to_do'), doc('d3'))
        const res = await patch('D', { status: 'in_review' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([{ id: 'd1', next: 'in_review', derived: false }])
        expect(await res.json()).toMatchObject({ moved: 1, deliverable: { id: 'D', status: 'in_progress' } })
    })

    it("takes a reviewer's Request changes to its In review documents, and the deliverable back", async () => {
        st.role = 'eng_viewer'
        setRows(deliverable('in_review', { externalCollaborator: { enabled: true }, guest: { enabled: true } }), doc('d1', 'in_review'), doc('d2', 'in_review'))
        const res = await patch('D', { status: 'in_progress' })
        expect(res.status).toBe(200)
        expect(applied).toEqual([
            { id: 'd1', next: 'in_progress', derived: false },
            { id: 'd2', next: 'in_progress', derived: false },
            { id: 'D', next: 'in_progress', derived: true },
        ])
    })
})

describe('approving a document', () => {
    const approvedDeliverable = () => setRows(
        deliverable('in_review', { externalCollaborator: { enabled: true }, guest: { enabled: true } }),
        doc('d1', 'approved'),
        doc('d2', 'in_review'),
    )

    it('archives the approved version and records it, then moves the stage', async () => {
        approvedDeliverable()
        const res = await patch('d2', { status: 'approved', confirm: true })
        expect(res.status).toBe(200)
        expect(approvals.archived[0]).toMatchObject({ connectorId: 'conn', engagement: { slug: 'eq-seer', firmId: 'f' }, deliverableName: 'D', actorUserId: 'me' })
        expect(approvals.recorded).toEqual([{ id: 'd2', approval: expect.objectContaining({ record: expect.objectContaining({ id: 'ap-1' }) }) }])
        expect(applied).toEqual([
            { id: 'd2', next: 'approved', derived: false },
            { id: 'D', next: 'approved', derived: true },
        ])
    })

    it("is refused with what to do when storage can't be reached, and nothing moves", async () => {
        approvedDeliverable()
        approvals.fail = true
        const res = await patch('d2', { status: 'approved', confirm: true })
        expect(res.status).toBe(502)
        expect(await res.json()).toEqual({ error: "Couldn't reach Google Drive to archive the approved version. Try again, or reconnect the storage.", code: 'approval_storage' })
        expect(applied).toEqual([])
        expect(approvals.recorded).toEqual([])
    })

    it('asks about approving the deliverable before touching storage', async () => {
        approvedDeliverable()
        const res = await patch('d2', { status: 'approved' })
        expect(res.status).toBe(409)
        expect(approvals.archived).toEqual([])
    })

    it("doesn't archive any other move", async () => {
        setRows(deliverable('in_progress', { externalCollaborator: { enabled: true } }), doc('d1', 'in_progress'), doc('d2', 'to_do'))
        await patch('d2', { status: 'in_progress' })
        expect(approvals.archived).toEqual([])
    })
})
