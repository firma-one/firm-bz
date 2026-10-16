import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Engagement member and invitation actions take a member, invitation or engagement id from the
 * browser. Every export of a 'use server' file is a callable endpoint, so each one must check the
 * caller can manage that engagement (lead, client manager or firm admin) — the Members tab only
 * hides the buttons. Reads are gated too: the member list carries names and emails.
 */

const { prisma, auth, perms } = vi.hoisted(() => {
    const fn = <T,>(v: T) => vi.fn(async () => v)
    const prisma = {
        engagement: { findFirst: fn<any>(null), findMany: fn<any[]>([]) },
        engagementMember: { findUnique: fn<any>(null), findMany: fn<any[]>([]), findFirst: fn<any>(null), update: fn<any>({}), delete: fn<any>({}), count: fn(0) },
        engagementInvitation: { findUnique: fn<any>(null), findMany: fn<any[]>([]), update: fn<any>({}), updateMany: fn<any>({}), delete: fn<any>({}), create: fn<any>({}), findUniqueOrThrow: fn<any>({}) },
        engagementDocumentSharingUser: { findMany: fn<any[]>([]) },
        persona: { findUnique: fn<any>(null) },
        firmMember: { findFirst: fn<any>(null), deleteMany: fn<any>({}) },
        connector: { findUnique: fn<any>(null) },
        $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(prisma)),
    }
    return {
        prisma,
        auth: { user: { id: 'u1', email: 'pat@acme.test' } as { id: string; email: string } | null },
        perms: { manage: false, internal: false, view: false },
    }
})

vi.mock('@/lib/prisma', () => ({ prisma, basePrisma: prisma }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canManageProject: vi.fn(async () => perms.manage),
    canViewProjectInternalTabs: vi.fn(async () => perms.internal),
    canViewProject: vi.fn(async () => perms.view),
}))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: 'sam@out.test', user_metadata: {} } } }), signOut: async () => ({}) } } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    audit: () => { const b: any = { scope: () => b, firm: () => b, engagement: () => b, actor: () => b, meta: () => b, fireAndForget: () => {} }; return b },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: { revokeFolderPermissionByEmail: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/reminders/reminder-service', () => ({ removeRemindersByEntity: vi.fn(async () => {}), upsertFollowUpReminder: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase-user-helpers', () => ({ getAvatarUrlFromSupabaseUser: () => null }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ isAgentUser: () => false }))
vi.mock('@/lib/permissions/invalidate-user-settings', () => ({ invalidateUserSettingsPlus: vi.fn() }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: vi.fn(async () => null) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates/invite', () => ({ renderInviteEmail: () => ({ subject: 's', html: 'h' }) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/supabase-jwt-metadata', () => ({ mergeLeanAppMetadata: vi.fn() }))
vi.mock('@/lib/actions/account-provisioning', () => ({ maybeProvisionInviteeAccount: vi.fn() }))
vi.mock('@/lib/actions/auth-user-lookup', () => ({ findAuthUserIdByEmail: vi.fn(async () => null) }))
vi.mock('@/lib/actions/engagement-membership', () => ({ joinEngagementForUser: vi.fn(), provisionAndNotifyExistingUser: vi.fn() }))
vi.mock('./personas', () => ({ getProjectPersonas: vi.fn(async () => []) }))

import { removeMember, revokeInvitation, updateMemberPersona, getProjectMembers, getProjectMemberSummaries } from './members'
import { inviteMember, resendInvitation } from './invitations'

const ENGAGEMENT = { id: 'e1', clientId: 'c1', client: { firmId: 'f1' } }

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1', email: 'pat@acme.test' }
    perms.manage = false
    perms.internal = false
    perms.view = false
    prisma.engagement.findFirst.mockResolvedValue(ENGAGEMENT)
    prisma.engagementMember.findUnique.mockResolvedValue({
        id: 'm2', userId: 'u2', role: 'eng_viewer', engagementId: 'e1',
        engagement: { id: 'e1', connectorRootFolderId: null, client: { firmId: 'f1' } },
    })
    prisma.engagementInvitation.findUnique.mockResolvedValue({ id: 'i1', engagementId: 'e1', email: 'new@client.test', status: 'PENDING', createdBy: 'u1' })
    prisma.persona.findUnique.mockResolvedValue({ id: 'p-admin', slug: 'eng_admin' })
})

