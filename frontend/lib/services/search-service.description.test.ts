import { describe, it, expect, vi, beforeEach } from 'vitest'

// Descriptions in search (2026-10-29): the words the firm wrote in the Details pane match like a
// name does, a little below one, and say where they were found.

const { st } = vi.hoisted(() => ({ st: { queries: [] as string[], rows: [] as any[], updates: [] as unknown[][] } }))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRawUnsafe: async (query: string) => { st.queries.push(query); return st.rows },
        $executeRawUnsafe: async (...args: unknown[]) => { st.updates.push(args); return 1 },
        engagementDocument: {
            findUnique: async () => ({ fileName: 'Plan.xlsx', settings: { description: 'Fee schedule for the renewal' }, metadata: {} }),
        },
    },
}))
vi.mock('../embeddings', () => ({
    generateEmbedding: async (text: string) => { st.updates.push(['embedded', text]); return [0.1, 0.2] },
    prepareTextForEmbedding: (name: string, _summary: unknown, description?: string | null) => (description ? `File: ${name} | Description: ${description}` : name),
}))
vi.mock('../google-drive-connector', () => ({ googleDriveConnector: {} }))
vi.mock('../connectors/registry', () => ({ getContentAdapter: vi.fn() }))
vi.mock('../summarization', () => ({ generateSummary: vi.fn() }))

import { SearchService } from './search-service'

beforeEach(() => {
    st.queries = []
    st.rows = []
    st.updates = []
})

const row = (extra: object) => ({ externalId: 'e1', fileName: 'Plan.xlsx', updatedAt: new Date(), metadata: {}, isFolder: false, ...extra })

describe('searching descriptions', () => {
    it('matches a term in the description as well as the name', async () => {
        await SearchService.searchByFileNameTerms({ organizationId: 'f', projectId: 'p', terms: ['fees'] })
        expect(st.queries[0]).toContain(`settings->>'description' ILIKE`)
    })

    it('says a match was found only in the description, shows it, and ranks it below a name match', async () => {
        st.rows = [row({ nameMatched: false, description: 'Fee schedule for the renewal' }), row({ externalId: 'e2', nameMatched: true, description: 'x' })]
        const results = await SearchService.searchByFileName({ organizationId: 'f', projectId: 'p', query: 'fee' })
        expect(results[0]).toMatchObject({ matchedIn: 'description', description: 'Fee schedule for the renewal', score: 0.85 })
        expect(results[1]).toMatchObject({ matchedIn: 'name', score: 0.92 })
        expect(results[1]).not.toHaveProperty('description')
    })
})

describe('what search leaves out', () => {
    it('keeps finalized documents, every approved one among them, and leaves out only private ones and pending uploads', async () => {
        await SearchService.searchByFileName({ organizationId: 'f', projectId: 'p', query: 'plan' })
        await SearchService.searchSimilarityHierarchy({ organizationId: 'f', projectId: 'p', query: 'plan' })
        for (const q of st.queries) {
            expect(q).toContain(`NOT IN ('private', 'intake')`)
            expect(q).not.toContain(`'lock'->>'type') IS NULL`)
        }
    })
})

describe('refreshEmbedding', () => {
    it("rebuilds a document's vector from its name and description", async () => {
        await SearchService.refreshEmbedding('d1')
        expect(st.updates[0]).toEqual(['embedded', 'File: Plan.xlsx | Description: Fee schedule for the renewal'])
        expect(st.updates[1]).toEqual([expect.stringContaining('SET embedding'), '[0.1,0.2]', 'd1'])
    })
})
