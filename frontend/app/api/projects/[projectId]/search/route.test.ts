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
        /** What the doc-ID search finds, in its order (the exact id first). */
        docIdHits: [] as { externalId: string; docId: string }[],
        docIdCalls: [] as { organizationId: string; projectId: string; query: string }[],
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
        searchByDocId: async (p: { organizationId: string; projectId: string; query: string }) => {
            st.docIdCalls.push({ organizationId: p.organizationId, projectId: p.projectId, query: p.query })
            return st.docIdHits.map((h) => ({ ...h, score: 0.92, updatedAt: new Date('2020-01-01') }))
        },
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

const search = async (q = 'budget') => {
    const res = await GET({ url: `http://x/api/projects/p/search?q=${encodeURIComponent(q)}` } as any, { params: Promise.resolve({ projectId: 'p' }) })
    const ordered = ((await res.json()).files ?? []).map((f: { id: string }) => f.id) as string[]
    return { status: res.status, ordered, ids: [...ordered].sort() }
}

beforeEach(() => {
    st.role = 'eng_admin'
    st.lockFilterFails = false
    st.locked = []
    st.visible = null
    st.hidden = new Set()
    st.docIdHits = []
    st.docIdCalls = []
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

// A doc ID ("FRM-198") is known only to Firma's index. Firm Doc Search found a document by it; the
// engagement's Files search didn't look, so the same id came back empty.
describe('engagement search by doc ID', () => {
    it('asks the doc-ID search with the query, scoped to this engagement', async () => {
        await search('FRM-198')
        expect(st.docIdCalls).toEqual([{ organizationId: 'f', projectId: 'p', query: 'FRM-198' }])
    })

    it('lists the document with that id first, ahead of newer name and Drive hits', async () => {
        st.docIdHits = [{ externalId: 'frm-198', docId: 'FRM-198' }, { externalId: 'frm-1980', docId: 'FRM-1980' }]
        const { ordered } = await search('frm-198')
        expect(ordered.slice(0, 2)).toEqual(['frm-198', 'frm-1980'])
        expect(ordered).toHaveLength(5)
    })

    it("shows a client a doc-ID match only when it's shared with them and not inside something private", async () => {
        st.role = 'eng_viewer'
        st.docIdHits = [
            { externalId: 'shared-by-id', docId: 'FRM-198' },
            { externalId: 'unshared-by-id', docId: 'FRM-1981' },
            { externalId: 'private-by-id', docId: 'FRM-1982' },
        ]
        st.visible = new Set(['shared-by-id', 'private-by-id'])
        st.hidden = new Set(['private-by-id'])
        expect((await search('FRM-198')).ids).toEqual(['shared-by-id'])
    })

    it('leaves out a doc-ID match whose own lock is private or intake', async () => {
        st.docIdHits = [{ externalId: 'locked-by-id', docId: 'FRM-198' }]
        st.locked = ['locked-by-id']
        expect((await search('FRM-198')).ids).not.toContain('locked-by-id')
    })
})
