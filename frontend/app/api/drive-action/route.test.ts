import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * /api/drive-action trashed files and revoked shares through whatever connector the body named
 * (.claude/plans/access-gates.md, P0 #5). Now: engagement-scoped trash needs edit rights, uses the
 * engagement's own connector, and only on a file inside its tree; everything else only through
 * connectors the caller manages.
 */

const { who, state, adapter } = vi.hoisted(() => ({
    who: { user: { id: 'u1' } as { id: string } | null },
    state: { canEdit: false, inTree: true, manageable: new Set<string>() },
    adapter: {
        trashFile: vi.fn(async () => {}),
        restoreFile: vi.fn(async () => {}) as ReturnType<typeof vi.fn> | undefined,
        getFileMetadata: vi.fn(async (..._args: unknown[]): Promise<any> => ({ mimeType: 'application/pdf' })),
        revokePermission: vi.fn(async () => true),
        updatePermissionExpiry: vi.fn(async () => true),
        getDuplicateFiles: vi.fn(async (): Promise<any[]> => []),
    },
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: who.user ? null : new Error('x') }) } }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: vi.fn(async () => ({ firmId: 'f1', clientId: 'c1' })), findUnique: vi.fn(async () => ({ firmId: 'f1' })) },
        engagementDocument: { findFirst: vi.fn(async (): Promise<any> => ({ id: 'd1', firmId: 'f1', engagement: { clientId: 'c1' } })) },
        firm: { findUnique: vi.fn(async () => ({ sandboxOnly: false })), findMany: vi.fn(async () => [{ id: 'f1', connector: { id: 'firm-conn', name: 'Firm' } }]) },
        firmMember: { findMany: vi.fn(async () => [{ firmId: 'f1' }]) },
        clientMember: { findMany: vi.fn(async () => []) },
        client: { findMany: vi.fn(async () => []) },
    },
}))
vi.mock('@/lib/permission-helpers', () => ({ canEditProject: vi.fn(async () => state.canEdit) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnector: vi.fn(async () => ({ id: 'eng-conn', name: 'Client' })) }))
vi.mock('@/lib/connectors/engagement-file-scope', () => ({ isFileInEngagementTree: vi.fn(async () => state.inTree) }))
vi.mock('@/lib/connectors/connector-access', () => ({ getManageableConnector: vi.fn(async (_u: string, id: string) => (state.manageable.has(id) ? { id } : null)) }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(async () => adapter) }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementFileMutationForbidden: vi.fn(async () => null) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    audit: () => { const b: any = { scope: () => b, firm: () => b, client: () => b, engagement: () => b, document: () => b, actor: () => b, meta: () => b, fireAndForget: () => {} }; return b },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))

import { POST } from './route'
import { prisma } from '@/lib/prisma'
import { safeInngestSend } from '@/lib/inngest/client'
import { storageFailure } from '@/lib/connectors/storage-failure'

const call = (body: Record<string, unknown>) =>
    POST(new NextRequest(new URL('http://localhost/api/drive-action'), { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) }))

beforeEach(() => {
    vi.clearAllMocks()
    who.user = { id: 'u1' }
    state.canEdit = false
    state.inTree = true
    state.manageable = new Set()
    adapter.restoreFile = vi.fn(async () => {})
})

