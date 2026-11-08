import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Removing a member, lowering a role, deleting an engagement or a client, and removing a firm member
 * each take back the storage access they leave, and answer with a `warning` naming what storage still
 * allows and why: the toast is the only place the person hears it. Their refusals are results, not
 * throws (a thrown reason never reaches the browser in a production build).
 */

const { db, revoke, folders, engagementAccess, sent } = vi.hoisted(() => {
    const fn = <T,>(v: T) => vi.fn(async (..._args: any[]) => v)
    const db = {
        engagement: { findFirst: fn<any>(null), findMany: fn<any[]>([]), findUnique: fn<any>(null), update: fn<any>({}) },
        engagementMember: { findUnique: fn<any>(null), findMany: fn<any[]>([]), findFirst: fn<any>(null), update: fn<any>({}), delete: fn<any>({}), deleteMany: fn<any>({}), count: fn(0) },
        engagementInvitation: { updateMany: fn<any>({}), deleteMany: fn<any>({}) },
        engagementDocumentSharingUser: { findMany: fn<any[]>([]) },
        filePersonaGrant: { deleteMany: fn<any>({}) },
        persona: { findUnique: fn<any>(null) },
        firmMember: { findFirst: fn<any>(null), findUnique: fn<any>(null), deleteMany: fn<any>({}), delete: fn<any>({}), count: fn(2) },
        firmInvitation: { updateMany: fn<any>({}) },
        firm: { findUnique: fn<any>(null) },
        client: { delete: fn<any>({}) },
        $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(db)),
    }
    return {
        db,
        revoke: { revokeSharePermissions: vi.fn(), markSharesRevoked: vi.fn(async () => {}) },
        folders: { revokeMemberFolderAccess: vi.fn() },
        engagementAccess: { takeBackEngagementAccess: vi.fn() },
        sent: { value: true },
    }
})

const chain: unknown = new Proxy(() => chain, { get: () => () => chain })

vi.mock('@/lib/prisma', () => ({ prisma: db, basePrisma: db }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-lead' } }, error: null }) } }) }))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: 'sam@firm.test', user_metadata: {} } } }) } } }),
}))
vi.mock('@/lib/permission-helpers', () => ({
    canManageProject: vi.fn(async () => true),
    canViewProjectSettings: vi.fn(async () => true),
    canManageOrganization: vi.fn(async () => true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: () => chain, AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }), AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async () => sent.value) }))
vi.mock('@/lib/permissions/invalidate-user-settings', () => ({ invalidateUserSettingsPlus: vi.fn(), invalidateUsersSettingsPlus: vi.fn() }))
vi.mock('@/lib/connectors/revoke-share-permissions', () => ({ ...revoke, SHARE_TO_REVOKE_SELECT: { id: true, connectorPermissionId: true, document: { select: {} } } }))
vi.mock('@/lib/connectors/firm-folder-access', () => ({ ...folders, ...engagementAccess }))
vi.mock('@/lib/storage-access-notice', async (original) => ({
    ...(await original<typeof import('@/lib/storage-access-notice')>()),
    storageProviderName: async () => 'Google Drive',
}))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ isAgentUser: () => false, ensureFirmAgentUser: vi.fn() }))
vi.mock('@/lib/supabase-user-helpers', () => ({ getAvatarUrlFromSupabaseUser: () => null }))
vi.mock('@/lib/reminders/reminder-service', () => ({ removeRemindersByEntity: vi.fn(), upsertFollowUpReminder: vi.fn() }))
vi.mock('@/lib/connectors/registry', () => ({ getStorageAdapter: vi.fn(), getPermissionAdapter: vi.fn() }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveClientConnector: vi.fn(), resolveEngagementConnectorId: vi.fn() }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn(), setupFirmFolder: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates/invite', () => ({ renderInviteEmail: () => ({ subject: 's', html: 'h' }) }))
vi.mock('@/lib/actions/account-provisioning', () => ({ maybeProvisionInviteeAccount: vi.fn() }))
vi.mock('@/lib/auth/sessions', () => ({ endUserSessions: vi.fn(async () => {}) }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinClientCap: vi.fn(), assertWithinClientContactCap: vi.fn() }))

