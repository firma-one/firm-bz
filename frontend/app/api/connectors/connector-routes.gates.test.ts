import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Connector routes must check the caller's rights on the connector itself — a connector id is not
 * a secret (.claude/plans/access-gates.md, P0 #1–#4). Each route: signed-out, refused, allowed.
 */

const { who, rights, drive, registry } = vi.hoisted(() => ({
    who: { user: { id: 'u1' } as { id: string } | null },
    rights: { manage: false, firmAdmin: false, connectRights: null as string | null },
    drive: { getAccessToken: vi.fn(async () => 'live-google-token'), testConnection: vi.fn(async () => ({ ok: true })) },
    registry: { getConnections: vi.fn(async () => [{ id: 'conn' }]), disconnectConnection: vi.fn(async () => {}) },
}))

vi.mock('@/lib/connectors/connector-access', () => ({
    getRequestUser: vi.fn(async () => who.user),
    requireRequestUser: vi.fn(async () => {
        if (!who.user) { const e: any = new Error('Unauthorized'); e.status = 401; e.__access = true; throw e }
        return who.user
    }),
    requireConnectorManager: vi.fn(async () => {
        if (!rights.manage) { const e: any = new Error('Connection not found'); e.status = 404; e.__access = true; throw e }
        return { id: 'conn' }
    }),
    getManageableConnector: vi.fn(async () => (rights.manage ? { id: 'conn' } : null)),
    isFirmAdmin: vi.fn(async () => rights.firmAdmin),
    checkConnectTargetRights: vi.fn(async () => rights.connectRights),
    accessErrorResponse: (e: any) => (e?.__access ? { body: { error: e.message, code: 'X' }, status: e.status } : null),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { connector: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) } } }))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive }))
vi.mock('@/lib/config', () => ({
    config: { googleDrive: { clientId: 'gcid', redirectUri: 'http://localhost/cb' }, supabase: { url: 'http://x', serviceRoleKey: 'k' } },
    getGoogleDriveOAuthServerCredentials: () => ({ clientId: 'gcid', clientSecret: 's' }),
}))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: who.user ? null : new Error('x') }) } }),
}))
vi.mock('@/lib/connectors/registry', () => ({ ...registry, getMigrationAdapter: vi.fn() }))
vi.mock('@/lib/actions/connectors', () => ({ removeConnector: vi.fn(async () => {}) }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn(), setupFirmFolder: vi.fn() }))
vi.mock('@/lib/connectors/adapters/google-drive-adapter', () => ({ createGoogleDriveAdapter: vi.fn() }))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { invalidateUser: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/firm-maintenance', () => ({ setMigrationPending: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

process.env.OAUTH_STATE_SECRET = 'route-test-secret'

const get = (url: string, headers: Record<string, string> = { authorization: 'Bearer t' }) => new NextRequest(new URL(url, 'http://localhost'), { headers })
const send = (url: string, method: string, body: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
    vi.clearAllMocks()
    who.user = { id: 'u1' }
    Object.assign(rights, { manage: false, firmAdmin: false, connectRights: null })
})

describe('GET /api/connectors/google-drive/token (P0 #1)', () => {
    it('hands out no token signed out or to someone who cannot manage the connector', async () => {
        const { GET } = await import('./google-drive/token/route')
        who.user = null
        expect((await GET(get('/api/connectors/google-drive/token?connectionId=conn'))).status).toBe(401)
        who.user = { id: 'u1' }
        expect((await GET(get('/api/connectors/google-drive/token?connectionId=conn'))).status).toBe(404)
        expect(drive.getAccessToken).not.toHaveBeenCalled()
    })

    it('returns the token to the owner or a firm admin', async () => {
        const { GET } = await import('./google-drive/token/route')
        rights.manage = true
        const res = await GET(get('/api/connectors/google-drive/token?connectionId=conn'))
        expect(res.status).toBe(200)
        expect((await res.json()).accessToken).toBe('live-google-token')
    })
})

describe('/api/connectors (P0 #2, #3)', () => {
    it('lists a firm\'s connectors to its firm admins only', async () => {
        const { GET } = await import('./route')
        expect((await GET(get('/api/connectors?organizationId=f1'))).status).toBe(403)
        expect(registry.getConnections).not.toHaveBeenCalled()
        rights.firmAdmin = true
        expect((await GET(get('/api/connectors?organizationId=f1'))).status).toBe(200)
    })

    it('disconnects only a connector the caller manages', async () => {
        const { DELETE } = await import('./route')
        expect((await DELETE(send('/api/connectors', 'DELETE', { connectionId: 'conn' }))).status).toBe(404)
        expect(registry.disconnectConnection).not.toHaveBeenCalled()
        rights.manage = true
        expect((await DELETE(send('/api/connectors', 'DELETE', { connectionId: 'conn' }))).status).toBe(200)
        expect(registry.disconnectConnection).toHaveBeenCalledWith('conn')
    })
})

describe('POST /api/connectors/google-drive (P0 #3, #4)', () => {
    it('gates every connector action — including unknown ones — on the connector', async () => {
        const { POST } = await import('./google-drive/route')
        who.user = null
        expect((await POST(send('/api/connectors/google-drive', 'POST', { action: 'test', connectionId: 'conn' }))).status).toBe(401)
        who.user = { id: 'u1' }
        for (const action of ['test', 'create-folder', 'ensure-folder', 'ensure-my-drive-workspace', 'finalize', 'no-such-action']) {
            expect((await POST(send('/api/connectors/google-drive', 'POST', { action, connectionId: 'conn' }))).status).toBe(404)
        }
        expect(drive.testConnection).not.toHaveBeenCalled()
        rights.manage = true
        expect((await POST(send('/api/connectors/google-drive', 'POST', { action: 'test', connectionId: 'conn' }))).status).toBe(200)
    })

    it('starts OAuth only for the signed-in user, with a signed state, after a rights check', async () => {
        const { POST } = await import('./google-drive/route')
        const { verifyOAuthState } = await import('@/lib/connectors/oauth-state')
        who.user = null
        expect((await POST(send('/api/connectors/google-drive', 'POST', { action: 'initiate', userId: 'victim' }))).status).toBe(401)
        who.user = { id: 'u1' }
        rights.connectRights = 'Only a firm admin can connect firm storage'
        expect((await POST(send('/api/connectors/google-drive', 'POST', { action: 'initiate', organizationId: 'f1' }))).status).toBe(403)
        rights.connectRights = null
        const res = await POST(send('/api/connectors/google-drive', 'POST', { action: 'initiate', userId: 'victim', organizationId: 'f1' }))
        const { state } = await res.json()
        expect(verifyOAuthState(state)?.userId).toBe('u1')
    })
})
