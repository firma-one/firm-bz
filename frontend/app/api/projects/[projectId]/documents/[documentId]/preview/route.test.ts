import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A failed preview says why in the storage's terms, and never as raw JSON in a frame: a request
// from an iframe gets the "Preview not available" card, a fetch gets { error, code }.

const { adapter } = vi.hoisted(() => ({ adapter: { getPreviewableContent: vi.fn() } }))

vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: vi.fn(async () => ({ id: 'd1', externalId: 'X1', organizationId: 'f1', connectorId: 'conn1', fileName: 'Plan.pdf', documentType: 'FILE' })) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: vi.fn(async () => ({ clientId: 'c1' })) },
        connector: { findFirst: vi.fn(async () => ({ id: 'conn1', type: 'ONEDRIVE' })) },
    },
}))
vi.mock('@/lib/engagement-access', () => ({ requireEngagementMember: vi.fn(async () => ({ role: 'eng_admin' })), isHiddenFromMember: vi.fn(async () => false) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: vi.fn(async () => 'conn1') }))
vi.mock('@/lib/connectors/registry', () => ({ getContentAdapter: vi.fn(async () => adapter) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    audit: () => { const b: any = new Proxy(() => {}, { get: (_t, k) => (k === 'then' ? undefined : () => b) }); return b },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))

import { GET } from './route'
import { ConnectorContentError } from '@/lib/connectors/types'
import { storageFailure } from '@/lib/connectors/storage-failure'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'

const get = (dest?: string) => GET(
    new NextRequest(new URL('/api/projects/e1/documents/d1/preview', 'http://localhost'), { headers: dest ? { 'sec-fetch-dest': dest } : {} }),
    { params: Promise.resolve({ projectId: 'e1', documentId: 'd1' }) },
)

beforeEach(() => { vi.clearAllMocks() })

describe('preview failures', () => {
    it("a file gone from OneDrive answers the storage's words to a fetch", async () => {
        adapter.getPreviewableContent.mockRejectedValueOnce(new ConnectorContentError('not_found', 'File X1 not found'))
        const res = await get()
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: storageFailure('not_found', 'OneDrive').message, code: 'not_found' })
    })

    it('a frame gets the Preview not available card with Reload, never raw JSON', async () => {
        adapter.getPreviewableContent.mockRejectedValueOnce(storageFailure('locked', 'OneDrive'))
        const res = await get('iframe')
        expect(res.status).toBe(409)
        expect(res.headers.get('content-type')).toContain('text/html')
        const html = await res.text()
        expect(html).toContain('Preview not available')
        expect(html).toContain('OneDrive has this locked')
        expect(html).toContain('Reload')
        expect(html).not.toContain('{"error"')
    })

    it('a connection that needs renewing says so', async () => {
        adapter.getPreviewableContent.mockRejectedValueOnce(new Error('Could not get access token'))
        const res = await get()
        expect(res.status).toBe(502)
        expect((await res.json()).code).toBe('reconnect')
    })

    it('anything else from the storage is said without its raw answer', async () => {
        adapter.getPreviewableContent.mockRejectedValueOnce(new Error('Graph 500 {"error":{"code":"generalException"}}'))
        const res = await get()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Couldn't get this file from OneDrive. Try again in a moment.")
    })

    it('no storage for the client says what to do, not "No content adapter available"', async () => {
        vi.mocked(resolveEngagementConnectorId).mockResolvedValueOnce(null)
        const res = await get()
        expect(res.status).toBe(404)
        expect((await res.json()).error).toMatch(/^No storage is connected to this client/)
    })
})
