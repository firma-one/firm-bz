import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma } = vi.hoisted(() => ({
    prisma: {
        userRecentVisit: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
        firmMember: { findFirst: vi.fn() },
        engagement: { findMany: vi.fn() },
        client: { findMany: vi.fn() },
    },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { parseAppPath, getRecentVisits, getLastEngagementTab, getLastVisitedFirmId } from './recents'

describe('parseAppPath', () => {
    it('parses firm, client and engagement levels', () => {
        expect(parseAppPath('/d/g/f/acme')).toEqual({ groupSlug: 'g', firmSlug: 'acme', clientSlug: null, engagementSlug: null, engagementTab: null })
        expect(parseAppPath('/d/g/f/acme/c/contoso')).toMatchObject({ clientSlug: 'contoso', engagementSlug: null })
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26')).toMatchObject({ clientSlug: 'contoso', engagementSlug: 'fy26', engagementTab: null })
    })

    it('reads the engagement tab, ignoring query and hash', () => {
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26/files?x=1#doc-file:abc')?.engagementTab).toBe('files')
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26/shares/board')?.engagementTab).toBe('shares')
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26/board')?.engagementTab).toBe('shares')
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26/wiki/page-1')?.engagementTab).toBe('wiki')
        expect(parseAppPath('/d/g/f/acme/c/contoso/e/fy26/nonsense')?.engagementTab).toBeNull()
    })

    it('treats firm sub-pages as the firm', () => {
        expect(parseAppPath('/d/g/f/acme/audit')).toMatchObject({ firmSlug: 'acme', clientSlug: null, engagementSlug: null })
        expect(parseAppPath('/d/g/f/acme?tab=calendar')).toMatchObject({ firmSlug: 'acme', clientSlug: null })
    })

    it('rejects anything outside the firm tree', () => {
        expect(parseAppPath('/d')).toBeNull()
        expect(parseAppPath('/d/u/profile')).toBeNull()
        expect(parseAppPath('/d/g/f/')).toBeNull()
        expect(parseAppPath('/signin')).toBeNull()
        expect(parseAppPath('https://evil.test/d/g/f/acme')).toBeNull()
    })
})

const row = (over: Record<string, unknown>) => ({
    id: 'r', userId: 'u1', firmId: 'f1', entityType: 'engagement', entityId: 'e1', path: '/p', title: 't', visitedAt: new Date('2026-10-14T10:00:00Z'),
    ...over,
})

describe('getRecentVisits — re-checks access on read', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        prisma.firmMember.findFirst.mockResolvedValue({ id: 'm1' })
        prisma.engagement.findMany.mockResolvedValue([])
        prisma.client.findMany.mockResolvedValue([])
    })

    it('returns nothing once the caller is no longer a firm member', async () => {
        prisma.userRecentVisit.findMany.mockResolvedValue([row({})])
        prisma.firmMember.findFirst.mockResolvedValue(null)
        expect(await getRecentVisits('u1', 'f1')).toEqual([])
    })

    it('drops engagements the caller no longer belongs to and uses live names', async () => {
        prisma.userRecentVisit.findMany.mockResolvedValue([
            row({ id: 'r1', entityId: 'e1', path: '/d/g/f/acme/c/c1/e/one/files' }),
            row({ id: 'r2', entityId: 'e-removed' }),
        ])
        prisma.engagement.findMany.mockResolvedValue([{ id: 'e1', name: 'Renamed Engagement', client: { name: 'Contoso' } }])
        const out = await getRecentVisits('u1', 'f1')
        expect(out.map((r) => r.id)).toEqual(['r1'])
        expect(out[0]).toMatchObject({ title: 'Renamed Engagement', context: 'Contoso', path: '/d/g/f/acme/c/c1/e/one/files' })
        const where = prisma.engagement.findMany.mock.calls[0][0].where
        expect(where).toMatchObject({ isDeleted: false, members: { some: { userId: 'u1' } } })
    })

    it('skips firm-level rows — Continue never points back at Home', async () => {
        prisma.userRecentVisit.findMany.mockResolvedValue([row({ id: 'rf', entityType: 'firm', entityId: 'f1' })])
        expect(await getRecentVisits('u1', 'f1')).toEqual([])
    })

    it('fails closed (empty) when the table is missing, e.g. before the migration runs', async () => {
        prisma.userRecentVisit.findMany.mockRejectedValue(new Error('relation does not exist'))
        expect(await getRecentVisits('u1', 'f1')).toEqual([])
    })
})

describe('landing and default-tab helpers', () => {
    beforeEach(() => vi.clearAllMocks())

    it('picks the most recent firm among the given ones', async () => {
        prisma.userRecentVisit.findFirst.mockResolvedValue({ firmId: 'f2' })
        expect(await getLastVisitedFirmId('u1', ['f1', 'f2'])).toBe('f2')
        expect(prisma.userRecentVisit.findFirst.mock.calls[0][0].where).toEqual({ userId: 'u1', firmId: { in: ['f1', 'f2'] } })
        expect(await getLastVisitedFirmId('u1', [])).toBeNull()
    })

    it('returns the last engagement tab from the stored path', async () => {
        prisma.userRecentVisit.findUnique.mockResolvedValue({ path: '/d/g/f/acme/c/c1/e/one/comments#doc-comment:1:2' })
        expect(await getLastEngagementTab('u1', 'e1')).toBe('comments')
        prisma.userRecentVisit.findUnique.mockResolvedValue(null)
        expect(await getLastEngagementTab('u1', 'e1')).toBeNull()
    })
})
