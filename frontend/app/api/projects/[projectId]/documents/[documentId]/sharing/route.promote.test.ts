import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deliverables don't nest (2026-10-29): a folder inside one, or one holding one, can't be promoted;
// and saving a description refreshes its vector and the storage's own field.

const { st, calls } = vi.hoisted(() => ({
    st: { inside: null as null | { id: string; docId: string | null; name: string }, nested: [] as { id: string }[] },
    calls: { updates: 0, refreshed: [] as string[], native: [] as unknown[][] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids }))
vi.mock('@/lib/sync-document-sharing', () => ({ syncDocumentSharingUsers: vi.fn() }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f', clientId: 'c', projectId: 'p', orgId: 'f' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true, canViewProject: async () => true, getProjectPersona: async () => 'eng_admin' }))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => st.inside }))
vi.mock('@/lib/files/native-description', () => ({ writeNativeDescription: async (...args: unknown[]) => { calls.native.push(args); return true } }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { refreshEmbedding: async (id: string) => { calls.refreshed.push(id) } } }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnector: vi.fn(), resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(), getContentAdapter: vi.fn() }))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/billing/subscription-gate', () => ({ assertFirmSubscriptionAccess: async () => {} }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDeliverableCap: async () => {}, assertWithinDocumentCap: async () => {} }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: vi.fn() }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementPath: () => '/' }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async () => ({ id: 'F', externalId: 'ext-F', parentId: 'ext-D', isFolder: true, fileName: '2026-11-05__Creative_Reel', settings: {}, connectorId: null }),
            update: async ({ data }: any) => { calls.updates++; return { id: 'F', settings: data.settings } },
            findUnique: async () => ({ id: 'F', settings: {} }),
        },
        engagement: { findUnique: async () => ({ name: 'E', firmId: 'f' }) },
        engagementMember: { findMany: async () => [] },
        engagementDocumentSharingUser: { upsert: async () => ({}) },
        $queryRawUnsafe: async (query: string) => (query.includes(`settings->'share'->>'createdAt' IS NOT NULL`) ? st.nested : []),
    },
}))

import { PUT } from './route'

const put = (body: object) => PUT({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'F' }) })

beforeEach(() => {
    st.inside = null
    st.nested = []
    calls.updates = 0
    calls.refreshed = []
    calls.native = []
})

describe('promoting a folder to a deliverable', () => {
    it("is refused inside a deliverable, naming it", async () => {
        st.inside = { id: 'D', docId: 'FRM-104', name: '2026-11_Creatives' }
        const res = await put({ markAsDeliverable: true })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe("It's inside FRM-104 · 2026-11_Creatives, which is a deliverable already.")
        expect(calls.updates).toBe(0)
    })

    it('is refused for a folder that holds a deliverable', async () => {
        st.nested = [{ id: 'D2' }]
        const res = await put({ markAsDeliverable: true })
        expect(res.status).toBe(409)
        expect(calls.updates).toBe(0)
    })

    it('goes ahead otherwise', async () => {
        const res = await put({ markAsDeliverable: true })
        expect(res.status).toBe(200)
        expect(calls.updates).toBe(1)
    })
})

describe('saving a description', () => {
    it("refreshes its vector and writes the storage's own field, after answering", async () => {
        const res = await put({ description: 'Fee schedule for the renewal' })
        expect(res.status).toBe(200)
        await new Promise((r) => setTimeout(r, 0))
        expect(calls.refreshed).toEqual(['F'])
        expect(calls.native).toEqual([['conn', 'ext-F', 'Fee schedule for the renewal']])
    })
})