describe('engagement-scoped trash', () => {
    it('refuses a signed-out caller and one who cannot edit the engagement', async () => {
        who.user = null
        expect((await call({ action: 'trash', fileId: 'file', projectId: 'e1' })).status).toBe(401)
        who.user = { id: 'u1' }
        expect((await call({ action: 'trash', fileId: 'file', projectId: 'e1' })).status).toBe(403)
        expect(adapter.trashFile).not.toHaveBeenCalled()
    })

    it('refuses another tenant\'s connector and a file outside the engagement', async () => {
        state.canEdit = true
        expect((await call({ action: 'trash', fileId: 'file', projectId: 'e1', connectorId: 'victim-conn' })).status).toBe(403)
        state.inTree = false
        expect((await call({ action: 'trash', fileId: 'someone-elses-file', projectId: 'e1' })).status).toBe(403)
        expect(adapter.trashFile).not.toHaveBeenCalled()
    })

    it('trashes a file in the engagement through the engagement\'s own connector', async () => {
        state.canEdit = true
        const res = await call({ action: 'trash', fileId: 'file', projectId: 'e1', connectorId: 'eng-conn' })
        expect(res.status).toBe(200)
        expect(adapter.trashFile).toHaveBeenCalledWith('eng-conn', 'file')
    })

    it('allows only trash when scoped to an engagement', async () => {
        state.canEdit = true
        expect((await call({ action: 'revoke', fileId: 'f', permissionId: 'p', projectId: 'e1' })).status).toBe(400)
    })
})

describe('actions without an engagement', () => {
    it('never acts through a connector the caller does not manage — even their firm\'s, as a guest', async () => {
        expect((await call({ action: 'revoke', fileId: 'f', permissionId: 'p' })).status).toBe(404)
        expect((await call({ action: 'revoke', fileId: 'f', permissionId: 'p', connectorId: 'victim-conn' })).status).toBe(404)
        expect(adapter.revokePermission).not.toHaveBeenCalled()
    })

    it('works through a connector the caller manages', async () => {
        state.manageable.add('firm-conn')
        const res = await call({ action: 'revoke', fileId: 'f', permissionId: 'p' })
        expect(res.status).toBe(200)
        expect(adapter.revokePermission).toHaveBeenCalledWith('firm-conn', 'f', 'p')
    })
})

