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
    const content = { setCopyRestricted: vi.fn(), getRenderableContent: vi.fn(), createFile: vi.fn(), overwriteFileContent: vi.fn() }
    const st = {
        user: { id: 'u1', email: 'sam@client.com', identities: [] as Array<{ provider: string; identity_data: { email: string } }> },
        memberRole: 'eng_admin',
        engagementStatus: 'ACTIVE',
        hidden: false,
        connectorType: 'GOOGLE_DRIVE' as 'GOOGLE_DRIVE' | 'ONEDRIVE',
        accountEmail: 'deepak@firmaone.com',
        sharingUser: { id: 'su1', connectorPermissionId: 'perm-old', sharingPermissionStatus: 'GRANTED' } as Record<string, unknown> | null,
        updates: [] as unknown[],
        settings: {} as Record<string, unknown>,
    }
    return { st, perm, content }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({
    getFileInfo: async () => ({ id: 'd1', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', documentType: 'FILE' }),
}))
vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    // The read-only rule itself is the real one: what a completed engagement grants is under test here.
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    requireEngagementMember: async () => ({ role: st.memberRole }),
    getEngagementStatus: async () => st.engagementStatus,
    isHiddenFromMember: async () => st.hidden,
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => perm,
    getContentAdapter: async () => content,
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn1' }))
vi.mock('@/lib/connectors/adapters/onedrive-permission-adapter', () => ({ GraphSharingPolicyError: class extends Error {} }))
vi.mock('@/lib/watermark-pdf', () => ({ applyDiagonalWatermark: vi.fn(async () => { throw new Error('font missing') }) }))
vi.mock('@/lib/document-sharing-access', () => ({ isDescendantOfGrantedFolder: async () => true }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findUnique: async () => ({ id: 'd1', fileName: 'Plan.xlsx', connectorId: 'conn1', settings: st.settings }), update: vi.fn() },
        firm: { findUnique: async () => ({ name: 'Acme Advisors' }) },
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
    Object.values(content).forEach((fn) => fn.mockReset())
    st.settings = {}
    st.user = { id: 'u1', email: 'sam@client.com', identities: [] }
    st.memberRole = 'eng_admin'
    st.engagementStatus = 'ACTIVE'
    st.hidden = false
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

describe('POST regrant of a private file', () => {
    it('grants a client nothing, whatever rows they hold', async () => {
        st.memberRole = 'eng_ext_collaborator'
        st.hidden = true
        const res = await POST(
            { nextUrl: new URL('http://x/api/projects/p1/documents/d1/sharing/regrant') } as never,
            { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
        )
        expect(res.status).toBe(403)
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
        expect(perm.getFilePermission).not.toHaveBeenCalled()
    })
})

describe('POST regrant — Google Drive', () => {
    it('reuses a permission that still stands: no revoke, no grant, no email; opens the link', async () => {
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'editor' })
        const body = await post()
        expect(body).toEqual({ success: true, provider: 'google', emailed: false, documentUrl: 'https://docs.google.com/spreadsheets/d/ext1/edit' })
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
        expect(body).toEqual({ success: true, provider: 'google', emailed: true })
    })

    it('falls back to the email when Drive refuses the silent share', async () => {
        st.user = { id: 'u1', email: 'sam@gmail.com', identities: [] }
        perm.getFilePermission.mockResolvedValue(null)
        perm.grantFilePermission.mockResolvedValueOnce(null).mockResolvedValueOnce('perm-new')
        const body = await post()
        expect(perm.grantFilePermission).toHaveBeenCalledTimes(2)
        expect(perm.grantFilePermission.mock.calls[1][4]).not.toHaveProperty('notify')
        expect(body).toEqual({ success: true, provider: 'google', emailed: true })
    })

    it('"Email me a new access link" (?fresh=1) skips the reuse and always emails', async () => {
        st.user = { id: 'u1', email: 'sam@gmail.com', identities: [] }
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@gmail.com', role: 'editor' })
        const body = await post('?fresh=1')
        expect(perm.getFilePermission).not.toHaveBeenCalled()
        expect(perm.revokePermission).toHaveBeenCalled()
        expect(perm.grantFilePermission.mock.calls[0][4]).not.toHaveProperty('notify')
        expect(body).toEqual({ success: true, provider: 'google', emailed: true })
    })

    it('a revoked sharing row takes the full path, never the reuse', async () => {
        st.sharingUser = { id: 'su1', connectorPermissionId: 'perm-old', sharingPermissionStatus: 'REVOKED' }
        await post()
        expect(perm.getFilePermission).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).toHaveBeenCalled()
    })
})