import { removeMember, updateMemberPersona } from './members'
import { deleteProject } from './project'
import { deleteClient } from './client'
import { removeFirmMember } from './firm-members'
import { storageFailure } from '@/lib/connectors/storage-failure'

const MEMBER = {
    id: 'm1', userId: 'sam', role: 'eng_admin', engagementId: 'e1',
    engagement: { id: 'e1', connectorRootFolderId: 'root', client: { id: 'c1', firmId: 'f1' } },
}
const share = (id: string, fileName: string) => ({ id, connectorPermissionId: `perm-${id}`, document: { externalId: `ext-${id}`, connectorId: null, fileName } })
const outcome = (failed: string[] = [], reasons: Record<string, string> = {}) => ({ revoked: 0, failed, unreachable: 0, reasons })
const nothingLeft = { files: [], folderAccess: [], foldersUnchecked: false }

beforeEach(() => {
    vi.clearAllMocks()
    sent.value = true
    db.engagement.findFirst.mockResolvedValue({ id: 'e1', clientId: 'c1', firmId: 'f1', connectorRootFolderId: 'root', client: { firmId: 'f1' }, firm: { group: { slug: 'g' } } })
    db.engagementMember.findUnique.mockResolvedValue(MEMBER)
    db.engagementDocumentSharingUser.findMany.mockResolvedValue([])
    revoke.revokeSharePermissions.mockResolvedValue(outcome())
    folders.revokeMemberFolderAccess.mockImplementation(async (_e: string, _m: unknown, names = ['General', 'Confidential', 'Staging']) => ({ revoked: names, failures: [] }))
    engagementAccess.takeBackEngagementAccess.mockResolvedValue(nothingLeft)
})

