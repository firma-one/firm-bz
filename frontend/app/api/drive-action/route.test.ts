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
        getFileMetadata: vi.fn(async () => ({ mimeType: 'application/pdf' })),
        revokePermission: vi.fn(async () => true),
        updatePermissionExpiry: vi.fn(async () => true),
    },
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: who.user ? null : new Error('x') }) } }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: vi.fn(async () => ({ firmId: 'f1', clientId: 'c1' })), findUnique: vi.fn(async () => ({ firmId: 'f1' })) },
        engagementDocument: { findFirst: vi.fn(async () => ({ id: 'd1' })) },
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

const call = (body: Record<string, unknown>) =>
    POST(new NextRequest(new URL('http://localhost/api/drive-action'), { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) }))

beforeEach(() => {
    vi.clearAllMocks()
    who.user = { id: 'u1' }
    state.canEdit = false
    state.inTree = true
    state.manageable = new Set()
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
