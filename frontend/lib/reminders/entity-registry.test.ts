/**
 * The platform.documents resolver selected `name`, but the column is `fileName`. Prisma rejected
 * the query, computeDueReminders swallowed the error, and every document reminder fell back to its
 * cached name with no link and no firmId — so firm-scoped views could not place it either.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const documentFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
    prisma: { engagementDocument: { findUnique: (...a: unknown[]) => documentFindUnique(...a) } },
}))

describe('platform.documents resolver', () => {
    beforeEach(() => {
        documentFindUnique.mockReset()
        documentFindUnique.mockResolvedValue({
            fileName: 'Q3 Board Pack.pdf',
            engagement: {
                slug: 'audit',
                client: { slug: 'acme', firm: { id: 'firm-1', slug: 'acme-advisory', group: { slug: 'grp' } } },
            },
        })
    })

    it('selects fileName and resolves the name, firm and link from it', async () => {
        const { resolveEntity } = await import('./entity-registry')
        // Stored reminders use the 3-segment key; it falls back to the table resolver.
        const ctx = await resolveEntity('platform.documents.id', 'doc-1')

        const { select } = documentFindUnique.mock.calls[0][0]
        expect(select).toHaveProperty('fileName', true)
        expect(select).not.toHaveProperty('name')

        expect(ctx).toMatchObject({ name: 'Q3 Board Pack.pdf', firmId: 'firm-1', firmSlug: 'acme-advisory' })
        expect(ctx?.ctaUrl).toBeTruthy()
    })
})
