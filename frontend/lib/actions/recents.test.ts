import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, auth } = vi.hoisted(() => ({
    prisma: {
        firm: { findUnique: vi.fn() },
        firmMember: { findFirst: vi.fn() },
        engagement: { findFirst: vi.fn() },
        client: { findFirst: vi.fn() },
        userRecentVisit: { upsert: vi.fn(), findUnique: vi.fn() },
        $executeRaw: vi.fn(),
    },
    auth: { user: { id: 'u1' } as { id: string } | null },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}))

import { recordVisit, importLegacyRecents } from './recents'

const ENG_PATH = '/d/acme-group/f/acme/c/contoso/e/fy26/files'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    prisma.firm.findUnique.mockResolvedValue({ id: 'f1', name: 'Acme', group: { slug: 'acme-group' } })
    prisma.firmMember.findFirst.mockResolvedValue({ id: 'm1' })
    prisma.engagement.findFirst.mockResolvedValue({ id: 'e1', name: 'FY26 Audit' })
    prisma.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Contoso' })
    prisma.userRecentVisit.findUnique.mockResolvedValue(null)
})

describe('recordVisit — only for entities the caller can see', () => {
    it('records an engagement visit with its full path', async () => {
        await recordVisit(`${ENG_PATH}#doc-file:abc`)
        const args = prisma.userRecentVisit.upsert.mock.calls[0][0]
        expect(args.where).toEqual({ userId_entityType_entityId: { userId: 'u1', entityType: 'engagement', entityId: 'e1' } })
        expect(args.create).toMatchObject({ userId: 'u1', firmId: 'f1', entityType: 'engagement', path: `${ENG_PATH}#doc-file:abc`, title: 'FY26 Audit' })
        expect(prisma.$executeRaw).toHaveBeenCalled() // pruned to the newest N
    })

    it('requires engagement membership in the lookup', async () => {
        await recordVisit(ENG_PATH)
        expect(prisma.engagement.findFirst.mock.calls[0][0].where).toEqual({
            slug: 'fy26',
            isDeleted: false,
            client: { slug: 'contoso', firmId: 'f1' },
            members: { some: { userId: 'u1' } },
        })
    })

    it('writes nothing for an engagement the caller does not belong to', async () => {
        prisma.engagement.findFirst.mockResolvedValue(null)
        await recordVisit(ENG_PATH)
        expect(prisma.userRecentVisit.upsert).not.toHaveBeenCalled()
    })

    it('writes nothing for a non-member of the firm, or a mismatched group slug', async () => {
        prisma.firmMember.findFirst.mockResolvedValue(null)
        await recordVisit(ENG_PATH)
        prisma.firmMember.findFirst.mockResolvedValue({ id: 'm1' })
        await recordVisit('/d/other-group/f/acme/c/contoso/e/fy26')
        expect(prisma.userRecentVisit.upsert).not.toHaveBeenCalled()
    })

    it('writes nothing when signed out or for paths outside the firm tree', async () => {
        await recordVisit('/d/u/profile')
        await recordVisit('https://evil.test/d/acme-group/f/acme')
        auth.user = null
        await recordVisit(ENG_PATH)
        expect(prisma.userRecentVisit.upsert).not.toHaveBeenCalled()
    })

    it('records the firm itself for firm-level pages, dropping the one-time landed flag', async () => {
        await recordVisit('/d/acme-group/f/acme?landed=returning')
        const args = prisma.userRecentVisit.upsert.mock.calls[0][0]
        expect(args.create).toMatchObject({ entityType: 'firm', entityId: 'f1', path: '/d/acme-group/f/acme' })
        await recordVisit('/d/acme-group/f/acme?tab=calendar&landed=new')
        expect(prisma.userRecentVisit.upsert.mock.calls[1][0].create.path).toBe('/d/acme-group/f/acme?tab=calendar')
    })
})

describe('importLegacyRecents', () => {
    it('imports visible items and never overwrites a newer row', async () => {
        prisma.userRecentVisit.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ visitedAt: new Date('2026-10-14T12:00:00Z') })
        await importLegacyRecents([
            { href: ENG_PATH, visitedAt: '2026-10-13T09:00:00Z' },
            { href: '/d/acme-group/f/acme/c/contoso', visitedAt: '2026-10-13T09:00:00Z' },
            { href: 'https://evil.test', visitedAt: '2026-10-13T09:00:00Z' },
            { href: ENG_PATH, visitedAt: 'not a date' },
        ])
        expect(prisma.userRecentVisit.upsert).toHaveBeenCalledTimes(1)
        expect(prisma.userRecentVisit.upsert.mock.calls[0][0].create).toMatchObject({ entityType: 'engagement', visitedAt: new Date('2026-10-13T09:00:00Z') })
    })
})