describe('when the storage refuses a trash', () => {
    const LOCKED = 'OneDrive has this locked, usually because a file is open in Word, Excel or another app. Close it everywhere, then try again. It can take a minute to unlock.'

    it("answers the storage's reason and status", async () => {
        state.canEdit = true
        adapter.trashFile.mockRejectedValueOnce(storageFailure('locked', 'OneDrive'))
        const res = await call({ action: 'trash', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe(LOCKED)
    })

    it("keeps the first connector's reason when a fallback on another Drive only adds \"not found\"", async () => {
        state.manageable.add('target').add('other')
        vi.mocked(prisma.firm.findMany).mockResolvedValueOnce([
            { id: 'f1', connector: { id: 'target', name: 'Target' } },
            { id: 'f2', connector: { id: 'other', name: 'Other' } },
        ] as never)
        adapter.trashFile
            .mockRejectedValueOnce(storageFailure('locked', 'OneDrive'))
            .mockRejectedValueOnce(storageFailure('not_found', 'Google Drive'))
        const res = await call({ action: 'trash', fileId: 'file', connectorId: 'target' })
        expect(adapter.trashFile.mock.calls.map((c: unknown[]) => c[0])).toEqual(['target', 'other'])
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe(LOCKED)
    })
})

describe('restore (Undo on "Moved to trash")', () => {
    const inBin = (meta: Record<string, unknown> = {}) => ({ id: 'file', name: 'Report.pdf', mimeType: 'application/pdf', trashed: true, parents: ['folder'], ...meta })

    it('tells the cleanup after a trash that it can be undone, and through which connector', async () => {
        state.canEdit = true
        await call({ action: 'trash', fileId: 'file', projectId: 'e1' })
        expect(safeInngestSend).toHaveBeenCalledWith('file.delete.requested', expect.objectContaining({ externalId: 'file', connectorId: 'eng-conn', undoable: true }))
    })

    it('has the same gates as trash: edit rights, the engagement\'s connector, a file in its tree', async () => {
        expect((await call({ action: 'restore', fileId: 'file', projectId: 'e1' })).status).toBe(403)
        state.canEdit = true
        expect((await call({ action: 'restore', fileId: 'file', projectId: 'e1', connectorId: 'victim-conn' })).status).toBe(403)
        state.inTree = false
        expect((await call({ action: 'restore', fileId: 'someone-elses-file', projectId: 'e1' })).status).toBe(403)
        expect(adapter.restoreFile).not.toHaveBeenCalled()
    })

    it('is only for an engagement', async () => {
        state.manageable.add('firm-conn')
        expect((await call({ action: 'restore', fileId: 'file' })).status).toBe(400)
        expect(adapter.restoreFile).not.toHaveBeenCalled()
    })

    it('takes the file out of the trash through the engagement\'s connector', async () => {
        state.canEdit = true
        adapter.getFileMetadata.mockImplementation(async (_c: unknown, id: unknown) => (id === 'file' ? inBin() : { id: 'folder', trashed: false }))
        const res = await call({ action: 'restore', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(200)
        expect(adapter.restoreFile).toHaveBeenCalledWith('eng-conn', 'file')
    })

    it('is too late once the cleanup has removed the file\'s record', async () => {
        state.canEdit = true
        vi.mocked(prisma.engagementDocument.findFirst).mockResolvedValueOnce(null)
        adapter.getFileMetadata.mockImplementation(async () => inBin())
        const res = await call({ action: 'restore', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(409)
        expect(adapter.restoreFile).not.toHaveBeenCalled()
    })

    it('refuses when the file\'s folder is in the trash too', async () => {
        state.canEdit = true
        adapter.getFileMetadata.mockImplementation(async (_c: unknown, id: unknown) => (id === 'file' ? inBin() : { id: 'folder', trashed: true }))
        const res = await call({ action: 'restore', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(409)
        expect(adapter.restoreFile).not.toHaveBeenCalled()
    })

    it('answers success for a file already out of the trash, without restoring it again', async () => {
        state.canEdit = true
        adapter.getFileMetadata.mockImplementation(async () => inBin({ trashed: false }))
        expect((await call({ action: 'restore', fileId: 'file', projectId: 'e1' })).status).toBe(200)
        expect(adapter.restoreFile).not.toHaveBeenCalled()
    })

    it('says so for a provider that cannot restore (OneDrive)', async () => {
        state.canEdit = true
        adapter.restoreFile = undefined
        expect((await call({ action: 'restore', fileId: 'file', projectId: 'e1' })).status).toBe(400)
    })
})

describe('after a trash, and a refused restore', () => {
    it('answers success when the item is in the trash but its details then fail to load, and still cleans up the right kind', async () => {
        state.canEdit = true
        adapter.getFileMetadata.mockRejectedValueOnce(new Error('Graph 503'))
        vi.mocked(prisma.engagementDocument.findFirst).mockResolvedValueOnce({ isFolder: true } as never)
        const res = await call({ action: 'trash', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(200)
        expect(safeInngestSend).toHaveBeenCalledWith('folder.delete.requested', expect.objectContaining({ externalId: 'file' }))
    })

    it("carries the storage's reason when a restore is refused", async () => {
        state.canEdit = true
        adapter.getFileMetadata.mockImplementation(async (_c: unknown, id: unknown) => (id === 'file' ? { id: 'file', trashed: true, parents: ['folder'] } : { id: 'folder', trashed: false }))
        adapter.restoreFile = vi.fn(async () => { throw storageFailure('no_permission', 'Google Drive') })
        const res = await call({ action: 'restore', fileId: 'file', projectId: 'e1' })
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe(`Couldn’t restore it · ${storageFailure('no_permission', 'Google Drive').message}`)
    })
})

// P2-37: a duplicate search the storage refused says why, rather than reading as "no duplicates".
describe('a storage refusal', () => {
    it("answers the storage's reason and status", async () => {
        state.manageable.add('firm-conn')
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        adapter.getDuplicateFiles.mockRejectedValueOnce(storageFailure('reconnect', 'Google Drive'))
        const res = await call({ action: 'duplicate_search' })
        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.code).toBe('reconnect')
        expect(body.error).toMatch(/Reconnect/)
    })
})
