import { describe, it, expect, vi, beforeEach } from 'vitest'

// A document's Blocked flag (.claude/plans/deliverable-stages-blocked.md, section 3): the firm's own.

const { st, sql, events } = vi.hoisted(() => ({
    sql: [] as { query: string; args: unknown[] }[],
    events: [] as { type: string; meta: any }[],
    st: { role: 'eng_member' as string, doc: null as any },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', firmId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, getProjectPersona: async () => st.role }))
vi.mock('@/lib/audit', () => {
    const chain = (type: string) => {
        const entry = { type, meta: null as any }
        const c: any = {
            scope: () => c, firm: () => c, client: () => c, engagement: () => c, document: () => c, actor: () => c,
            meta: (m: any) => { entry.meta = m; return c },
            fireAndForget: () => { events.push(entry) },
        }
        return c
    }
    return { audit: chain, AUDIT_EVENT: { DOCUMENT_BLOCKED: 'DOCUMENT_BLOCKED', DOCUMENT_UNBLOCKED: 'DOCUMENT_UNBLOCKED' }, AUDIT_SCOPE: { DOCUMENT: 'DOCUMENT' } }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findFirst: async () => st.doc },
        $executeRawUnsafe: async (query: string, ...args: unknown[]) => { sql.push({ query, args }); return 1 },
    },
}))

import { PATCH } from './route'

const patch = (body: object) => PATCH({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) })

beforeEach(() => {
    st.role = 'eng_member'
    st.doc = { id: 'd1', isFolder: false, fileName: 'Budget.xlsx', settings: {} }
    sql.length = 0
    events.length = 0
})

describe('PATCH blocked', () => {
    it('marks a document blocked, with what it waits on, in one jsonb_set', async () => {
        const res = await patch({ reason: 'client', note: '  Waiting on the Q3 export  ' })
        expect(res.status).toBe(200)
        expect((await res.json()).blocked).toMatchObject({ reason: 'client', note: 'Waiting on the Q3 export', by: 'me' })
        expect(sql[0].query).toContain("jsonb_set(COALESCE(settings, '{}'::jsonb), '{blocked}'")
        expect(JSON.parse(sql[0].args[0] as string)).toMatchObject({ reason: 'client', note: 'Waiting on the Q3 export' })
        expect(events).toEqual([{ type: 'DOCUMENT_BLOCKED', meta: { fileName: 'Budget.xlsx', reason: 'client', note: 'Waiting on the Q3 export' } }])
    })

    it('clears it, and says so in the trail', async () => {
        st.doc.settings = { blocked: { reason: 'team', at: 'x', by: 'u' } }
        const res = await patch({ blocked: null })
        expect(res.status).toBe(200)
        expect(sql[0].query).toContain("- 'blocked'")
        expect(events.map((e) => e.type)).toEqual(['DOCUMENT_UNBLOCKED'])
    })

    it("records nothing when it's saved unchanged", async () => {
        st.doc.settings = { blocked: { reason: 'team', note: 'Partner review', at: 'x', by: 'u' } }
        await patch({ reason: 'team', note: 'Partner review' })
        expect(events).toEqual([])
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('is refused to %s', async (role) => {
        st.role = role
        const res = await patch({ reason: 'client' })
        expect(res.status).toBe(403)
        expect(sql).toEqual([])
    })

    it('is for documents only: a deliverable shows its blocked documents', async () => {
        st.doc.isFolder = true
        const res = await patch({ reason: 'on_hold' })
        expect(res.status).toBe(400)
        expect(sql).toEqual([])
    })

    it('needs one of the three reasons', async () => {
        const res = await patch({ reason: 'because' })
        expect(res.status).toBe(400)
    })
})
