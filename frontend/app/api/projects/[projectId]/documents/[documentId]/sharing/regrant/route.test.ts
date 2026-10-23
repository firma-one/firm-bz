import { describe, it, expect, vi, beforeEach } from 'vitest'

// Check-first secure open (2026-10-23): a permission that still stands is reused; a missing one is
// granted again — silently for a known Google account, by email for anyone else on Google.

const { st, perm, content } = vi.hoisted(() => {
    const perm = {
        getFilePermission: vi.fn(),
        getFilesMetadata: vi.fn(),
        patchFilePermissionRole: vi.fn(),
        revokePermission: vi.fn(),
        grantFilePermission: vi.fn(),
        listFilePermissions: vi.fn(),
        preInviteGuest: vi.fn(),
        getFileMetadata: vi.fn(),
    }
    const content = { setCopyRestricted: vi.fn() }
    const st = {
        user: { id: 'u1', email: 'sam@client.com', identities: [] as Array<{ provider: string; identity_data: { email: string } }> },
        memberRole: 'eng_admin',
        connectorType: 'GOOGLE_DRIVE' as 'GOOGLE_DRIVE' | 'ONEDRIVE',
        accountEmail: 'deepak@firmaone.com',
        sharingUser: { id: 'su1', connectorPermissionId: 'perm-old', sharingPermissionStatus: 'GRANTED' } as Record<string, unknown> | null,
        updates: [] as unknown[],
    }
    return { st, perm, content }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({
    getFileInfo: async () => ({ id: 'd1', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', documentType: 'FILE' }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.memberRole }),
    getEngagementStatus: async () => 'ACTIVE',
    isEngagementMemberReadOnlyWhenCompleted: () => false,
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => perm,
    getContentAdapter: async () => content,
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn1' }))
vi.mock('@/lib/connectors/adapters/onedrive-permission-adapter', () => ({ GraphSharingPolicyError: class extends Error {} }))
vi.mock('@/lib/watermark-pdf', () => ({ applyDiagonalWatermark: vi.fn() }))
vi.mock('@/lib/document-sharing-access', () => ({ isDescendantOfGrantedFolder: async () => true }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findUnique: async () => ({ id: 'd1', fileName: 'Plan.xlsx', connectorId: 'conn1', settings: {} }), update: vi.fn() },
        engagementDocumentSharingUser: {
            findFirst: async () => st.sharingUser,
            create: async () => ({ id: 'su-new', connectorPermissionId: null, sharingPermissionStatus: 'GRANTED' }),
            update: async (args: unknown) => { st.updates.push(args) },
        },
        connector: { findUnique: async () => ({ type: st.connectorType, settings: { accountEmail: st.accountEmail }, externalAccountId: null }) },
    },
}))

import { POST } from './route'

const post = (qs = '') =>
    POST(
        { nextUrl: new URL(`http://x/api/projects/p1/documents/d1/sharing/regrant${qs}`) } as never,
        { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
    ).then((r) => r.json())

beforeEach(() => {
    Object.values(perm).forEach((fn) => fn.mockReset())
    content.setCopyRestricted.mockReset()
    st.user = { id: 'u1', email: 'sam@client.com', identities: [] }
    st.memberRole = 'eng_admin'
    st.connectorType = 'GOOGLE_DRIVE'
    st.accountEmail = 'deepak@firmaone.com'
    st.sharingUser = { id: 'su1', connectorPermissionId: 'perm-old', sharingPermissionStatus: 'GRANTED' }
    st.updates = []
    perm.getFilesMetadata.mockResolvedValue([{ id: 'ext1', webViewLink: 'https://docs.google.com/spreadsheets/d/ext1/edit' }])
    perm.revokePermission.mockResolvedValue(true)
    perm.grantFilePermission.mockResolvedValue('perm-new')
    perm.listFilePermissions.mockResolvedValue([])
    perm.preInviteGuest.mockResolvedValue({ inviteRedeemUrl: null })
})

describe('POST regrant — Google Drive', () => {
    it('reuses a permission that still stands: no revoke, no grant, no email; opens the link', async () => {
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'editor' })
        const body = await post()
        expect(body).toEqual({ success: true, provider: 'google', documentUrl: 'https://docs.google.com/spreadsheets/d/ext1/edit' })
        expect(perm.revokePermission).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it('adds the account hint only for a known Google account', async () => {
        st.user = { id: 'u1', email: 'sam@gmail.com', identities: [] }
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@gmail.com', role: 'editor' })
        const body = await post()
        expect(body.documentUrl).toBe('https://docs.google.com/spreadsheets/d/ext1/edit?authuser=sam%40gmail.com')
    })

    it('changes the role in place when it changed, instead of sharing again', async () => {
        st.memberRole = 'eng_viewer'
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'editor' })
        perm.patchFilePermissionRole.mockResolvedValue(true)
        const body = await post()
        expect(perm.patchFilePermissionRole).toHaveBeenCalledWith('conn1', 'ext1', 'perm-old', 'viewer')
        expect(content.setCopyRestricted).toHaveBeenCalledWith('conn1', 'ext1', true)
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
        expect(body.documentUrl).toBeTruthy()
    })

    it('a permission that is gone, for a known Google account: shares silently and opens directly', async () => {
        st.user = { id: 'u1', email: 'sam@client.com', identities: [{ provider: 'google', identity_data: { email: 'sam@client.com' } }] }
        perm.getFilePermission.mockResolvedValue(null)
        const body = await post()
        expect(perm.revokePermission).toHaveBeenCalledWith('conn1', 'ext1', 'perm-old')
        expect(perm.grantFilePermission).toHaveBeenCalledTimes(1)
        expect(perm.grantFilePermission.mock.calls[0][4]).toMatchObject({ notify: false })
        expect(body.documentUrl).toContain('authuser=sam%40client.com')
    })

    it('a permission that is gone, for anyone else: shares by email and says so (no link)', async () => {
        perm.getFilePermission.mockResolvedValue(null)
        const body = await post()
        expect(perm.grantFilePermission.mock.calls[0][4]).not.toHaveProperty('notify')
        expect(body).toEqual({ success: true, provider: 'google' })
    })

    it('falls back to the email when Drive refuses the silent share', async () => {
        st.user = { id: 'u1', email: 'sam@gmail.com', identities: [] }
        perm.getFilePermission.mockResolvedValue(null)
        perm.grantFilePermission.mockResolvedValueOnce(null).mockResolvedValueOnce('perm-new')
        const body = await post()
        expect(perm.grantFilePermission).toHaveBeenCalledTimes(2)
        expect(perm.grantFilePermission.mock.calls[1][4]).not.toHaveProperty('notify')
        expect(body).toEqual({ success: true, provider: 'google' })
    })

    it('"Email me a new access link" (?fresh=1) skips the reuse and always emails', async () => {
        st.user = { id: 'u1', email: 'sam@gmail.com', identities: [] }
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@gmail.com', role: 'editor' })
        const body = await post('?fresh=1')
        expect(perm.getFilePermission).not.toHaveBeenCalled()
        expect(perm.revokePermission).toHaveBeenCalled()
        expect(perm.grantFilePermission.mock.calls[0][4]).not.toHaveProperty('notify')
        expect(body).toEqual({ success: true, provider: 'google' })
    })

    it('a revoked sharing row takes the full path, never the reuse', async () => {
        st.sharingUser = { id: 'su1', connectorPermissionId: 'perm-old', sharingPermissionStatus: 'REVOKED' }
        await post()
        expect(perm.getFilePermission).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).toHaveBeenCalled()
    })
})

describe('POST regrant — SharePoint/OneDrive', () => {
    beforeEach(() => {
        st.connectorType = 'ONEDRIVE'
        perm.getFilesMetadata.mockResolvedValue([{ id: 'ext1', webViewLink: 'https://contoso.sharepoint.com/doc' }])
    })

    it('reuses a standing grant for a tenant member: one lookup, no invite, no grant', async () => {
        st.user = { id: 'u1', email: 'sam@firmaone.com', identities: [] }
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@firmaone.com', role: 'editor' })
        const body = await post()
        expect(body).toEqual({ success: true, provider: 'onedrive', documentUrl: 'https://contoso.sharepoint.com/doc' })
        expect(perm.preInviteGuest).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
        expect(perm.revokePermission).not.toHaveBeenCalled()
    })

    it('a guest on a standing grant still gets a fresh redemption link', async () => {
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'editor' })
        perm.preInviteGuest.mockResolvedValue({ inviteRedeemUrl: 'https://login.microsoftonline.com/redeem?x=1' })
        const body = await post()
        expect(body.documentUrl).toBe('https://login.microsoftonline.com/redeem?x=1')
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it('a download-blocked (view-only) grant counts as standing for a viewer', async () => {
        st.memberRole = 'eng_viewer'
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'viewer' })
        await post()
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it('a grant that is gone, for a tenant member: grants again without the guest invite', async () => {
        st.user = { id: 'u1', email: 'sam@firmaone.com', identities: [] }
        perm.getFilePermission.mockResolvedValue(null)
        const body = await post()
        expect(perm.preInviteGuest).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).toHaveBeenCalled()
        expect(body.documentUrl).toBe('https://contoso.sharepoint.com/doc')
    })
})
