import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma } = vi.hoisted(() => ({
    prisma: {
        userPersonalization: { findUnique: vi.fn() },
        engagement: { findMany: vi.fn() },
    },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { getHomeBookmarks } from './bookmarks'

const ACME = { id: 'f1', name: 'Acme', slug: 'acme', groupSlug: 'g' }
const BETA = { id: 'f2', name: 'Beta', slug: 'beta', groupSlug: 'h' }

beforeEach(() => vi.clearAllMocks())

describe('getHomeBookmarks', () => {
    it('keeps bookmarks on engagements the caller belongs to in the given firms, linked under each firm', async () => {
        prisma.userPersonalization.findUnique.mockResolvedValue({
            bookmarks: [
                { id: 'b1', kind: 'project', projectId: 'e1', label: 'Pinned' },
                { id: 'b2', kind: 'document', projectId: 'e2', documentId: 'd9', label: 'Letter.pdf' },
                { id: 'b3', kind: 'document', projectId: 'gone', label: 'Leaky.pdf' },
                { id: 'b4', kind: 'url', url: 'https://example.com' },
            ],
        })
        prisma.engagement.findMany.mockResolvedValue([
            { id: 'e1', name: 'Audit', slug: 'audit', client: { name: 'Contoso', slug: 'contoso', firmId: 'f1' } },
            { id: 'e2', name: 'Tax', slug: 'tax', client: { name: 'Globex', slug: 'globex', firmId: 'f2' } },
        ])

        const out = await getHomeBookmarks('u1', [ACME, BETA])
        expect(out.map((b) => b.id)).toEqual(['b1', 'b2'])
        expect(out[0]).toEqual({ id: 'b1', kind: 'project', label: 'Pinned', href: '/d/g/f/acme/c/contoso/e/audit', context: 'Contoso', firmId: 'f1' })
        expect(out[1]).toMatchObject({ context: 'Tax', firmId: 'f2' })
        expect(out[1].href).toMatch(/^\/d\/h\/f\/beta\/c\/globex\/e\/tax\/.*d9/)

        const where = prisma.engagement.findMany.mock.calls[0][0].where
        expect(where).toEqual({
            id: { in: ['e1', 'e2', 'gone'] },
            isDeleted: false,
            client: { firmId: { in: ['f1', 'f2'] } },
            members: { some: { userId: 'u1' } },
        })
    })

    it('reads nothing without firms or bookmarks', async () => {
        expect(await getHomeBookmarks('u1', [])).toEqual([])
        expect(prisma.userPersonalization.findUnique).not.toHaveBeenCalled()

        prisma.userPersonalization.findUnique.mockResolvedValue({ bookmarks: [{ id: 'b4', kind: 'url', url: 'https://x' }] })
        expect(await getHomeBookmarks('u1', [ACME])).toEqual([])
        expect(prisma.engagement.findMany).not.toHaveBeenCalled()
    })
})