describe('POST regrant once the engagement is completed', () => {
    beforeEach(() => { st.engagementStatus = 'COMPLETED' })

    it.each(['eng_admin', 'eng_member', 'eng_ext_collaborator'])('drops the edit permission %s holds to view', async (role) => {
        st.memberRole = role
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'editor' })
        perm.patchFilePermissionRole.mockResolvedValue(true)
        await post()
        expect(perm.patchFilePermissionRole).toHaveBeenCalledWith('conn1', 'ext1', 'perm-old', 'viewer')
    })

    it('shares as view only with a Limited Access contributor who has no permission yet', async () => {
        st.memberRole = 'eng_ext_collaborator'
        perm.getFilePermission.mockResolvedValue(null)
        await post()
        expect(perm.grantFilePermission.mock.calls[0][3]).toBe('viewer')
    })

    it('gives edit again once it is reopened', async () => {
        st.engagementStatus = 'ACTIVE'
        st.memberRole = 'eng_ext_collaborator'
        perm.getFilePermission.mockResolvedValue({ id: 'perm-old', email: 'sam@client.com', role: 'viewer' })
        perm.patchFilePermissionRole.mockResolvedValue(true)
        await post()
        expect(perm.patchFilePermissionRole).toHaveBeenCalledWith('conn1', 'ext1', 'perm-old', 'editor')
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
        expect(body).toEqual({ success: true, provider: 'onedrive', emailed: false, documentUrl: 'https://contoso.sharepoint.com/doc' })
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

import { StorageFailure } from '@/lib/connectors/storage-failure'

const postRes = (qs = '') =>
    POST(
        { nextUrl: new URL(`http://x/api/projects/p1/documents/d1/sharing/regrant${qs}`) } as never,
        { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
    )

const grantedRows = () => st.updates.filter((u: any) => u.data?.sharingPermissionStatus === 'GRANTED')

// Decision 3 (AC-9, AC-10): what the firm asked for is never dropped to let a client in, and nobody is
// told an email was sent when none was.
describe('POST regrant — a client, when storage refuses', () => {
    beforeEach(() => { perm.getFilePermission.mockResolvedValue(null) })

    it('refuses the open when the PDF copy the firm shares only can\'t be made, never handing over the original', async () => {
        st.memberRole = 'eng_viewer'
        st.settings = { share: { guest: { enabled: true, options: { sharePdfOnly: true } } } }
        content.getRenderableContent.mockRejectedValue(new Error('export failed'))
        const res = await postRes()
        expect(res.status).toBe(502)
        expect(await res.json()).toEqual({ error: "This document couldn't be prepared. Try again in a moment.", code: 'pdf_unavailable' })
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it('refuses the open when the watermark the firm asked for fails', async () => {
        st.memberRole = 'eng_viewer'
        st.settings = { share: { guest: { enabled: true, options: { sharePdfOnly: true, addWatermark: true } } } }
        content.getRenderableContent.mockResolvedValue({ stream: Buffer.from('%PDF') })
        const res = await postRes()
        expect((await res.json()).code).toBe('pdf_unavailable')
        expect(content.createFile).not.toHaveBeenCalled()
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it.each(['eng_viewer', 'eng_ext_collaborator'])('refuses the open (%s) when storage won\'t block downloading', async (role) => {
        st.memberRole = role
        content.setCopyRestricted.mockRejectedValue(new Error('403'))
        const res = await postRes()
        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.code).toBe('download_block_failed')
        expect(body.error).toBe("Couldn't open this document safely · Google Drive wouldn't block downloading it. Try again in a moment.")
        expect(perm.grantFilePermission).not.toHaveBeenCalled()
    })

    it('refuses the open when the grant is refused, naming who, and grants nothing in Firma', async () => {
        st.memberRole = 'eng_ext_collaborator'
        perm.grantFilePermission.mockResolvedValue(null)
        const res = await postRes()
        expect(res.status).toBe(502)
        expect(await res.json()).toEqual({
            error: "Couldn't open this document · Google Drive refused access for sam@client.com. Try again in a moment, or ask the engagement's Lead.",
            code: 'grant_refused',
        })
        expect(grantedRows()).toEqual([])
    })

    it("carries storage's own reason when it gives one", async () => {
        st.memberRole = 'eng_viewer'
        perm.grantFilePermission.mockRejectedValue(new StorageFailure('reconnect', 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.'))
        const res = await postRes()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Couldn't open this document · Google Drive refused access for sam@client.com. The connection to Google Drive needs renewing. Reconnect the storage, then try again.")
    })
})

describe('POST regrant — a firm member, when storage refuses the grant', () => {
    beforeEach(() => { perm.getFilePermission.mockResolvedValue(null) })

    it('opens the file with their own folder access, and says nothing of an email', async () => {
        perm.grantFilePermission.mockResolvedValue(null)
        const res = await postRes()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, provider: 'google', emailed: false, documentUrl: 'https://docs.google.com/spreadsheets/d/ext1/edit' })
        expect(grantedRows()).toHaveLength(1)
    })

    it("says so on OneDrive when there's no link to open either", async () => {
        st.connectorType = 'ONEDRIVE'
        st.user = { id: 'u1', email: 'sam@firmaone.com', identities: [] }
        perm.getFilesMetadata.mockResolvedValue([])
        perm.grantFilePermission.mockResolvedValue(null)
        const res = await postRes()
        expect(res.status).toBe(502)
        expect((await res.json()).code).toBe('grant_refused')
    })
})

describe('POST regrant — the words of a refusal', () => {
    it("says a private file isn't shared, not that access was revoked", async () => {
        st.memberRole = 'eng_viewer'
        st.hidden = true
        const res = await postRes()
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "This document isn't shared with you. Ask the engagement's Lead if you need it.", code: 'not_shared' })
    })

    it('answers a plain sentence for an unexpected failure', async () => {
        perm.getFilePermission.mockRejectedValue(new Error('socket hang up'))
        const res = await postRes()
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: "Couldn't open this document. Something went wrong on our side. Try again.", code: 'internal' })
    })

    it('OneDrive never emails: a grant with no link to open is said, not "check your email"', async () => {
        st.connectorType = 'ONEDRIVE'
        st.user = { id: 'u1', email: 'sam@firmaone.com', identities: [] }
        perm.getFilePermission.mockResolvedValue(null)
        perm.getFilesMetadata.mockResolvedValue([])
        const res = await postRes()
        expect(res.status).toBe(502)
        expect((await res.json()).code).toBe('no_link')
    })
})
