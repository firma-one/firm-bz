import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, checkFirmSubscriptionAccess } = vi.hoisted(() => ({
    prisma: { firmMember: { findMany: vi.fn() } },
    checkFirmSubscriptionAccess: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/billing/subscription-gate', () => ({ checkFirmSubscriptionAccess }))

import { getHomeFirms, maintenanceActive } from './home-firms'

function member(id: string, name: string, settings: Record<string, unknown> = {}) {
    return { firm: { id, name, slug: id, settings, group: { slug: 'grp' } } }
}

const future = new Date(Date.now() + 3600_000).toISOString()
const past = new Date(Date.now() - 3600_000).toISOString()

beforeEach(() => {
    vi.clearAllMocks()
    checkFirmSubscriptionAccess.mockResolvedValue(true)
})

describe('maintenanceActive', () => {
    it('is on only while the window is open', () => {
        expect(maintenanceActive({ maintenanceMode: { active: true, expiresAt: future } })).toBe(true)
        expect(maintenanceActive({ maintenanceMode: { active: true, expiresAt: past } })).toBe(false)
        expect(maintenanceActive({ maintenanceMode: { active: false } })).toBe(false)
        expect(maintenanceActive({})).toBe(false)
        expect(maintenanceActive(null)).toBe(false)
    })
})

describe('getHomeFirms', () => {
    it('reads only the caller\'s own memberships in live firms', async () => {
        prisma.firmMember.findMany.mockResolvedValue([])
        await getHomeFirms('u1')
        expect(prisma.firmMember.findMany.mock.calls[0][0].where).toEqual({
            userId: 'u1',
            firm: { deletedAt: null, sandboxOnly: false },
        })
    })

    it('sorts open firms by name and reports locked and maintenance firms apart', async () => {
        prisma.firmMember.findMany.mockResolvedValue([
            member('zeta', 'Zeta'),
            member('alpha', 'Alpha'),
            member('down', 'Down', { maintenanceMode: { active: true, expiresAt: future } }),
            member('locked', 'Locked'),
        ])
        checkFirmSubscriptionAccess.mockImplementation(async (id: string) => id !== 'locked')

        const { firms, unavailable } = await getHomeFirms('u1')
        expect(firms.map((f) => f.slug)).toEqual(['alpha', 'zeta'])
        expect(unavailable).toEqual([
            { id: 'down', name: 'Down', slug: 'down', groupSlug: 'grp', reason: 'maintenance', href: '/d/grp/f/down/maintenance' },
            { id: 'locked', name: 'Locked', slug: 'locked', groupSlug: 'grp', reason: 'subscription', href: '/d/grp/f/locked/subscription-locked' },
        ])
    })

    it('returns nothing rather than throwing when the lookup fails', async () => {
        prisma.firmMember.findMany.mockRejectedValue(new Error('db down'))
        expect(await getHomeFirms('u1')).toEqual({ firms: [], unavailable: [] })
    })
})
