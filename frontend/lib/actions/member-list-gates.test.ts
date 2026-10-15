import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Firm and client member lists carry names, emails and pending invites, and only checked sign-in
 * (.claude/plans/access-gates.md, P0 #12). Invite tokens never leave the server; inviteClientMember
 * checks the client's own firm, not the caller's firmId (P0 #8).
 */

const { auth, db, perms } = vi.hoisted(() => ({
    auth: { user: { id: 'u1' } as { id: string } | null },
    db: { firmAdmin: false, clientPartner: false, clientFirm: 'f1' as string | null },
    perms: { manageClient: false },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        firmMember: {
            findFirst: vi.fn(async () => (db.firmAdmin ? { id: 'm' } : null)),
            findMany: vi.fn(async () => [{ id: 'm1', userId: 'u2', role: 'firm_member' }]),
        },
        clientMember: {
            findFirst: vi.fn(async () => (db.clientPartner ? { id: 'cm' } : null)),
            findMany: vi.fn(async () => [{ id: 'cm1', userId: 'u2' }]),
        },
        firmInvitation: { findMany: vi.fn(async () => [{ id: 'i1', email: 'new@x.test', token: 'SECRET-TOKEN' }]) },
        clientInvitation: { findMany: vi.fn(async () => [{ id: 'ci1', email: 'new@x.test', token: 'SECRET-TOKEN' }]) },
        connector: { findMany: vi.fn(async () => []) },
        client: { findUnique: vi.fn(async () => (db.clientFirm ? { firmId: db.clientFirm, firm: { sandboxOnly: false, name: 'Acme' } } : null)) },
        persona: { findUnique: vi.fn(async () => ({ id: 'p' })) },
        clientInvitationCreate: {},
    },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: 'u2@x.test', user_metadata: {} } } }) } } }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageOrganization: vi.fn(async () => db.firmAdmin), canManageClient: vi.fn(async () => perms.manageClient) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ isAgentUser: () => false }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/email-templates/invite', () => ({ renderInviteEmail: () => ({ subject: 's', html: 'h' }) }))
vi.mock('@/lib/actions/account-provisioning', () => ({ maybeProvisionInviteeAccount: vi.fn() }))
vi.mock('@/lib/audit', () => ({
    audit: () => { const b: any = { scope: () => b, firm: () => b, client: () => b, actor: () => b, meta: () => b, fireAndForget: () => {} }; return b },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn(), removeRemindersByEntity: vi.fn() }))
vi.mock('@/lib/supabase-user-helpers', () => ({ getAvatarUrlFromSupabaseUser: () => null }))
vi.mock('@/lib/navigation/firm-paths', () => ({ firmSettingsPath: () => '/x' }))

import { getFirmMembers } from './firm-members'
import { getClientMembers, inviteClientMember } from './client-members'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    Object.assign(db, { firmAdmin: false, clientPartner: false, clientFirm: 'f1' })
    perms.manageClient = false
})

describe('getFirmMembers', () => {
    it('refuses a stranger, a guest and a signed-out caller', async () => {
        await expect(getFirmMembers('f1')).rejects.toThrow('Insufficient permissions')
        auth.user = null
        await expect(getFirmMembers('f1')).rejects.toThrow('Unauthorized')
    })

    it('gives a Client Partner the people for the owner picker, without invitations', async () => {
        db.clientPartner = true
        const res = await getFirmMembers('f1')
        expect(res.members).toHaveLength(1)
        expect(res.invitations).toEqual([])
    })

    it('gives a firm admin the invitations, never the invite token', async () => {
        db.firmAdmin = true
        const res = await getFirmMembers('f1')
        expect(res.invitations).toHaveLength(1)
        expect(JSON.stringify(res)).not.toContain('SECRET-TOKEN')
    })
})

describe('getClientMembers', () => {
    it('is for the client\'s managers only, and never returns invite tokens', async () => {
        await expect(getClientMembers('c1')).rejects.toThrow('Insufficient permissions')
        perms.manageClient = true
        expect(JSON.stringify(await getClientMembers('c1'))).not.toContain('SECRET-TOKEN')
    })
})

describe('inviteClientMember', () => {
    it('checks the client\'s own firm, not the firmId the caller sends', async () => {
        perms.manageClient = true
        db.clientFirm = 'victim-firm'
        await expect(inviteClientMember('attacker-firm', 'victim-client', 'me@evil.test')).rejects.toThrow('Client not found')
        const { canManageClient } = await import('@/lib/permission-helpers')
        expect(canManageClient).not.toHaveBeenCalledWith('attacker-firm', expect.anything())
    })
})
