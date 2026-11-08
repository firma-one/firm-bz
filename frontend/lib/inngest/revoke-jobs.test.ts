import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The revoke jobs take a Drive permission back through the connector it was granted on: the document's,
 * else its client's, as the regrant route resolves it. The firm's legacy connector may be empty or a
 * different Drive. And a permission Drive wouldn't give up isn't forgotten.
 */

const { st, revoke, logged, notify } = vi.hoisted(() => ({
    st: {
        clientConnector: 'client-conn' as string | null,
        firmConnector: 'firm-legacy-conn' as string | null,
        shares: [] as any[],
        queries: [] as any[],
        updates: [] as any[],
        adapters: new Set<string>(['client-conn', 'firm-legacy-conn', 'doc-conn']),
    },
    revoke: vi.fn(),
    logged: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    notify: vi.fn(async () => 1),
}))

vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: logged }))
vi.mock('@/lib/storage-access-notice', () => ({ notifyLeadsOfStorageAccess: notify }))
vi.mock('@/lib/connectors/trash-undo', () => ({ TRASH_UNDO_WINDOW_SECONDS: 60, wasRestoredFromBin: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async (connectorId: string) => (st.adapters.has(connectorId)
        ? {
            revokePermission: (...args: unknown[]) => revoke(...args),
            // The folder downgrade after a close isn't what these tests are about.
            getEngagementFolderIds: async () => ({}),
        }
        : null),
    getMigrationAdapter: vi.fn(),
    getConnectorInstance: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findUnique: async () => ({ firmId: 'f1', client: { connectorId: st.clientConnector } }),
            findFirst: async () => null,
        },
        firm: { findUnique: async () => ({ connectorId: st.firmConnector }) },
        engagementMember: { findFirst: async () => ({ role: 'eng_viewer' }), findMany: async () => [] },
        engagementDocument: {
            findMany: async () => [],
            // The disabled-role job reads the rows through their document.
            findUnique: vi.fn(async (): Promise<any> => ({
                externalId: 'ext-1',
                connectorId: st.shares[0]?.document.connectorId ?? null,
                sharingUsers: st.shares.map((s) => ({ id: s.id, userId: 'u1', connectorPermissionId: s.connectorPermissionId })),
            })),
        },
        engagementDocumentSharingUser: {
            findMany: async (args: any) => { st.queries.push(args); return st.shares },
            updateMany: async (args: any) => { st.updates.push(args); return { count: 1 } },
        },
    },
}))

import { revokeByDisabledPersona, revokeByMemberPersonaChange, revokeByRemovedMember, revokeProjectSharing } from './functions'

const share = (id: string, documentConnector: string | null = null, permission: string | null = `perm-${id}`) => ({
    id, userId: 'u1', connectorPermissionId: permission,
    document: { id: `doc-${id}`, fileName: 'Budget.xlsx', isFolder: false, externalId: 'ext-1', connectorId: documentConnector },
})
// Waits are instant here: the retry after one is what's tested.
const step = { run: async (_id: string, fn: () => unknown) => fn(), sleep: async () => {} }
const run = (fn: unknown, data: object) => (fn as { handler: (ctx: unknown) => Promise<any> }).handler({ event: { data }, step })

/** Every job, with the event that fires it. */
const JOBS: [string, unknown, object][] = [
    ['closing an engagement', revokeProjectSharing, { projectId: 'p1', organizationId: 'f1' }],
    ['changing a client\'s role', revokeByMemberPersonaChange, { projectId: 'p1', organizationId: 'f1', userId: 'u1', oldPersonaSlug: 'eng_ext_collaborator', newPersonaSlug: 'eng_viewer' }],
    ['removing a client', revokeByRemovedMember, { projectId: 'p1', organizationId: 'f1', userId: 'u1', personaSlug: 'eng_viewer' }],
    ['turning a role off on a document', revokeByDisabledPersona, { projectId: 'p1', organizationId: 'f1', sharingId: 'd1', documentId: 'ext-1', disabledPersonas: ['guest'] }],
]

/** The update that clears permission ids, and the one (if any) that keeps them. */
const clearing = () => st.updates.find((u) => u.data.connectorPermissionId === null)
const keeping = () => st.updates.find((u) => !('connectorPermissionId' in u.data))

beforeEach(() => {
    st.clientConnector = 'client-conn'
    st.firmConnector = 'firm-legacy-conn'
    st.shares = []
    st.queries = []
    st.updates = []
    st.adapters = new Set(['client-conn', 'firm-legacy-conn', 'doc-conn'])
    revoke.mockReset()
    revoke.mockResolvedValue(true)
    notify.mockClear()
    for (const fn of Object.values(logged)) fn.mockClear()
})

