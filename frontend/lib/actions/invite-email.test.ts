import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * MB-1, P1-14 to P1-16, P2-45: an invitation whose email couldn't be sent is reported to the inviter.
 * A first invite stands (its row reads Email failed, with Resend), so it answers ok with a warning; a
 * resend's whole job was the email, so it answers the error; someone added at once is named, so the
 * inviter knows to tell them. And a member lookup that fails never lets a duplicate invite through.
 */

const { db, mail, lookups, existingUser } = vi.hoisted(() => {
    const fn = <T,>(v: T) => vi.fn(async (..._args: any[]) => v)
    const db = {
        firm: { findUnique: fn<any>({ sandboxOnly: false, slug: 'acme', name: 'Acme', group: { slug: 'g' } }) },
        persona: { findUnique: fn<any>({ id: 'p-admin', slug: 'eng_admin' }) },
        firmMember: { findMany: fn<any[]>([]) },
        firmInvitation: { findUnique: fn<any>(null), create: fn<any>({ id: 'fi-1' }), update: fn<any>({}) },
        client: { findUnique: fn<any>({ firmId: 'f1', name: 'Contoso', firm: { sandboxOnly: false, name: 'Acme' } }) },
        clientMember: { findMany: fn<any[]>([]) },
        clientInvitation: { findUnique: fn<any>(null), create: fn<any>({ id: 'ci-1' }), update: fn<any>({}) },
        engagement: { findFirst: fn<any>({ slug: 'audit', name: 'Audit', client: { slug: 'contoso', name: 'Contoso', firm: { id: 'f1', slug: 'acme', name: 'Acme', sandboxOnly: false, group: { slug: 'g' } } } }) },
        engagementInvitation: { findUnique: fn<any>(null), create: fn<any>({ id: 'ei-1' }), update: fn<any>({}), findUniqueOrThrow: fn<any>({ id: 'ei-1' }) },
    }
    return {
        db,
        mail: { sendEmail: vi.fn(async () => {}) },
        lookups: { getUserById: vi.fn(async () => ({ data: { user: { email: 'someone@acme.test' } }, error: null })) },
        existingUser: { id: null as string | null, emailed: true },
    }
})

const chain: unknown = new Proxy(() => chain, { get: () => () => chain })

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-lead' } } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: lookups.getUserById } } }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageOrganization: vi.fn(async () => true), canManageClient: vi.fn(async () => true) }))
vi.mock('@/lib/permissions/require-engagement-manager', () => ({
    requireEngagementManager: vi.fn(async () => ({ userId: 'u-lead', firmId: 'f1', clientId: 'c1' })),
    isEngagementPersonaSlug: (s: string) => s.startsWith('eng_'),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: () => chain, AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }), AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }) }))