describe('member and invitation writes need manage rights on the engagement', () => {
    it('refuses a member who cannot manage it, and writes nothing', async () => {
        await expect(inviteMember('e1', 'me@evil.test', 'p-admin')).rejects.toThrow('Insufficient permissions')
        await expect(resendInvitation('i1')).rejects.toThrow('Insufficient permissions')
        await expect(revokeInvitation('i1')).rejects.toThrow('Insufficient permissions')
        await expect(updateMemberPersona('m2', 'p-admin')).rejects.toThrow('Insufficient permissions')
        await expect(removeMember('m2')).rejects.toThrow('Insufficient permissions')

        expect(prisma.engagementInvitation.create).not.toHaveBeenCalled()
        expect(prisma.engagementInvitation.update).not.toHaveBeenCalled()
        expect(prisma.engagementInvitation.delete).not.toHaveBeenCalled()
        expect(prisma.engagementMember.update).not.toHaveBeenCalled()
        expect(prisma.engagementMember.delete).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('refuses a signed-out caller', async () => {
        auth.user = null
        await expect(inviteMember('e1', 'me@evil.test', 'p-admin')).rejects.toThrow('Unauthorized')
        await expect(resendInvitation('i1')).rejects.toThrow('Unauthorized')
        await expect(revokeInvitation('i1')).rejects.toThrow('Unauthorized')
        await expect(updateMemberPersona('m2', 'p-admin')).rejects.toThrow('Unauthorized')
        await expect(removeMember('m2')).rejects.toThrow('Unauthorized')
    })

    it('checks the engagement the member or invitation belongs to, not one the caller names', async () => {
        const { canManageProject } = await import('@/lib/permission-helpers')
        await expect(removeMember('m2')).rejects.toThrow()
        expect(canManageProject).toHaveBeenCalledWith('f1', 'c1', 'e1')
        expect(prisma.engagement.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1', isDeleted: false } }))
    })

    it('lets a manager change a role, remove a member and revoke or resend an invitation', async () => {
        perms.manage = true
        await expect(updateMemberPersona('m2', 'p-admin')).resolves.toEqual({ success: true })
        expect(prisma.engagementMember.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { role: 'eng_admin' } })

        await removeMember('m2')
        expect(prisma.engagementMember.delete).toHaveBeenCalledWith({ where: { id: 'm2' } })

        await revokeInvitation('i1')
        expect(prisma.engagementInvitation.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })

        await resendInvitation('i1')
        expect(prisma.engagementInvitation.update).toHaveBeenCalled()
    })

    it('never hands out a firm or system persona, even for a manager', async () => {
        perms.manage = true
        prisma.persona.findUnique.mockResolvedValue({ id: 'p-firm', slug: 'firm_admin' })
        await expect(updateMemberPersona('m2', 'p-firm')).rejects.toThrow('Not an engagement role')
        await expect(inviteMember('e1', 'new@client.test', 'p-firm')).rejects.toThrow('Not an engagement role')
        expect(prisma.engagementMember.update).not.toHaveBeenCalled()
        expect(prisma.engagementInvitation.create).not.toHaveBeenCalled()
    })

    it('refuses a deleted or unknown engagement', async () => {
        perms.manage = true
        prisma.engagement.findFirst.mockResolvedValue(null)
        await expect(inviteMember('gone', 'x@y.test', 'p-admin')).rejects.toThrow('Engagement not found')
        await expect(revokeInvitation('i1')).rejects.toThrow('Engagement not found')
    })
})

describe('member reads are limited to people who can see them', () => {
    it('lists members and invitations only for those who see the Members tab', async () => {
        await expect(getProjectMembers('e1')).rejects.toThrow('Insufficient permissions')
        expect(prisma.engagementMember.findMany).not.toHaveBeenCalled()

        perms.internal = true
        await expect(getProjectMembers('e1')).resolves.toEqual({ members: [], invitations: [] })
    })

    it('summarizes only the engagements the caller can open', async () => {
        prisma.engagement.findMany.mockResolvedValue([ENGAGEMENT, { id: 'e2', clientId: 'c9', client: { firmId: 'f9' } }])
        const { canViewProject } = await import('@/lib/permission-helpers')
        vi.mocked(canViewProject).mockImplementation(async (_f, _c, id) => id === 'e1')

        const result = await getProjectMemberSummaries(['e1', 'e2'])
        expect(Object.keys(result)).toEqual(['e1'])
        expect(prisma.engagementMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { engagementId: { in: ['e1'] } } }))
    })
})
