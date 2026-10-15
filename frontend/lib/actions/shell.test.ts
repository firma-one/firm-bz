import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, auth } = vi.hoisted(() => ({
    prisma: {
        firm: { findUnique: vi.fn() },
        firmMember: { findFirst: vi.fn() },
        client: { findMany: vi.fn() },
        userPersonalization: { findUnique: vi.fn() },
    },
    auth: { user: { id: 'u1' } as { id: string } | null },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}))

import { getShellSidebarData } from './shell'

const FIRM = { id: 'f1', name: 'Acme', slug: 'acme', group: { slug: 'acme-group' } }

function client(id: string, engagements: { id: string; slug: string; role: string; status?: string }[]) {
    return {
        id, name: id.toUpperCase(), slug: id, status: 'ACTIVE',
        engagements: engagements.map((e) => ({
            id: e.id, name: e.id.toUpperCase(), slug: e.slug, status: e.status ?? 'ACTIVE', dueDate: null,
            members: [{ role: e.role }],
        })),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    prisma.firm.findUnique.mockResolvedValue(FIRM)
    prisma.firmMember.findFirst.mockResolvedValue({ role: 'firm_member' })
    prisma.client.findMany.mockResolvedValue([client('c1', [{ id: 'e1', slug: 'e-one', role: 'eng_member' }])])
    prisma.userPersonalization.findUnique.mockResolvedValue({ bookmarks: [] })
})

describe('getShellSidebarData — access', () => {
    it('returns nothing to a signed-out caller', async () => {
        auth.user = null
        expect(await getShellSidebarData('acme')).toBeNull()
        expect(prisma.client.findMany).not.toHaveBeenCalled()
    })

    it('returns nothing to a caller with no FirmMember row', async () => {
        prisma.firmMember.findFirst.mockResolvedValue(null)
        expect(await getShellSidebarData('acme')).toBeNull()
    })

    it('filters clients and engagements to the caller\'s own memberships (the getFirmHierarchy rule)', async () => {
        await getShellSidebarData('acme')
        const { where, select } = prisma.client.findMany.mock.calls[0][0]
        expect(where).toEqual({
            firmId: 'f1',
            OR: [
                { members: { some: { userId: 'u1' } } },
                { engagements: { some: { isDeleted: false, members: { some: { userId: 'u1' } } } } },
            ],
        })
        expect(select.engagements.where).toEqual({ isDeleted: false, members: { some: { userId: 'u1' } } })
        expect(select.engagements.select.members.where).toEqual({ userId: 'u1' })
    })

    it('builds engagement links under the firm\'s group', async () => {
        const data = await getShellSidebarData('acme')
        expect(data!.clients[0].engagements[0].href).toBe('/d/acme-group/f/acme/c/c1/e/e-one')
    })

    it('keeps only favorites on engagements the caller can see in this firm', async () => {
        prisma.userPersonalization.findUnique.mockResolvedValue({
            bookmarks: [
                { id: 'b1', kind: 'project', projectId: 'e1', label: 'Pinned engagement' },
                { id: 'b2', kind: 'document', projectId: 'e1', label: 'Letter.pdf', url: '/api/deeplink?doc=9' },
                { id: 'b3', kind: 'document', projectId: 'someone-elses-engagement', label: 'Leaky.pdf', url: '/x' },
                { id: 'b4', kind: 'url', url: 'https://example.com' },
            ],
        })
        const data = await getShellSidebarData('acme')
        expect(data!.favorites.map((f) => f.id)).toEqual(['b1', 'b2'])
        expect(data!.favorites[0].href).toBe('/d/acme-group/f/acme/c/c1/e/e-one')
        expect(data!.favorites[1]).toMatchObject({ href: '/api/deeplink?doc=9', context: 'E1' })
    })

    it('flags an EC/EV-only member as the client-facing view', async () => {
        prisma.client.findMany.mockResolvedValue([
            client('c1', [{ id: 'e1', slug: 'a', role: 'eng_viewer' }, { id: 'e2', slug: 'b', role: 'eng_ext_collaborator' }]),
        ])
        expect((await getShellSidebarData('acme'))!.isExternalOnly).toBe(true)
    })

    it('does not flag a user with any internal engagement role, or a firm admin', async () => {
        prisma.client.findMany.mockResolvedValue([
            client('c1', [{ id: 'e1', slug: 'a', role: 'eng_viewer' }, { id: 'e2', slug: 'b', role: 'eng_member' }]),
        ])
        expect((await getShellSidebarData('acme'))!.isExternalOnly).toBe(false)

        prisma.firmMember.findFirst.mockResolvedValue({ role: 'firm_admin' })
        prisma.client.findMany.mockResolvedValue([client('c1', [{ id: 'e1', slug: 'a', role: 'eng_viewer' }])])
        expect((await getShellSidebarData('acme'))!.isExternalOnly).toBe(false)
    })
})
