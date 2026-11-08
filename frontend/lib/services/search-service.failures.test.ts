import { describe, it, expect, vi, beforeEach } from 'vitest'

// A failed search is an error, never an empty list the page shows as "No results" (EM-6). Firm search
// runs several branches at once: one failing narrows what's found, all of them failing is an error.

const { st } = vi.hoisted(() => ({
    st: { fail: (_q: string) => false as boolean, embedFails: false, rows: [] as any[] },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRawUnsafe: async (query: string) => {
            if (st.fail(query)) throw new Error('connection terminated')
            return st.rows
        },
    },
}))
vi.mock('../embeddings', () => ({
    generateEmbedding: async () => { if (st.embedFails) throw new Error('embeddings unavailable'); return [0.1, 0.2] },
    prepareTextForEmbedding: (name: string) => name,
}))
vi.mock('../google-drive-connector', () => ({ googleDriveConnector: {} }))
vi.mock('../connectors/registry', () => ({ getContentAdapter: vi.fn() }))
vi.mock('../summarization', () => ({ generateSummary: vi.fn() }))
vi.mock('../logger', () => ({ logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { SearchService } from './search-service'

const params = {
    firmId: 'f1', userId: 'u1', semanticText: 'budget plan', isFirmAdmin: true,
    fullAccessEngagementIds: [], grantGatedEngagementIds: [],
}

beforeEach(() => {
    st.fail = () => false
    st.embedFails = false
    st.rows = []
})

describe('searchGlobal when its reads fail', () => {
    it('throws when every branch failed, rather than answering no results', async () => {
        st.fail = () => true
        await expect(SearchService.searchGlobal(params)).rejects.toThrow('connection terminated')
    })

    it('keeps what the other branches found when only the semantic branch failed', async () => {
        st.embedFails = true
        st.rows = [{ externalId: 'e1', fileName: 'Budget plan.xlsx', updatedAt: new Date(), metadata: {}, isFolder: false, nameMatched: true }]
        const results = await SearchService.searchGlobal(params)
        expect(results.map((r) => r.externalId)).toEqual(['e1'])
    })

    it('still answers an empty list when the search ran and found nothing', async () => {
        await expect(SearchService.searchGlobal(params)).resolves.toEqual([])
    })
})

describe('getExternalIdsUnderRoot', () => {
    it("throws on a failed read: an empty set would scope a deliverable's search to nothing", async () => {
        st.fail = () => true
        await expect(SearchService.getExternalIdsUnderRoot({ organizationId: 'f1', projectId: 'p1', rootFolderId: 'r1' })).rejects.toThrow()
    })
})
