import { describe, it, expect, vi, beforeEach } from 'vitest'

// Engagement search, for a Limited Access contributor or Reviewer: only what's shared with them, and
// nothing private to the firm. When the private-and-intake filter can't run, Drive's own hits (which
// know nothing of Firma's locks) aren't listed for them: it fails closed.

const { st } = vi.hoisted(() => ({
    st: {
        role: 'eng_admin' as string | null,
        lockFilterFails: false,
        locked: [] as string[],
        visible: null as Set<string> | null,
        hidden: new Set<string>(),
    },
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api/engagement-auth', () => ({ requireProjectView: async () => ({ user: { id: 'me' } }) }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => (st.role ? { role: st.role } : null),
    isExternalEngagementRole: (r: string | null | undefined) => r === 'eng_ext_collaborator' || r === 'eng_viewer',
    visibleDocumentIdsFor: async () => st.visible,
}))
vi.mock('@/lib/engagement-sharing-ids', () => ({ privateExternalIds: async () => st.hidden }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({
        getEngagementFolderIds: async () => ({ generalFolderId: 'general', confidentialFolderId: 'conf', stagingFolderId: null }),
        // Drive's own keyword hits
        searchFiles: async () => [
            { id: 'drive-only', name: 'Budget draft.xlsx', parents: ['general'] },
            { id: 'shared', name: 'Budget.xlsx', parents: ['general'] },
        ],
        getFilesMetadata: async (_c: string, ids: string[]) => ids.map((id) => ({ id, name: `${id}.pdf`, parents: ['general'] })),
    }),
}))
vi.mock('@/lib/services/search-service', () => ({
    SearchService: {
        getAllProjectFolderIds: async () => [],
        searchSimilarityHierarchy: async () => [],
        // An indexed hit, filtered for locks in its own query
        searchByFileName: async () => [{ externalId: 'indexed', score: 1 }],
        searchByFileNameTerms: async () => [],
    },
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ slug: 'acme', firmId: 'f', clientId: 'c' }) },
        connector: { findUnique: async () => ({ id: 'conn' }) },
        engagementDocument: { findMany: async () => [] },
        $queryRawUnsafe: async (query: string) => {
            if (query.includes("'private', 'intake'")) {
                if (st.lockFilterFails) throw new Error('connection reset')
                return st.locked.map((externalId) => ({ externalId }))
            }
            return []
        },
    },
}))

import { GET } from './route'

const search = async () => {
    const res = await GET({ url: 'http://x/api/projects/p/search?q=budget' } as any, { params: Promise.resolve({ projectId: 'p' }) })
    return { status: res.status, ids: ((await res.json()).files ?? []).map((f: { id: string }) => f.id).sort() }
}

beforeEach(() => {
    st.role = 'eng_admin'
    st.lockFilterFails = false
    st.locked = []
    st.visible = null
    st.hidden = new Set()
})

describe('engagement search', () => {
    it('lists everything for the firm', async () => {
        expect((await search()).ids).toEqual(['drive-only', 'indexed', 'shared'])
    })

    it("keeps the firm's results when the lock filter can't run, as before", async () => {
        st.lockFilterFails = true
        expect((await search()).ids).toEqual(['drive-only', 'indexed', 'shared'])
    })

    it("fails closed for a client when the lock filter can't run: Drive's own hits aren't listed", async () => {
        st.role = 'eng_viewer'
        st.visible = new Set(['drive-only', 'indexed', 'shared'])
        st.lockFilterFails = true
        expect((await search()).ids).toEqual(['indexed'])
    })

    it("shows a client only what's shared with them, and nothing inside something private", async () => {
        st.role = 'eng_ext_collaborator'
        st.visible = new Set(['shared', 'indexed'])
        st.hidden = new Set(['indexed'])
        expect((await search()).ids).toEqual(['shared'])
    })
})
