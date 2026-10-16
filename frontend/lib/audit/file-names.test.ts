import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma } = vi.hoisted(() => ({ prisma: { engagementDocument: { findMany: vi.fn() } } }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma }))

import { recordedFileName, withResolvedFileNames } from './file-names'

const ev = (over: Partial<{ engagementId: string | null; projectDocumentId: string | null; metadata: unknown }>) => ({
    engagementId: 'eng-1',
    projectDocumentId: null,
    metadata: {},
    ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('recordedFileName', () => {
    it('reads either key routes have used, and nothing else', () => {
        expect(recordedFileName({ fileName: 'Report.docx' })).toBe('Report.docx')
        expect(recordedFileName({ filename: 'Report.pdf' })).toBe('Report.pdf')
        expect(recordedFileName({ externalId: 'x', mimeType: 'text/plain' })).toBeNull()
        expect(recordedFileName(null)).toBeNull()
    })
})

describe('withResolvedFileNames', () => {
    it('queries nothing when every event already names its file', async () => {
        const events = [ev({ metadata: { fileName: 'a.docx' } }), ev({ metadata: { filename: 'b.pdf' } })]
        expect(await withResolvedFileNames(events, 'firm-1')).toBe(events)
        expect(prisma.engagementDocument.findMany).not.toHaveBeenCalled()
    })

    it('names an old preview open from its external id, within its own engagement and firm', async () => {
        prisma.engagementDocument.findMany.mockResolvedValue([
            { id: 'doc-1', externalId: 'drive-1', engagementId: 'eng-1', fileName: 'dummy-100-records.json' },
        ])
        const [out] = await withResolvedFileNames([ev({ metadata: { externalId: 'drive-1', mimeType: 'application/json' } })], 'firm-1')
        expect(out.metadata).toEqual({ externalId: 'drive-1', mimeType: 'application/json', fileName: 'dummy-100-records.json' })
        expect(prisma.engagementDocument.findMany.mock.calls[0][0].where).toEqual({
            engagementId: { in: ['eng-1'] },
            firmId: 'firm-1',
            OR: [{ externalId: { in: ['drive-1'] } }],
        })
    })

    it('names an event linked to its document', async () => {
        prisma.engagementDocument.findMany.mockResolvedValue([
            { id: 'doc-9', externalId: 'drive-9', engagementId: 'eng-1', fileName: 'Letter.pdf' },
        ])
        const [out] = await withResolvedFileNames([ev({ projectDocumentId: 'doc-9', metadata: { usedPdf: true } })])
        expect(out.metadata).toMatchObject({ fileName: 'Letter.pdf' })
    })

    it('never takes a name from another engagement\'s file with the same external id', async () => {
        prisma.engagementDocument.findMany.mockResolvedValue([
            { id: 'doc-2', externalId: 'drive-1', engagementId: 'eng-2', fileName: 'Someone else.docx' },
        ])
        const events = [ev({ metadata: { externalId: 'drive-1' } })]
        const [out] = await withResolvedFileNames(events, 'firm-1')
        expect(out.metadata).toEqual({ externalId: 'drive-1' })
    })

    it('leaves an event alone when its file is gone', async () => {
        prisma.engagementDocument.findMany.mockResolvedValue([])
        const [out] = await withResolvedFileNames([ev({ metadata: { externalId: 'deleted' } })])
        expect(out.metadata).toEqual({ externalId: 'deleted' })
    })
})
