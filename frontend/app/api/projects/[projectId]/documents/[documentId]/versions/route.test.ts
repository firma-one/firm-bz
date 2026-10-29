import { describe, it, expect, vi, beforeEach } from 'vitest'

// The version list is gated by engagement membership, not by who connected the storage
// (2026-10-28): the firm's stored token reads the provider for any internal member.

const { st, drive, adapter } = vi.hoisted(() => {
    const drive = { getRevisions: vi.fn() }
    const adapter = { listVersions: vi.fn() as ReturnType<typeof vi.fn> | undefined }
    const st = {
        memberRole: 'eng_member' as string | null,
        connectorType: 'GOOGLE_DRIVE' as 'GOOGLE_DRIVE' | 'ONEDRIVE',
        file: { id: 'd1', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', isFolder: false, documentType: 'FILE' } as Record<string, unknown> | null,
    }
    return { st, drive, adapter }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => st.file }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => (st.memberRole ? { role: st.memberRole } : null),
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn1' }))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive }))
vi.mock('@/lib/connectors/registry', () => ({ getContentAdapter: async () => adapter }))
vi.mock('@/lib/prisma', () => ({
    prisma: { connector: { findUnique: async () => ({ type: st.connectorType }) } },
}))

import { GET } from './route'

const get = () =>
    GET({} as never, { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) })

beforeEach(() => {
    st.memberRole = 'eng_member'
    st.connectorType = 'GOOGLE_DRIVE'
    st.file = { id: 'd1', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', isFolder: false, documentType: 'FILE' }
    drive.getRevisions.mockReset()
    drive.getRevisions.mockResolvedValue([{ id: 'r1', modifiedTime: '2026-10-01T00:00:00Z' }])
    adapter.listVersions = vi.fn().mockResolvedValue([{ id: '1.0', mimeType: '', modifiedTime: '2026-10-02T00:00:00Z' }])
})

describe('GET document versions', () => {
    it('lists versions for an internal member who did not connect the storage', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ revisions: [{ id: 'r1', modifiedTime: '2026-10-01T00:00:00Z' }] })
        // The provider id comes from the document row, never from the caller.
        expect(drive.getRevisions).toHaveBeenCalledWith('conn1', 'ext1')
    })

    it('refuses a non-member', async () => {
        st.memberRole = null
        expect((await get()).status).toBe(404)
        expect(drive.getRevisions).not.toHaveBeenCalled()
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('refuses %s', async (role) => {
        st.memberRole = role
        expect((await get()).status).toBe(403)
        expect(drive.getRevisions).not.toHaveBeenCalled()
    })

    it('refuses a document outside this engagement', async () => {
        st.file = null
        expect((await get()).status).toBe(404)
    })

    it.each([
        ['a folder', { isFolder: true }],
        ['a link', { documentType: 'LINK' }],
    ])('refuses %s', async (_label, patch) => {
        st.file = { ...st.file!, ...patch }
        expect((await get()).status).toBe(400)
        expect(drive.getRevisions).not.toHaveBeenCalled()
    })

    it("lists OneDrive's versions through the content adapter", async () => {
        st.connectorType = 'ONEDRIVE'
        const res = await get()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ revisions: [{ id: '1.0', mimeType: '', modifiedTime: '2026-10-02T00:00:00Z' }] })
        expect(adapter.listVersions).toHaveBeenCalledWith('conn1', 'ext1')
        expect(drive.getRevisions).not.toHaveBeenCalled()
    })

    it('says a storage with no version list is unsupported rather than reporting no versions', async () => {
        st.connectorType = 'ONEDRIVE'
        adapter.listVersions = undefined
        const res = await get()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ revisions: [], unsupported: true })
    })
})
