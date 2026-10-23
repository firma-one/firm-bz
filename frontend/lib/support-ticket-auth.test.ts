import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { prisma } = vi.hoisted(() => ({ prisma: { firmMember: { findFirst: vi.fn() } } }))
vi.mock('@/lib/prisma', () => ({ prisma }))

import { canAccessSupportTicket } from './support-ticket-auth'

const ticket = { userId: 'raiser', firmId: 'f1' }

beforeEach(() => {
    vi.clearAllMocks()
    prisma.firmMember.findFirst.mockResolvedValue(null)
    vi.stubEnv('SYSTEM_ADMIN_EMAILS', 'staff@firma.bz, Ops@Firma.bz')
})
afterEach(() => vi.unstubAllEnvs())

describe('canAccessSupportTicket', () => {
    it('lets in whoever raised it', async () => {
        expect(await canAccessSupportTicket({ id: 'raiser', email: 'r@client.com' }, ticket)).toBe(true)
        expect(prisma.firmMember.findFirst).not.toHaveBeenCalled()
    })

    it('lets in a firm admin of its firm, and no other member', async () => {
        prisma.firmMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
        expect(await canAccessSupportTicket({ id: 'admin', email: 'a@firm.com' }, ticket)).toBe(true)
        expect(prisma.firmMember.findFirst.mock.calls[0][0].where).toEqual({ firmId: 'f1', userId: 'admin', role: 'firm_admin' })
        expect(await canAccessSupportTicket({ id: 'member', email: 'm@firm.com' }, ticket)).toBe(false)
    })

    it('lets in the Firma team (SYSTEM_ADMIN_EMAILS, any case) on any firm’s request', async () => {
        expect(await canAccessSupportTicket({ id: 'staff', email: 'staff@firma.bz' }, ticket)).toBe(true)
        expect(await canAccessSupportTicket({ id: 'ops', email: 'ops@firma.bz' }, { userId: null, firmId: null })).toBe(true)
    })

    it('keeps everyone else out', async () => {
        expect(await canAccessSupportTicket({ id: 'stranger', email: 'x@else.com' }, ticket)).toBe(false)
        expect(await canAccessSupportTicket({ id: 'noemail' }, ticket)).toBe(false)
    })
})
