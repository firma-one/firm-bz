import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * CN-2: choosing a SharePoint site whose folder can't be made puts the old site back and gives
 * Microsoft's reason. CN-3: folder setup that fails after the site is set is a warning, not silence.
 */

const { db, adapter, setup } = vi.hoisted(() => ({
    db: {
        connector: {
            id: 'conn',
            userId: 'u1',
            settings: { rootFolderId: 'old-root' },
            workspaceRootLocation: 'PERSONAL',
            workspaceRootSharedStorageId: null,
            workspaceRootSharedStorageName: null,
            workspaceRootSharedStorageWebUrl: null,
        } as any,
        updates: [] as any[],
    },
    adapter: { findOrCreateFolder: vi.fn(async (_c: string, _p: string, name: string) => `${name}-id`) },
    setup: { firmFolder: vi.fn(async () => undefined) },
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/connectors/connector-access', () => ({ isFirmAdmin: vi.fn(async () => true) }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({
    OneDriveConnector: { getInstance: () => ({ getAccessToken: vi.fn(async () => 'tok') }) },
}))
vi.mock('@/lib/connectors/adapters/onedrive-adapter', () => ({ createOneDriveAdapter: () => adapter }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn(), setupFirmFolder: setup.firmFolder }))
vi.mock('@/lib/generate-unique-workspace-folder-name', () => ({ generateWorkspaceFolderName: () => '_f_workspace_x' }))
vi.mock('@/lib/connectors/connector-firm', () => ({ findFirmForConnector: vi.fn(async () => ({ id: 'f1' })) }))
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
        firm: { findUnique: vi.fn(async () => null) },
        engagement: { findMany: vi.fn(async () => []) },
    },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'

const select = () =>
    POST(
        new NextRequest(new URL('/api/connectors/onedrive/sites', 'http://localhost'), {
            method: 'POST',
            headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
            body: JSON.stringify({ connectionId: 'conn', siteId: 'site-1', siteName: 'Finance Site' }),
        })
    )

beforeEach(() => {
    vi.clearAllMocks()
    db.updates = []
    adapter.findOrCreateFolder.mockImplementation(async (_c: string, _p: string, name: string) => `${name}-id`)
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
            if (String(url).includes('/drive/root')) return new Response(JSON.stringify({ id: 'drive-root' }))
            if (String(url).includes('/drive/items/')) return new Response(JSON.stringify({ webUrl: 'https://sp/x' }))
            return new Response(JSON.stringify({ id: 'drive-1' }))
        })
    )
})

describe('POST /api/connectors/onedrive/sites', () => {
    it("puts the old site back when the site's folder can't be created, and gives Microsoft's reason", async () => {
        adapter.findOrCreateFolder.mockRejectedValueOnce(
            new Error('Failed to create folder _firma: 403 - ' + JSON.stringify({ error: { code: 'accessDenied', message: 'Access denied' } }))
        )
        const res = await select()
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toMatch(/permission/)
        expect(body.error).toMatch(/Your current folder is unchanged\.$/)
        const last = db.updates[db.updates.length - 1]
        expect(last.data).toMatchObject({ workspaceRootLocation: 'PERSONAL', workspaceRootSharedStorageId: null })
        // The workspace root itself was never repointed.
        expect(db.updates.some((u) => u.data?.settings?.rootFolderId)).toBe(false)
    })

    it("answers the site's refusal before anything is saved", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'accessDenied', message: 'Nope' } }), { status: 403 })))
        const res = await select()
        expect(res.status).toBe(403)
        expect(db.updates).toHaveLength(0)
    })

    it('answers success with a warning when the firm folder fails inside the new site', async () => {
        setup.firmFolder.mockRejectedValueOnce(new Error('Failed to create folder Acme: 507 - ' + JSON.stringify({ error: { code: 'quotaLimitReached' } })))
        const body = await (await select()).json()
        expect(body.success).toBe(true)
        expect(body.warning).toMatch(/^Site set, but the firm's folders couldn't be created inside it · .*out of storage space/)
    })
})
