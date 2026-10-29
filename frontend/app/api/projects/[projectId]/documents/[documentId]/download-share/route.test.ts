import { describe, it, expect, vi, beforeEach } from 'vitest'

// Earlier versions download through this route, not the old firm-wide /api/documents/download
// (2026-10-28): membership-checked, storage taken from the document, no token in the URL.

const { st, drive, content } = vi.hoisted(() => {
    const drive = { downloadFile: vi.fn() }
    const content = { getRenderableContent: vi.fn(), getVersionContent: vi.fn() as ReturnType<typeof vi.fn> | undefined }
    const st = {
        memberRole: 'eng_admin' as string | null,
        connectorType: 'GOOGLE_DRIVE' as 'GOOGLE_DRIVE' | 'ONEDRIVE',
    }
    return { st, drive, content }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({
    getFileInfo: async () => ({ id: 'd1', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', documentType: 'FILE' }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => (st.memberRole ? { role: st.memberRole } : null),
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({}),
    getContentAdapter: async () => content,
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn1' }))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive }))
vi.mock('@/lib/watermark-pdf', () => ({ applyDiagonalWatermark: vi.fn() }))
vi.mock('@/lib/audit', () => {
    const chain: Record<string, unknown> = {}
    for (const k of ['scope', 'firm', 'client', 'engagement', 'document', 'actor', 'meta']) chain[k] = () => chain
    chain.fireAndForget = () => {}
    return { audit: () => chain, AUDIT_EVENT: { DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED', DOCUMENT_OPENED: 'DOCUMENT_OPENED' }, AUDIT_SCOPE: { DOCUMENT: 'DOCUMENT' } }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async () => ({ id: 'd1', clientId: 'c1', connectorId: 'conn1', fileName: 'Plan.xlsx', settings: {}, status: 'PROCESSED' }),
            update: vi.fn(),
        },
        connector: { findUnique: async () => ({ type: st.connectorType }) },
    },
}))

import { GET } from './route'

const get = (qs = '') =>
    GET(
        { nextUrl: new URL(`http://x/api/projects/p1/documents/d1/download-share${qs}`) } as never,
        { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
    )

beforeEach(() => {
    st.memberRole = 'eng_admin'
    st.connectorType = 'GOOGLE_DRIVE'
    drive.downloadFile.mockReset()
    content.getRenderableContent.mockReset()
    drive.downloadFile.mockResolvedValue({ stream: new ReadableStream(), mimeType: 'application/pdf', size: '10', name: 'Plan v2.pdf' })
    content.getRenderableContent.mockResolvedValue({ stream: Buffer.from('x'), mimeType: 'application/pdf', size: '1', fileName: 'Plan.xlsx' })
    content.getVersionContent = vi.fn().mockResolvedValue({ stream: Buffer.from('old'), mimeType: 'application/pdf', size: '3', fileName: 'Plan.xlsx' })
})

describe('GET download-share ?revisionId', () => {
    it('serves the earlier version from Drive for an internal member', async () => {
        const res = await get('?revisionId=rev42')
        expect(res.status).toBe(200)
        expect(drive.downloadFile).toHaveBeenCalledWith('conn1', 'ext1', 'rev42')
        expect(res.headers.get('Content-Disposition')).toContain('attachment')
        expect(content.getRenderableContent).not.toHaveBeenCalled()
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('refuses an earlier version to %s', async (role) => {
        st.memberRole = role
        const res = await get('?revisionId=rev42')
        expect(res.status).toBe(403)
        expect(drive.downloadFile).not.toHaveBeenCalled()
    })

    it('refuses a non-member', async () => {
        st.memberRole = null
        const res = await get('?revisionId=rev42')
        expect(res.status).toBe(404)
        expect(drive.downloadFile).not.toHaveBeenCalled()
    })

    it("serves an earlier OneDrive version through the content adapter", async () => {
        st.connectorType = 'ONEDRIVE'
        const res = await get('?revisionId=2.0')
        expect(res.status).toBe(200)
        expect(content.getVersionContent).toHaveBeenCalledWith('conn1', 'ext1', '2.0')
        expect(drive.downloadFile).not.toHaveBeenCalled()
        expect(content.getRenderableContent).not.toHaveBeenCalled()
    })

    it('says a storage with no versions cannot serve one, instead of serving the current file', async () => {
        st.connectorType = 'ONEDRIVE'
        content.getVersionContent = undefined
        const res = await get('?revisionId=2.0')
        expect(res.status).toBe(400)
        expect(content.getRenderableContent).not.toHaveBeenCalled()
    })

    it('rejects a version id that could change the provider URL path', async () => {
        const res = await get(`?revisionId=${encodeURIComponent('../files/other')}`)
        expect(res.status).toBe(400)
        expect(drive.downloadFile).not.toHaveBeenCalled()
    })

    it('leaves the plain download unchanged', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect(drive.downloadFile).not.toHaveBeenCalled()
        expect(content.getRenderableContent).toHaveBeenCalledWith('conn1', 'ext1', 'native')
    })
})