vi.mock('@/lib/email', () => mail)
vi.mock('@/lib/email-templates/invite', () => ({ renderInviteEmail: () => ({ subject: 's', html: 'h' }) }))
vi.mock('@/lib/actions/account-provisioning', () => ({ maybeProvisionInviteeAccount: vi.fn(), applyInvitedName: vi.fn() }))
vi.mock('@/lib/actions/auth-user-lookup', () => ({ findAuthUserIdByEmail: vi.fn(async () => existingUser.id) }))
vi.mock('@/lib/actions/engagement-membership', () => ({
    joinEngagementForUser: vi.fn(),
    provisionAndNotifyExistingUser: vi.fn(async () => ({ redirectUrl: '/d/x', newEngagementMemberCreated: true, emailed: existingUser.emailed })),
}))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn(async () => {}), removeRemindersByEntity: vi.fn(async () => {}) }))
vi.mock('@/lib/auth/sessions', () => ({ endUserSessions: vi.fn() }))
vi.mock('@/lib/connectors/revoke-share-permissions', () => ({ markSharesRevoked: vi.fn(), revokeSharePermissions: vi.fn(), SHARE_TO_REVOKE_SELECT: {} }))
vi.mock('@/lib/connectors/firm-folder-access', () => ({ revokeMemberFolderAccess: vi.fn() }))
vi.mock('@/lib/storage-access-notice', () => ({ accessStillStanding: vi.fn(), storageProviderName: vi.fn() }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ isAgentUser: () => false }))
vi.mock('@/lib/supabase-user-helpers', () => ({ getAvatarUrlFromSupabaseUser: () => null }))
vi.mock('@/lib/permissions/invalidate-user-settings', () => ({ invalidateUserSettingsPlus: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { inviteFirmMember, resendFirmInvitation } from './firm-members'
import { inviteClientMember, resendClientInvitation } from './client-members'
import { inviteMember, resendInvitation } from './invitations'

beforeEach(() => {
    vi.clearAllMocks()
    existingUser.id = null
    existingUser.emailed = true
    mail.sendEmail.mockResolvedValue(undefined)
    lookups.getUserById.mockResolvedValue({ data: { user: { email: 'someone@acme.test' } }, error: null })
    db.firmInvitation.findUnique.mockResolvedValue(null)
    db.clientInvitation.findUnique.mockResolvedValue(null)
    db.engagementInvitation.findUnique.mockResolvedValue(null)
})

const refused = new Error('550 mailbox unavailable')

describe('first invites whose email fails (P1-14, P1-15)', () => {
    it('firm: saved, marked Email failed, and the inviter is told', async () => {
        mail.sendEmail.mockRejectedValueOnce(refused)
        const result = await inviteFirmMember('f1', 'Ana@Client.test')
        expect(result).toEqual({ ok: true, data: undefined, warning: "Invitation saved, but the email to ana@client.test wasn't sent. Use Resend to try again." })
        expect(db.firmInvitation.update).toHaveBeenCalledWith({ where: { id: 'fi-1' }, data: { status: 'ERROR' } })
    })

    it('client: the same', async () => {
        mail.sendEmail.mockRejectedValueOnce(refused)
        const result = await inviteClientMember('f1', 'c1', 'ana@client.test')
        expect(result).toMatchObject({ ok: true, warning: expect.stringContaining("the email to ana@client.test wasn't sent") })
        expect(db.clientInvitation.update).toHaveBeenCalledWith({ where: { id: 'ci-1' }, data: { status: 'ERROR' } })
    })

    it('engagement: the same', async () => {
        mail.sendEmail.mockRejectedValueOnce(refused)
        const result = await inviteMember('e1', 'ana@client.test', 'p-admin')
        expect(result).toMatchObject({ ok: true, data: { added: false }, warning: expect.stringContaining("wasn't sent") })
        expect(db.engagementInvitation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ei-1' }, data: expect.objectContaining({ status: 'ERROR' }) }))
    })

    it('a sent invite answers plain ok', async () => {
        expect(await inviteFirmMember('f1', 'ana@client.test')).toEqual({ ok: true, data: undefined })
        expect(await inviteMember('e1', 'ana@client.test', 'p-admin')).toEqual({ ok: true, data: { added: false } })
    })
})

describe('someone with an account, added at once, whose email fails (P1-16)', () => {
    it('names them, so the inviter knows to tell them', async () => {
        existingUser.id = 'u-ana'
        existingUser.emailed = false
        const result = await inviteMember('e1', 'ana@client.test', 'p-admin', { firstName: 'Ana', lastName: 'Silva' })
        expect(result).toEqual({ ok: true, data: { added: true }, warning: "Added Ana, but couldn't email them. Let them know yourself." })
    })
})

describe('resends whose email fails (MB-1)', () => {
    it('firm: the error, never "Invitation resent"', async () => {
        db.firmInvitation.findUnique.mockResolvedValueOnce({ id: 'fi-1', firmId: 'f1', email: 'ana@client.test', status: 'PENDING', firm: { slug: 'acme', name: 'Acme', group: { slug: 'g' } } })
        mail.sendEmail.mockRejectedValueOnce(refused)
        expect(await resendFirmInvitation('fi-1')).toEqual({ ok: false, code: 'email_failed', error: "Couldn't email ana@client.test. The invitation is still open, so try again in a moment." })
        expect(db.firmInvitation.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) }))
    })

    it('client: the same', async () => {
        db.clientInvitation.findUnique.mockResolvedValueOnce({ id: 'ci-1', clientId: 'c1', email: 'ana@client.test', status: 'PENDING', client: { firmId: 'f1', name: 'C', firm: { name: 'Acme' } } })
        mail.sendEmail.mockRejectedValueOnce(refused)
        expect(await resendClientInvitation('ci-1')).toMatchObject({ ok: false, code: 'email_failed' })
    })

    it('engagement: the same', async () => {
        db.engagementInvitation.findUnique.mockResolvedValueOnce({ id: 'ei-1', engagementId: 'e1', email: 'ana@client.test', status: 'PENDING' })
        mail.sendEmail.mockRejectedValueOnce(refused)
        expect(await resendInvitation('ei-1')).toMatchObject({ ok: false, code: 'email_failed', error: expect.stringContaining("Couldn't email ana@client.test") })
    })

    it('says mid-accept in words', async () => {
        db.firmInvitation.findUnique.mockResolvedValueOnce({ id: 'fi-1', firmId: 'f1', email: 'ana@client.test', status: 'ACCEPTED', firm: null })
        expect(await resendFirmInvitation('fi-1')).toMatchObject({ ok: false, code: 'mid_accept' })
    })
})

describe('a member lookup that fails never lets a duplicate invite through (P2-45)', () => {
    it('refuses, saying the check could not run', async () => {
        db.firmMember.findMany.mockResolvedValueOnce([{ userId: 'u-x' }])
        lookups.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 500, message: 'auth down' } } as never)
        expect(await inviteFirmMember('f1', 'ana@client.test')).toEqual({ ok: false, code: 'lookup_failed', error: "Couldn't check whether this person is already a member. Try again." })
        expect(db.firmInvitation.create).not.toHaveBeenCalled()
    })

    it('an account that is gone (404) holds no address, and the invite goes ahead', async () => {
        db.clientMember.findMany.mockResolvedValueOnce([{ userId: 'u-gone' }])
        lookups.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, message: 'User not found' } } as never)
        expect(await inviteClientMember('f1', 'c1', 'ana@client.test')).toEqual({ ok: true, data: undefined })
    })

    it('says "already a member" in words', async () => {
        db.firmMember.findMany.mockResolvedValueOnce([{ userId: 'u-ana' }])
        lookups.getUserById.mockResolvedValueOnce({ data: { user: { email: 'ana@client.test' } }, error: null })
        expect(await inviteFirmMember('f1', 'ana@client.test')).toEqual({ ok: false, code: 'already_member', error: 'A member with this email is already in the firm' })
    })
})
