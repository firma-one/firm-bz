import { describe, it, expect, vi, beforeEach } from 'vitest'

// Demoting a deliverable (decision 5, AC-8): what clients were granted inside it is taken back in
// storage first, and a row whose permission storage wouldn't give up is kept, with a warning. The
// settings that put it on the Board are cleared last, so a failure leaves a deliverable to demote again.

const { st, calls } = vi.hoisted(() => ({
    st: {
        shares: [] as any[],
        refused: new Set<string>(),
        connector: 'conn' as string | null,
        failDelete: false,
    },
    calls: { order: [] as string[], revoked: [] as string[], deleted: [] as any[], marked: [] as any[] },
}))

vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    blockIfEngagementCompleted: async () => null,
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids }))
vi.mock('@/lib/sync-document-sharing', () => ({ syncDocumentSharingUsers: vi.fn() }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async () => true) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f', clientId: 'c', projectId: 'p', orgId: 'f' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true, canViewProject: async () => true, getProjectPersona: async () => 'eng_admin' }))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => null }))
vi.mock('@/lib/files/native-description', () => ({ writeNativeDescription: async () => true }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { refreshEmbedding: async () => {} } }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({
    resolveEngagementConnector: async () => (st.connector ? { id: st.connector, type: 'GOOGLE_DRIVE', status: 'ACTIVE' } : null),
    resolveEngagementConnectorId: async (_e: string, docConnector?: string | null) => docConnector ?? st.connector,
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({
        revokePermission: async (_c: string, _file: string, permissionId: string) => {
            calls.order.push(`revoke ${permissionId}`)
            calls.revoked.push(permissionId)
            return !st.refused.has(permissionId)
        },
    }),
    getContentAdapter: async () => null,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
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
            findFirst: async () => ({ id: 'D', externalId: 'ext-D', parentId: null, isFolder: true, fileName: 'Market report', settings: { share: { createdAt: 'x' }, description: 'kept' }, connectorId: null }),
            update: async ({ data }: any) => { calls.order.push('settings'); return { id: 'D', settings: data.settings } },
            findUnique: async () => ({ id: 'D', settings: { description: 'kept' } }),
        },
        engagement: { findUnique: async () => ({ firmId: 'f' }) },
        engagementDocumentSharingUser: {
            findMany: async () => st.shares,
            updateMany: async (args: any) => { calls.marked.push(args); return { count: 1 } },
            deleteMany: async (args: any) => {
                if (st.failDelete) throw new Error('connection reset')
                calls.order.push('delete rows')
                calls.deleted.push(args.where)
                return { count: 1 }
            },
        },
        $queryRawUnsafe: async () => [{ id: 'a' }, { id: 'b' }],
    },
}))

import { PUT } from './route'

const demote = () => PUT({ json: async () => ({ untagAsDeliverable: true }) } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'D' }) })
const share = (id: string, userId: string, permission: string, doc = 'a') => ({ id, userId, connectorPermissionId: permission, document: { externalId: `ext-${doc}`, connectorId: null } })

beforeEach(() => {
    st.shares = []
    st.refused = new Set()
    st.connector = 'conn'
    st.failDelete = false
    for (const list of Object.values(calls)) list.length = 0
})

describe('demoting a deliverable', () => {
    it("takes back clients' storage permissions first, then the rows, then the settings", async () => {
        st.shares = [share('s1', 'ana', 'perm-1'), share('s2', 'ben', 'perm-2', 'b')]
        const res = await demote()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.warning).toBeUndefined()
        expect(calls.revoked.sort()).toEqual(['perm-1', 'perm-2'])
        expect(calls.order.indexOf('settings')).toBe(calls.order.length - 1)
        expect(calls.order.findIndex((o) => o === 'delete rows')).toBeGreaterThan(calls.order.findIndex((o) => o.startsWith('revoke')))
    })

    it("keeps the row of a permission storage wouldn't give up, and says who still has access", async () => {
        st.shares = [share('s1', 'ana', 'perm-1'), share('s2', 'ben', 'perm-2', 'b')]
        st.refused = new Set(['perm-2'])
        const body = await (await demote()).json()
        expect(body.warning).toBe('Demoted, but 1 person still has access in storage · Google Drive refused to take it back. Remove their access in Google Drive.')
        // Neither the folder's rows nor its documents' rows lose the one still standing.
        for (const where of calls.deleted) expect(where.id).toEqual({ notIn: ['s2'] })
        // It's revoked in Firma, its permission id kept for a later revoke.
        expect(calls.marked.at(-1)).toMatchObject({ where: { id: { in: ['s2'] } }, data: { sharingPermissionStatus: 'REVOKED' } })
        expect(calls.marked.at(-1).data).not.toHaveProperty('connectorPermissionId')
    })

    it('says so when no storage is connected to take it back', async () => {
        st.shares = [share('s1', 'ana', 'perm-1')]
        st.connector = null
        const body = await (await demote()).json()
        expect(body.warning).toBe('Demoted, but 1 person still has access in storage · No storage is connected to take it back.')
        for (const where of calls.deleted) expect(where.id).toEqual({ notIn: ['s1'] })
    })

    it('deletes every row when nobody holds a permission', async () => {
        await demote()
        expect(calls.revoked).toEqual([])
        expect(calls.deleted[0]).toEqual({ projectDocumentId: 'D', id: { notIn: [] } })
        expect(calls.deleted[1]).toMatchObject({ projectDocumentId: { in: ['a', 'b'] }, sharingPermissionStatus: 'INHERITED' })
    })

    it('leaves it on the Board when the rows fail partway, saying what failed', async () => {
        st.failDelete = true
        const res = await demote()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't demote this deliverable. Something went wrong on our side. Try again.")
        expect(calls.order).not.toContain('settings')
    })
})
