import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, auth, scope } = vi.hoisted(() => ({
    prisma: {
        engagement: { findMany: vi.fn() },
        client: { findMany: vi.fn() },
        firm: { findUnique: vi.fn() },
        firmMember: { findFirst: vi.fn() },
        $queryRaw: vi.fn(),
    },
    auth: { user: { id: 'u1' } as { id: string } | null },
    scope: { value: { isFirmAdmin: false, fullAccessEngagementIds: ['e1'], grantGatedEngagementIds: ['e2'] } },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}))
vi.mock('@/lib/services/global-search-access', () => ({ computeGlobalSearchAccessScope: vi.fn(async () => scope.value) }))
vi.mock('@/lib/recents', () => ({ getRecentVisits: vi.fn(async () => []) }))

import { quickSearch } from './quick-search'
import { computeGlobalSearchAccessScope } from '@/lib/services/global-search-access'

const FIRM = { id: 'f1', name: 'Acme', slug: 'acme', group: { slug: 'g' } }

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    scope.value = { isFirmAdmin: false, fullAccessEngagementIds: ['e1'], grantGatedEngagementIds: ['e2'] }
    prisma.engagement.findMany.mockResolvedValue([])
    prisma.client.findMany.mockResolvedValue([])
    prisma.firm.findUnique.mockResolvedValue(FIRM)
    prisma.firmMember.findFirst.mockResolvedValue({ id: 'm1' })
    prisma.$queryRaw.mockResolvedValue([])
})

describe('quickSearch — access scope', () => {
    it('returns nothing for an empty query or a signed-out caller', async () => {
        expect(await quickSearch('   ', 'acme')).toEqual([])
        auth.user = null
        expect(await quickSearch('audit', 'acme')).toEqual([])
        expect(prisma.engagement.findMany).not.toHaveBeenCalled()
    })

    it('searches only engagements the caller belongs to, in firms they belong to', async () => {
        await quickSearch('audit', 'acme')
        expect(prisma.engagement.findMany.mock.calls[0][0].where).toEqual({
            isDeleted: false,
            name: { contains: 'audit', mode: 'insensitive' },
            members: { some: { userId: 'u1' } },
            client: { firm: { members: { some: { userId: 'u1' } } } },
        })
    })

    it('applies the getFirmHierarchy rule to clients', async () => {
        await quickSearch('con', 'acme')
        expect(prisma.client.findMany.mock.calls[0][0].where).toEqual({
            name: { contains: 'con', mode: 'insensitive' },
            firm: { members: { some: { userId: 'u1' } } },
            OR: [
                { members: { some: { userId: 'u1' } } },
                { engagements: { some: { isDeleted: false, members: { some: { userId: 'u1' } } } } },
            ],
        })
    })

    it('labels results from other firms and links them under their own firm', async () => {
        prisma.engagement.findMany.mockResolvedValue([
            { id: 'e9', name: 'FY26 Audit', slug: 'fy26', client: { name: 'Contoso', slug: 'contoso', firm: { id: 'f2', name: 'Beta LLP', slug: 'beta', group: { slug: 'bg' } } } },
        ])
        const [r] = await quickSearch('audit', 'acme')
        expect(r).toMatchObject({ kind: 'engagement', context: 'Contoso · Beta LLP', href: '/d/bg/f/beta/c/contoso/e/fy26' })
    })

    it('searches files only in the current firm, with the Doc Search scope, and escapes wildcards', async () => {
        prisma.$queryRaw.mockResolvedValue([{ id: 'd1', fileName: '50%_plan.pdf', isFolder: false, engagementSlug: 'fy26', engagementName: 'FY26 Audit', clientSlug: 'contoso' }])
        const results = await quickSearch('50%_', 'acme')
        expect(computeGlobalSearchAccessScope).toHaveBeenCalledWith('u1', 'f1')
        const values = prisma.$queryRaw.mock.calls[0].slice(1)
        expect(values).toContain('%50\\%\\_%')
        expect(values).toContainEqual(['e1'])
        expect(values).toContainEqual(['e2'])
        expect(results.find((r) => r.kind === 'file')).toMatchObject({ href: '/d/g/f/acme/c/contoso/e/fy26/files#doc-file:d1' })
    })

    it('skips file search for non-members, single characters, or callers with no engagements', async () => {
        await quickSearch('a', 'acme')
        prisma.firmMember.findFirst.mockResolvedValue(null)
        await quickSearch('audit', 'acme')
        prisma.firmMember.findFirst.mockResolvedValue({ id: 'm1' })
        scope.value = { isFirmAdmin: false, fullAccessEngagementIds: [], grantGatedEngagementIds: [] }
        await quickSearch('audit', 'acme')
        expect(prisma.$queryRaw).not.toHaveBeenCalled()
    })

    it('does not search files when no firm is in context', async () => {
        await quickSearch('audit', null)
        expect(prisma.$queryRaw).not.toHaveBeenCalled()
    })
})
