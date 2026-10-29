import { describe, it, expect, vi, beforeEach } from 'vitest'

// The deliverable a document is in, where its discussion happens (2026-10-29).

const { st } = vi.hoisted(() => ({
    st: { role: 'eng_member' as string | null, visible: null as Set<string> | null },
}))

const DELIVERABLE = { id: 'deliv-1', externalId: 'f-deliv', parentId: 'root', docId: 'QSR-9', fileName: 'Market report', settings: { share: { createdAt: '2026-09-01' } } }
const SUBFOLDER = { id: 'sub-1', externalId: 'f-sub', parentId: 'f-deliv', docId: null, fileName: 'Drafts', settings: {} }

vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ id: 'doc-1', externalId: 'ext-doc', organizationId: 'f' }) }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => (st.role ? { role: st.role } : null),
    visibleDocumentIdsFor: async () => st.visible,
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async ({ where }: any) => (where.id === 'doc-1' ? { parentId: 'f-sub' } : where.id === 'deliv-1' ? { externalId: 'f-deliv' } : null),
            findMany: async () => [DELIVERABLE, SUBFOLDER],
        },
    },
}))

import { GET } from './route'

const get = () => GET({} as never, { params: Promise.resolve({ projectId: 'p', documentId: 'doc-1' }) })

beforeEach(() => {
    st.role = 'eng_member'
    st.visible = null
})

describe('GET the deliverable a document is in', () => {
    it('walks up through plain folders to the deliverable', async () => {
        const res = await get()
        expect(await res.json()).toEqual({ deliverable: { id: 'deliv-1', docId: 'QSR-9', name: 'Market report' } })
    })

    it('refuses a non-member', async () => {
        st.role = null
        expect((await get()).status).toBe(404)
    })

    it('keeps a client out of a document not shared with them', async () => {
        st.role = 'eng_viewer'
        st.visible = new Set(['something-else'])
        expect((await get()).status).toBe(404)
    })

    it("doesn't name a deliverable the client can't see", async () => {
        st.role = 'eng_viewer'
        st.visible = new Set(['ext-doc'])
        expect(await (await get()).json()).toEqual({ deliverable: null })
    })
})
