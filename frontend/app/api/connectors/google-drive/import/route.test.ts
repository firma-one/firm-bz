import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Import from Google Drive keeps what worked and names what didn't, with Drive's reason; nothing
// imported is an error. Every dependency is stubbed: nothing reaches a database or a drive.

const { drive, indexBatch } = vi.hoisted(() => ({
    drive: { getAccessToken: vi.fn(async () => 'conn-token'), recursiveCopy: vi.fn() },
    indexBatch: vi.fn(async () => {}),
}))

vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }) }))
vi.mock('@/lib/connectors/connector-access', () => ({ getManageableConnector: vi.fn(async () => ({ id: 'conn1' })) }))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive }))
vi.mock('@/lib/services/indexing-interceptor', () => ({ IndexingInterceptor: { indexBatch } }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDocumentCap: vi.fn() }))
vi.mock('@/lib/permission-helpers', () => ({ canEditProject: vi.fn(async () => true) }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: vi.fn(async () => null) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: vi.fn(async () => ({ firmId: 'f1', engagementId: 'e1', engagement: { clientId: 'c1', client: { firmId: 'f1' } } })),
            findMany: vi.fn(async () => []),
        },
        connector: { findUnique: vi.fn(async () => ({ id: 'conn1', workspaceRootLocation: 'SHARED', settings: {} })) },
    },
}))

import { POST } from './route'
import { getManageableConnector } from '@/lib/connectors/connector-access'

const run = (body: Record<string, unknown>) => POST(new NextRequest(new URL('/api/connectors/google-drive/import', 'http://localhost'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: 'conn1', parentId: 'P', ...body }),
}))

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response

beforeEach(() => {
    vi.clearAllMocks()
    // a.pdf and b.pdf read fine; locked.pdf is refused.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('/files/locked')) return json({ error: { code: 403, message: 'The user does not have sufficient permissions for this file.', errors: [{ reason: 'insufficientFilePermissions' }] } }, 403)
        const id = url.split('/files/')[1].split('?')[0]
        return json({ id, name: `${id}.pdf`, mimeType: 'application/pdf', parents: ['elsewhere'] })
    }))
    drive.recursiveCopy.mockImplementation(async (id: string) => ({
        copied: [{ id: `copy-${id}`, name: `${id}.pdf`, originalId: id, isFolder: false }], failed: [], filesTotal: 1, filesCopied: 1,
    }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('import from Google Drive', () => {
    it('answers X of Y and names what was not imported, with why', async () => {
        const res = await run({ fileIds: ['a', 'locked', 'b'], names: { locked: 'report.pdf' } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ success: true, filesImported: 2, filesTotal: 3 })
        expect(body.failed).toEqual([{ name: 'report.pdf', reason: expect.stringContaining("doesn't have permission") }])
        expect(indexBatch).toHaveBeenCalledTimes(1)
    })

    it('a folder that only partly copied counts its files, and what it could not copy', async () => {
        drive.recursiveCopy.mockResolvedValueOnce({
            copied: [{ id: 'nf', name: 'Reports', originalId: 'a', isFolder: true }, { id: 'n1', name: 'Q3.pdf', originalId: 'x', isFolder: false }],
            failed: [{ name: 'Budget.xlsx', reason: 'Google Drive has this locked.' }],
            filesTotal: 2, filesCopied: 1,
        })
        const body = await (await run({ fileIds: ['a'] })).json()
        expect(body).toMatchObject({ filesImported: 1, filesTotal: 2, failed: [{ name: 'Budget.xlsx' }] })
    })

    it('nothing imported is an error, not "Imported 0 files"', async () => {
        const res = await run({ fileIds: ['locked'], names: { locked: 'report.pdf' } })
        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.code).toBe('nothing_imported')
        expect(body.error).toMatch(/^No files were imported\. report\.pdf · /)
        expect(indexBatch).not.toHaveBeenCalled()
    })

    it('says to reconnect, not "Missing required params", when the connection is missing', async () => {
        const res = await run({ connectionId: undefined, fileIds: ['a'] })
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('reconnect')
    })

    it('says who can import when the caller did not connect this Drive', async () => {
        vi.mocked(getManageableConnector).mockResolvedValueOnce(null as never)
        const res = await run({ fileIds: ['a'] })
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('Only the person who connected this Google Drive can import from it.')
    })
})