describe.each(JOBS)('%s', (_name, job, event) => {
    it("revokes through the client's connector, not the firm's legacy one", async () => {
        st.shares = [share('s1')]
        await run(job, event)
        expect(revoke).toHaveBeenCalledTimes(1)
        expect(revoke).toHaveBeenCalledWith('client-conn', 'ext-1', 'perm-s1')
    })

    it("still revokes when the firm has no connector of its own", async () => {
        st.firmConnector = null
        st.shares = [share('s1')]
        await run(job, event)
        expect(revoke).toHaveBeenCalledWith('client-conn', 'ext-1', 'perm-s1')
    })

    it("prefers the document's own connector", async () => {
        st.shares = [share('s1', 'doc-conn')]
        await run(job, event)
        expect(revoke).toHaveBeenCalledWith('doc-conn', 'ext-1', 'perm-s1')
    })

    it('clears the row once Drive has given the permission up', async () => {
        st.shares = [share('s1')]
        await run(job, event)
        expect(clearing().data.sharingPermissionStatus).toBe('REVOKED')
        expect(clearing().where.AND[1]).toEqual({ id: { notIn: [] } })
        expect(keeping()).toBeUndefined()
    })

    it.each([
        ['refuses', () => revoke.mockResolvedValue(false)],
        ['fails outright', () => revoke.mockRejectedValue(new Error('Drive unreachable'))],
    ])('keeps the permission id when Drive %s, and says so', async (_how, arrange) => {
        arrange()
        st.shares = [share('s1')]
        await run(job, event)
        expect(clearing().where.AND[1]).toEqual({ id: { notIn: ['s1'] } })
        expect(keeping()).toEqual({ where: { id: { in: ['s1'] } }, data: { sharingPermissionStatus: 'REVOKED' } })
        expect(logged.error).toHaveBeenCalled()
    })

    it('tries again after a wait, and is done when Drive gives it up the second time', async () => {
        revoke.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValue(true)
        st.shares = [share('s1')]
        await run(job, event)
        expect(revoke).toHaveBeenCalledTimes(2)
        // The retry clears the id it revoked.
        expect(st.updates.at(-1)).toEqual({ where: { AND: [{ id: { in: ['s1'] } }, { id: { notIn: [] } }] }, data: { sharingPermissionStatus: 'REVOKED', connectorPermissionId: null } })
        expect(notify).not.toHaveBeenCalled()
    })

    it("tells the engagement's Leads what still stands after the retry: the file, the person and why", async () => {
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        const refusal = storageFailure('reconnect', 'Google Drive')
        revoke.mockRejectedValue(refusal)
        st.shares = [share('s1')]
        await run(job, event)
        expect(revoke).toHaveBeenCalledTimes(2)
        expect(notify).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith('p1', [{
            kind: 'revoke', userId: 'u1', itemName: 'Budget.xlsx', itemType: 'file', documentId: 'doc-s1', reason: refusal.message, key: 'perm-s1',
        }])
    })

    it('retries only rows still revoked in Firma and holding an id', async () => {
        revoke.mockResolvedValue(false)
        st.shares = [share('s1')]
        await run(job, event)
        const retryQuery = st.queries.find((q) => q.where?.id?.in)
        expect(retryQuery.where).toEqual({ id: { in: ['s1'] }, connectorPermissionId: { not: null }, sharingPermissionStatus: 'REVOKED' })
    })

    it('with truly no connector, revokes in Firma, keeps the id for later, and logs what it could not do', async () => {
        st.clientConnector = null
        st.firmConnector = null
        st.shares = [share('s1')]
        await run(job, event)
        expect(revoke).not.toHaveBeenCalled()
        expect(clearing().data.sharingPermissionStatus).toBe('REVOKED')
        // Connecting the storage again lets a later revoke finish it.
        expect(keeping()).toEqual({ where: { id: { in: ['s1'] } }, data: { sharingPermissionStatus: 'REVOKED' } })
        expect(logged.warn).toHaveBeenCalledWith(expect.stringContaining('no connector'), expect.objectContaining({ count: 1 }))
        expect((notify.mock.calls[0] as unknown as [string, Array<{ reason: string }>])[1][0].reason).toContain('No storage is connected')
    })
})

describe('the rows a job looks at', () => {
    it('turning a role off revokes the id the sync kept on a row it marked revoked', async () => {
        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.engagementDocument.findUnique).mockResolvedValueOnce({
            externalId: 'ext-1', connectorId: null, settings: { share: { guest: { enabled: false } } },
            sharingUsers: [{ id: 's1', userId: 'u1', connectorPermissionId: 'perm-s1', sharingPermissionStatus: 'REVOKED' }],
        } as never)
        await run(revokeByDisabledPersona, { projectId: 'p1', sharingId: 'd1', disabledPersonas: ['guest'] })
        expect(revoke).toHaveBeenCalledWith('client-conn', 'ext-1', 'perm-s1')
    })

    it('leaves a permission granted again because the role was switched back on before the job ran', async () => {
        const { prisma } = await import('@/lib/prisma')
        vi.mocked(prisma.engagementDocument.findUnique).mockResolvedValueOnce({
            externalId: 'ext-1', connectorId: null, settings: { share: { guest: { enabled: true } } },
            sharingUsers: [{ id: 's1', userId: 'u1', connectorPermissionId: 'perm-s1', sharingPermissionStatus: 'GRANTED' }],
        } as never)
        const result = await run(revokeByDisabledPersona, { projectId: 'p1', sharingId: 'd1', disabledPersonas: ['guest'] })
        expect(revoke).not.toHaveBeenCalled()
        expect(result.message).toBe('No users to revoke')
    })

    it('on closing, retries a permission an earlier revoke could not finish', async () => {
        await run(revokeProjectSharing, { projectId: 'p1' })
        expect(st.queries[0].where.OR).toContainEqual({ connectorPermissionId: { not: null } })
    })

    it("on closing, clears the engagement's rows, not only those that held a permission", async () => {
        st.shares = [share('s1', null, null), share('s2')]
        await run(revokeProjectSharing, { projectId: 'p1' })
        expect(revoke).toHaveBeenCalledTimes(1)
        expect(clearing().where.AND[0]).toEqual({ engagementId: 'p1' })
    })

    it('leaves a firm member alone on a role change or removal', async () => {
        expect((await run(revokeByMemberPersonaChange, { projectId: 'p1', userId: 'u1', oldPersonaSlug: 'eng_member' })).message).toBe('No revocation needed')
        expect((await run(revokeByRemovedMember, { projectId: 'p1', userId: 'u1', personaSlug: 'eng_member' })).message).toContain('no revocation needed')
        expect(revoke).not.toHaveBeenCalled()
    })
})
