import { describe, it, expect, vi, beforeEach } from 'vitest'

// A doc ID ("FRM-198") is found the same way on firm Doc Search and in an engagement's Files search:
// one test for what counts as an id, one SQL clause for how it matches (a prefix, the exact id first).

const { st } = vi.hoisted(() => ({
    st: { calls: [] as { sql: string; params: unknown[] }[], fail: false, rows: [] as any[] },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
            st.calls.push({ sql, params })
            if (st.fail) throw new Error('connection terminated')
            return st.rows
        },
    },
}))
vi.mock('../embeddings', () => ({
    generateEmbedding: async () => [0.1, 0.2],
    prepareTextForEmbedding: (name: string) => name,
}))
vi.mock('../google-drive-connector', () => ({ googleDriveConnector: {} }))
vi.mock('../connectors/registry', () => ({ getContentAdapter: vi.fn() }))
vi.mock('../summarization', () => ({ generateSummary: vi.fn() }))
vi.mock('../logger', () => ({ logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { SearchService } from './search-service'
import { looksLikeDocId } from '../doc-id'

const docIdCalls = () => st.calls.filter((c) => c.sql.includes('"docId" ILIKE'))

beforeEach(() => {
    st.calls = []
    st.fail = false
    st.rows = []
})

describe('looksLikeDocId', () => {
    it.each(['FRM-198', 'frm-198', ' FRM-198 ', 'NVQ-7', 'FRM2-4', 'AB-1'])('reads %j as a doc ID', (q) => {
        expect(looksLikeDocId(q)).toBe(true)
    })

    it.each(['FRM198', 'FRM-', '198', 'budget', 'budget 2026', 'FRM-198 plan', '2FA-1', 'FRM-19%', 'FRM_-1'])(
        "doesn't read %j as a doc ID",
        (q) => {
            expect(looksLikeDocId(q)).toBe(false)
        },
    )
})

describe('SearchService.searchByDocId (engagement Files search)', () => {
    const run = (query: string) => SearchService.searchByDocId({ organizationId: 'f1', projectId: 'p1', query })

    it("doesn't read the database for a query that isn't a doc ID", async () => {
        expect(await run('budget plan')).toEqual([])
        expect(st.calls).toHaveLength(0)
    })

    it('matches the id as a prefix within this engagement, the exact id first, nothing private or in intake', async () => {
        st.rows = [{ externalId: 'e1', fileName: 'Plan.xlsx', updatedAt: new Date(), metadata: {}, isFolder: false, docId: 'FRM-198' }]
        const results = await run(' frm-198 ')
        expect(results).toEqual([expect.objectContaining({ externalId: 'e1', docId: 'FRM-198', score: 0.92 })])

        const [{ sql, params }] = st.calls
        expect(sql).toContain('d."firmId" = $1::uuid')
        expect(sql).toContain('d."engagementId" = $2::uuid')
        expect(sql).toContain('d."docId" ILIKE $3')
        expect(sql).toMatch(/ORDER BY \(UPPER\(d\."docId"\) = UPPER\(\$4\)\) DESC, d\."updatedAt" DESC/)
        expect(sql).toContain(`(d.settings->>'locked') IS DISTINCT FROM 'private'`)
        expect(sql).toContain(`NOT IN ('private', 'intake')`)
        expect(params).toEqual(['f1', 'p1', 'frm-198%', 'frm-198', 10])
    })

    it('answers nothing when its read fails, so the rest of the search still answers', async () => {
        st.fail = true
        expect(await run('FRM-198')).toEqual([])
    })
})

describe('firm Doc Search uses the same doc-ID match', () => {
    const params = {
        firmId: 'f1', userId: 'u1', isFirmAdmin: true,
        fullAccessEngagementIds: ['p1'], grantGatedEngagementIds: [],
    }

    it('runs the doc-ID branch for an id, prefix-matched with the exact id first', async () => {
        await SearchService.searchGlobal({ ...params, semanticText: 'frm-198' })
        const [{ sql, params: args }] = docIdCalls()
        expect(sql).toMatch(/ORDER BY \(UPPER\(d\."docId"\) = UPPER\(\$\d+\)\) DESC, d\."updatedAt" DESC/)
        expect(args).toContain('frm-198%')
        expect(args).toContain('frm-198')
    })

    it("skips it for a query that isn't an id", async () => {
        await SearchService.searchGlobal({ ...params, semanticText: 'budget plan' })
        expect(docIdCalls()).toHaveLength(0)
    })
})