describe('removing a member', () => {
    it('takes back their file permissions through the shared helper, and their folder grants, before removing them', async () => {
        db.engagementDocumentSharingUser.findMany.mockResolvedValue([share('s1', 'Budget.xlsx')])
        const order: string[] = []
        revoke.revokeSharePermissions.mockImplementation(async () => { order.push('files'); return outcome() })
        folders.revokeMemberFolderAccess.mockImplementation(async () => { order.push('folders'); return { revoked: [], failures: [] } })
        db.engagementMember.delete.mockImplementation(async () => { order.push('delete'); return {} })

        expect(await removeMember('m1')).toEqual({ ok: true, data: undefined })
        expect(revoke.revokeSharePermissions).toHaveBeenCalledWith('e1', [share('s1', 'Budget.xlsx')])
        // Any row still holding an id, whatever its status: a revoked one with an id didn't finish.
        expect(db.engagementDocumentSharingUser.findMany.mock.calls[0][0].where).toEqual({ engagementId: 'e1', userId: 'sam', connectorPermissionId: { not: null } })
        expect(folders.revokeMemberFolderAccess).toHaveBeenCalledWith('e1', { userId: 'sam', email: 'sam@firm.test' })
        expect(order).toEqual(['files', 'folders', 'delete'])
    })

    it('tries refused ones again, then says what storage still gives them, and why', async () => {
        db.engagementDocumentSharingUser.findMany.mockResolvedValue([share('s1', 'Budget.xlsx')])
        const refusal = storageFailure('reconnect', 'Google Drive')
        revoke.revokeSharePermissions.mockResolvedValue(outcome(['s1'], { s1: refusal.message }))
        folders.revokeMemberFolderAccess.mockResolvedValue({
            revoked: [], failures: [{ userId: 'sam', email: 'sam@firm.test', folder: 'General', folderId: 'gen', reason: refusal.message }],
        })

        const result = await removeMember('m1')
        expect(revoke.revokeSharePermissions).toHaveBeenCalledTimes(2)
        expect(folders.revokeMemberFolderAccess).toHaveBeenCalledTimes(2)
        expect(folders.revokeMemberFolderAccess.mock.calls[1][2]).toEqual(['General'])
        expect(result).toEqual({
            ok: true,
            data: undefined,
            warning: expect.stringMatching(/^Removed in \S+, but Google Drive still gives them access to General and Budget\.xlsx · The connection to Google Drive needs renewing/),
        })
        // Still removed in Firma.
        expect(db.engagementMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
    })

    it('answers why, as a result, when the member is gone already', async () => {
        db.engagementMember.findUnique.mockResolvedValue(null)
        expect(await removeMember('m1')).toEqual({ ok: false, error: 'This person is no longer on the engagement. Refresh the list.', code: 'not_found' })
    })
})

describe('lowering a role', () => {
    beforeEach(() => db.persona.findUnique.mockResolvedValue({ id: 'p-member', slug: 'eng_member' }))

    it('Lead to Contributor · Full Access takes back Confidential and Staging at once', async () => {
        expect(await updateMemberPersona('m1', 'p-member')).toEqual({ ok: true, data: undefined })
        expect(folders.revokeMemberFolderAccess).toHaveBeenCalledWith('e1', { userId: 'sam', email: 'sam@firm.test' }, ['Confidential', 'Staging'])
    })

    it('Lead to Reviewer takes back every folder grant', async () => {
        db.persona.findUnique.mockResolvedValue({ id: 'p-viewer', slug: 'eng_viewer' })
        await updateMemberPersona('m1', 'p-viewer')
        expect(folders.revokeMemberFolderAccess).toHaveBeenCalledWith('e1', expect.anything(), ['General', 'Confidential', 'Staging'])
    })

    it('raising a role takes nothing back', async () => {
        db.engagementMember.findUnique.mockResolvedValue({ ...MEMBER, role: 'eng_member' })
        db.persona.findUnique.mockResolvedValue({ id: 'p-admin', slug: 'eng_admin' })
        await updateMemberPersona('m1', 'p-admin')
        expect(folders.revokeMemberFolderAccess).not.toHaveBeenCalled()
    })

    it('says which folder storage still shares, and why', async () => {
        const refusal = storageFailure('no_permission', 'Google Drive')
        folders.revokeMemberFolderAccess.mockResolvedValue({ revoked: ['Staging'], failures: [{ userId: 'sam', email: 'sam@firm.test', folder: 'Confidential', folderId: 'c', reason: refusal.message }] })
        const result = await updateMemberPersona('m1', 'p-member')
        expect(result).toMatchObject({ ok: true, warning: expect.stringContaining(`Google Drive still gives them access to Confidential · ${refusal.message}`) })
    })

    it("says so when the follow-up job couldn't be started", async () => {
        sent.value = false
        const result = await updateMemberPersona('m1', 'p-member')
        expect(result).toMatchObject({ ok: true, warning: expect.stringContaining("didn't start") })
    })
})

describe('deleting an engagement', () => {
    it('takes back its storage access before the rows that record it go', async () => {
        const order: string[] = []
        engagementAccess.takeBackEngagementAccess.mockImplementation(async () => { order.push('access'); return nothingLeft })
        db.engagementMember.deleteMany.mockImplementation(async () => { order.push('members'); return {} })
        expect(await deleteProject('e1', 'firm', 'client')).toEqual({ ok: true, data: undefined })
        expect(engagementAccess.takeBackEngagementAccess).toHaveBeenCalledWith('e1')
        expect(order).toEqual(['access', 'members'])
    })

    it('says who storage still gives access, and why', async () => {
        engagementAccess.takeBackEngagementAccess.mockResolvedValue({ files: ['Budget.xlsx'], folderAccess: ['ana@client.test', 'bob@client.test'], foldersUnchecked: false, reason: 'Google Drive is busy right now. Try again in a minute.' })
        const result = await deleteProject('e1', 'firm', 'client')
        expect(result).toEqual({
            ok: true,
            data: undefined,
            warning: 'Engagement deleted. Google Drive still gives ana@client.test and bob@client.test access to its folders and shares Budget.xlsx · Google Drive is busy right now. Try again in a minute. Open Google Drive to remove that access.',
        })
    })

    it('answers why, as a result, when it was deleted already', async () => {
        db.engagement.findFirst.mockImplementation(async (args: any) => (args.where.isDeleted ? { id: 'e1' } : null))
        expect(await deleteProject('e1', 'firm', 'client')).toEqual({ ok: false, error: 'This engagement was already deleted.', code: 'not_found' })
        expect(engagementAccess.takeBackEngagementAccess).not.toHaveBeenCalled()
    })

    it('refuses someone who may not delete it, as a result, touching nothing', async () => {
        const { canViewProjectSettings } = await import('@/lib/permission-helpers')
        vi.mocked(canViewProjectSettings).mockResolvedValueOnce(false)
        db.engagement.findFirst.mockImplementation(async (args: any) => (args.where.isDeleted ? null : { id: 'e1', firmId: 'f1', clientId: 'c1' }))
        expect(await deleteProject('e1', 'firm', 'client')).toMatchObject({ ok: false, code: 'forbidden' })
        expect(engagementAccess.takeBackEngagementAccess).not.toHaveBeenCalled()
    })
})

describe('deleting a client', () => {
    beforeEach(() => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{ role: 'firm_admin' }], clients: [{ id: 'c1' }], group: { slug: 'g' } })
        db.engagement.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
    })

    it("takes back each engagement's storage access before the client goes, and says what still stands", async () => {
        engagementAccess.takeBackEngagementAccess
            .mockResolvedValueOnce({ files: ['Budget.xlsx'], folderAccess: [], foldersUnchecked: false, reason: 'Google Drive refused the change.' })
            .mockResolvedValueOnce(nothingLeft)
        const result = await deleteClient('firm', 'client')
        expect(engagementAccess.takeBackEngagementAccess.mock.calls.map((c) => c[0])).toEqual(['e1', 'e2'])
        expect(db.client.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
        expect(result).toMatchObject({ ok: true, warning: 'Client deleted. Google Drive still shares Budget.xlsx · Google Drive refused the change. Open Google Drive to remove that access.' })
    })

    it('refuses a member who is not a firm admin, with words a person can read', async () => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{ role: 'firm_member' }], clients: [{ id: 'c1' }], group: { slug: 'g' } })
        expect(await deleteClient('firm', 'client')).toEqual({ ok: false, error: 'Only firm admins can delete a client', code: 'forbidden' })
        expect(db.client.delete).not.toHaveBeenCalled()
    })
})

