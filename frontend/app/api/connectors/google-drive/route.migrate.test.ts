import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * CN-1: Migrate finds the firm through Connector.firmId (not the legacy Firm.connectorId), checks
 * everything before repointing the root, and puts the root back when the job can't be queued.
 * CN-3: folder setup that fails after choosing a workspace folder answers success with a warning.
 * P1-33: a null access token is the one "reconnect" reason. P2-34: no false "about 1 minute".
 */

const { db, drive, inngest, maint, setup } = vi.hoisted(() => ({
    db: {
        connector: { id: 'conn', userId: 'u1', type: 'GOOGLE_DRIVE', settings: { rootFolderId: 'old-root', parentFolderId: 'old-root' } } as any,
        firm: { id: 'f1', slug: 'acme' } as any,
        updates: [] as any[],
    },
    drive: { token: 'tok' as string | null },
    inngest: { sent: true as boolean },
    maint: { active: null as any, setPending: vi.fn(async () => undefined) },
    setup: { firmFolder: vi.fn(async () => undefined) },
}))

vi.mock('@/lib/connectors/connector-access', () => ({
    getRequestUser: vi.fn(async () => ({ id: 'u1' })),
    getManageableConnector: vi.fn(async () => ({ id: 'conn' })),
    isFirmAdmin: vi.fn(async () => true),
    checkConnectTargetRights: vi.fn(async () => null),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: {
            findUnique: vi.fn(async () => db.connector),
            update: vi.fn(async (arg: any) => {
                db.updates.push(arg)
                return {}
            }),
        },
        client: { findFirst: vi.fn(async () => null) },
        engagement: { findMany: vi.fn(async () => []) },
        firm: { findUnique: vi.fn(async () => db.firm), findFirst: vi.fn(async () => db.firm) },
    },
}))
vi.mock('@/lib/connectors/connector-firm', () => ({ findFirmForConnector: vi.fn(async () => db.firm) }))
vi.mock('@/lib/google-drive-connector', () => ({
    googleDriveConnector: {
        getAccessToken: vi.fn(async () => drive.token),
        persistWorkspaceRootLocation: vi.fn(async () => undefined),
    },
}))
vi.mock('@/lib/config', () => ({
    config: { googleDrive: { clientId: 'gcid', redirectUri: 'http://localhost/cb' } },
    getGoogleDriveOAuthServerCredentials: () => ({ clientId: 'gcid', clientSecret: 's' }),
}))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/connectors/registry', () => ({ getMigrationAdapter: vi.fn(async () => ({ persistWorkspaceRootLocation: vi.fn() })) }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn(), setupFirmFolder: setup.firmFolder }))
vi.mock('@/lib/connectors/adapters/google-drive-adapter', () => ({ createGoogleDriveAdapter: vi.fn(() => ({})) }))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { invalidateUser: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async () => inngest.sent) }))
vi.mock('@/lib/firm-maintenance', () => ({
    setMigrationPending: maint.setPending,
    getActiveMigration: vi.fn(async () => maint.active),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'
import { safeInngestSend } from '@/lib/inngest/client'

const send = (body: unknown) =>
    POST(
        new NextRequest(new URL('/api/connectors/google-drive', 'http://localhost'), {
            method: 'POST',
            headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
    )

const migrate = () => send({ action: 'migrate-and-update-root', connectionId: 'conn', newRootFolderId: 'new-root' })

const rootWrites = () => db.updates.filter((u) => u.data?.settings?.rootFolderId).map((u) => u.data.settings.rootFolderId)

beforeEach(() => {
    vi.clearAllMocks()
    db.updates = []
    db.firm = { id: 'f1', slug: 'acme' }
    drive.token = 'tok'
    inngest.sent = true
    maint.active = null
})

describe('migrate-and-update-root', () => {
    it('queues the job for the firm found through the connector, and repoints the root', async () => {
        const res = await migrate()
        expect(res.status).toBe(200)
        expect(vi.mocked(safeInngestSend)).toHaveBeenCalledWith('workspace.migrate.requested', expect.objectContaining({ firmId: 'f1', oldRootFolderId: 'old-root' }))
        expect(rootWrites()).toEqual(['new-root'])
    })

    it('refuses, and leaves the root alone, when the connection has no firm', async () => {
        db.firm = null
        const res = await migrate()
        expect(res.status).toBe(409)
        expect((await res.json()).error).toMatch(/^Migration couldn't start\. Your files and folder are unchanged · /)
        expect(rootWrites()).toEqual([])
        expect(vi.mocked(safeInngestSend)).not.toHaveBeenCalled()
    })

    it('refuses a second migration while one is under way', async () => {
        maint.active = { id: 'm1', status: 'in_progress' }
        expect((await migrate()).status).toBe(409)
        expect(rootWrites()).toEqual([])
    })

    it('says the connection needs renewing when there is no token, before touching anything', async () => {
        drive.token = null
        const res = await migrate()
        const body = await res.json()
        expect(body.code).toBe('reconnect')
        expect(body.error).toMatch(/needs renewing/)
        expect(rootWrites()).toEqual([])
    })

    it('puts the old root back and says why when the job cannot be queued', async () => {
        inngest.sent = false
        const res = await migrate()
        expect(res.status).toBe(503)
        expect((await res.json()).error).toMatch(/couldn't be queued/)
        expect(rootWrites()).toEqual(['new-root', 'old-root'])
        expect(maint.setPending).toHaveBeenLastCalledWith('f1', null)
    })
})

describe('update-root-folder', () => {
    it('answers success with a warning when the firm folder cannot be created', async () => {
        db.connector = { ...db.connector, settings: {} }
        setup.firmFolder.mockRejectedValueOnce(
            new Error('Failed to create folder Acme: 403 - ' + JSON.stringify({ error: { message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } }))
        )
        const res = await send({ action: 'update-root-folder', connectionId: 'conn', rootFolderId: 'r2' })
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.warning).toMatch(/^Folder set, but the firm's folders couldn't be created inside it · .*permission/)
    })

    it('warns, rather than succeeding quietly, when the connection needs renewing', async () => {
        drive.token = null
        const body = await (await send({ action: 'update-root-folder', connectionId: 'conn', rootFolderId: 'r2' })).json()
        expect(body.warning).toMatch(/needs renewing/)
    })
})

describe('folder steps and estimates', () => {
    it("answers ensure-folder's missing token with the reconnect reason", async () => {
        drive.token = null
        const res = await send({ action: 'ensure-folder', connectionId: 'conn', name: '_firma' })
        expect(res.status).toBe(502)
        expect((await res.json()).code).toBe('reconnect')
    })

    it('gives no estimate, instead of "1 minute", when the folder cannot be listed', async () => {
        db.connector = { ...db.connector, settings: { rootFolderId: 'old-root' } }
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
        const body = await (await send({ action: 'estimate-migration', connectionId: 'conn' })).json()
        expect(body).toMatchObject({ itemCount: null, estimatedMinutes: null })
        vi.unstubAllGlobals()
    })

    it('marks the estimate as a minimum when the top level holds folders', async () => {
        db.connector = { ...db.connector, settings: { rootFolderId: 'old-root' } }
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ files: [{ id: 'a', mimeType: 'application/vnd.google-apps.folder' }, { id: 'b' }] })))
        )
        const body = await (await send({ action: 'estimate-migration', connectionId: 'conn' })).json()
        expect(body).toMatchObject({ itemCount: 2, atLeast: true })
        vi.unstubAllGlobals()
    })
})
