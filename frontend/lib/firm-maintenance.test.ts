import { describe, it, expect, vi } from 'vitest'

/** A firm's maintenance warning answers "sent to X of Y", where the misses were only logged one by one. */

const { getUserById, sendEmail } = vi.hoisted(() => ({ getUserById: vi.fn(), sendEmail: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById } } }) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        firmMember: { findMany: async () => [{ userId: 'u1' }, { userId: 'u2' }] },
        clientMember: { findMany: async () => [{ userId: 'u3' }] },
        engagementMember: { findMany: async () => [{ userId: 'u1' }] },
    },
}))
vi.mock('@/lib/email', () => ({ sendEmail }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/config/brand', () => ({ BRAND_NAME: 'Firma' }))

import { sendMaintenanceWarningToFirmMembers } from './firm-maintenance'

describe('sendMaintenanceWarningToFirmMembers', () => {
    it('counts what went out and names who it missed', async () => {
        getUserById.mockImplementation(async (id: string) => ({ data: { user: id === 'u2' ? { email: null } : { email: `${id}@acme.test` } } }))
        sendEmail.mockImplementation(async (to: string) => { if (to === 'u3@acme.test') throw new Error('SMTP 550') })
        const out = await sendMaintenanceWarningToFirmMembers('f1', 10)
        expect(out).toEqual({ sent: 1, total: 3, failed: ['u2', 'u3'] })
    })
})