describe('removing a firm member', () => {
    beforeEach(() => {
        db.firmMember.findUnique.mockResolvedValue({ id: 'fm1', firmId: 'f1', userId: 'sam', role: 'firm_member' })
        db.engagementMember.findMany.mockResolvedValue([{ engagementId: 'e1', engagement: { name: 'Acme Audit' } }])
    })

    it("takes back the storage access each of the firm's engagements gave them", async () => {
        db.engagementDocumentSharingUser.findMany.mockResolvedValue([share('s1', 'Budget.xlsx')])
        expect(await removeFirmMember('f1', 'fm1')).toEqual({ ok: true, data: undefined })
        expect(revoke.revokeSharePermissions).toHaveBeenCalledWith('e1', [share('s1', 'Budget.xlsx')])
        expect(revoke.markSharesRevoked).toHaveBeenCalledWith({ id: { in: ['s1'] } }, [])
        expect(folders.revokeMemberFolderAccess).toHaveBeenCalledWith('e1', { userId: 'sam', email: 'sam@firm.test' })
    })

    it('says what storage still gives them, by engagement', async () => {
        folders.revokeMemberFolderAccess.mockResolvedValue({ revoked: [], failures: [{ userId: 'sam', email: 'sam@firm.test', folder: 'General', folderId: 'g', reason: 'Google Drive is busy right now. Try again in a minute.' }] })
        const result = await removeFirmMember('f1', 'fm1')
        expect(result).toMatchObject({ ok: true, warning: 'Removed from the firm, but Google Drive still gives them access to General in Acme Audit · Google Drive is busy right now. Try again in a minute.' })
    })

    it('refuses to remove the last Firm Administrator, as a result', async () => {
        db.firmMember.findUnique.mockResolvedValue({ id: 'fm1', firmId: 'f1', userId: 'sam', role: 'firm_admin' })
        db.firmMember.count.mockResolvedValue(1)
        expect(await removeFirmMember('f1', 'fm1')).toEqual({ ok: false, error: 'Cannot remove the last Firm Administrator', code: 'last_admin' })
        expect(db.firmMember.delete).not.toHaveBeenCalled()
    })
})
