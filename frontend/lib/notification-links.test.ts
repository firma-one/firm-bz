import { describe, it, expect, vi } from 'vitest'
import { placeNotifications } from './notification-links'

const engagement = {
    name: 'Q2 GTM',
    slug: 'q2-gtm',
    client: { name: 'DataSentry', slug: 'datasentry', firm: { slug: 'firmaone', group: { slug: 'grp' } } },
}

function prismaWith(docs: unknown[], engagements: unknown[] = []) {
    return {
        engagementDocument: { findMany: vi.fn(async () => docs) },
        engagement: { findMany: vi.fn(async () => engagements) },
    }
}

describe('placeNotifications', () => {
    it('links a document notification stored without a link: a deliverable to its Board card, a document to Files', async () => {
        const prisma = prismaWith([
            { id: 'd-deliv', fileName: '02__GTM Playbook', isFolder: true, settings: { share: { createdAt: '2026-10-01T00:00:00Z' } }, engagement },
            { id: 'd-doc', fileName: 'Brief.pdf', isFolder: false, settings: {}, engagement },
        ])
        const [deliverable, document] = await placeNotifications(prisma, [
            { id: 'n1', documentId: 'd-deliv', engagementId: 'e1', ctaUrl: null },
            { id: 'n2', documentId: 'd-doc', engagementId: 'e1', ctaUrl: null },
        ])
        expect(deliverable).toMatchObject({ subject: 'deliverable', subjectName: '02__GTM Playbook', clientName: 'DataSentry', engagementName: 'Q2 GTM' })
        expect(deliverable.ctaUrl).toBe('/d/grp/f/firmaone/c/datasentry/e/q2-gtm/shares/board#doc-file:d-deliv')
        expect(document).toMatchObject({ subject: 'document', subjectName: 'Brief.pdf' })
        expect(document.ctaUrl).toBe('/d/grp/f/firmaone/c/datasentry/e/q2-gtm/files#doc-file:d-doc')
    })

    it('keeps a stored link, places an engagement-only row, and leaves the rest as they were', async () => {
        const prisma = prismaWith([], [{ id: 'e1', ...engagement }])
        const rows = await placeNotifications(prisma, [
            { id: 'n1', documentId: null, engagementId: 'e1', ctaUrl: '/d/members' },
            { id: 'n2', documentId: null, engagementId: null, ctaUrl: null },
        ])
        expect(rows[0]).toMatchObject({ subject: 'engagement', ctaUrl: '/d/members', clientName: 'DataSentry' })
        expect(rows[1]).toEqual({ id: 'n2', documentId: null, engagementId: null, ctaUrl: null })
    })

    it('leaves a row alone when its document can no longer be read, and never throws', async () => {
        expect(await placeNotifications(prismaWith([]), [{ id: 'n1', documentId: 'gone', ctaUrl: null }]))
            .toEqual([{ id: 'n1', documentId: 'gone', ctaUrl: null }])
        const failing = { engagementDocument: { findMany: vi.fn(async () => { throw new Error('rls') }) }, engagement: { findMany: vi.fn() } }
        expect(await placeNotifications(failing, [{ id: 'n1', documentId: 'd', ctaUrl: null }])).toEqual([{ id: 'n1', documentId: 'd', ctaUrl: null }])
    })
})
