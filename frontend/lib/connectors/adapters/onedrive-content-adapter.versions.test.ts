import { describe, it, expect, vi, beforeEach } from 'vitest'

// Graph's version list and version download, behind the content adapter (2026-10-28). The token
// and drive base are stubbed and fetch is mocked: nothing reaches a real drive.

vi.mock('@/lib/connectors/onedrive-connector', () => ({
    OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token-abc' }) },
}))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph.example/v1.0/me/drive' }))
vi.mock('@/lib/spreadsheet-print-trim', () => ({ trimWorkbookToUsedRange: vi.fn(), isSpreadsheetMime: () => false }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { createOneDriveContentAdapter } from './onedrive-content-adapter'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fetchMock = vi.fn()
beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})

describe('OneDrive content adapter — versions', () => {
    it('lists Graph versions oldest first, in the shape the Version history pane reads', async () => {
        fetchMock.mockResolvedValueOnce(json({
            value: [
                { id: '3.0', lastModifiedDateTime: '2026-10-27T10:00:00Z', size: 300, lastModifiedBy: { user: { displayName: 'Ana' } } },
                { id: '2.0', lastModifiedDateTime: '2026-10-20T10:00:00Z', size: 200, lastModifiedBy: { user: { displayName: 'Ben' } } },
                { id: '1.0', lastModifiedDateTime: '2026-10-01T10:00:00Z', size: 100 },
            ],
        }))
        const versions = await createOneDriveContentAdapter().listVersions!('conn1', 'item1')
        expect(fetchMock.mock.calls[0][0]).toBe('https://graph.example/v1.0/me/drive/items/item1/versions')
        expect(versions.map((v) => v.id)).toEqual(['1.0', '2.0', '3.0'])
        expect(versions[2]).toEqual({ id: '3.0', mimeType: '', modifiedTime: '2026-10-27T10:00:00Z', size: '300', lastModifyingUser: { displayName: 'Ana' } })
        expect(versions[0].lastModifyingUser).toBeUndefined()
    })

    it('says a missing file is not found', async () => {
        fetchMock.mockResolvedValueOnce(json({ error: {} }, 404))
        await expect(createOneDriveContentAdapter().listVersions!('conn1', 'gone')).rejects.toMatchObject({ code: 'not_found' })
    })

    it("downloads an earlier version's bytes under the file's own name and type", async () => {
        fetchMock
            .mockResolvedValueOnce(json({ id: 'item1', name: 'Plan.xlsx', file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }))
            .mockResolvedValueOnce(new Response(Buffer.from('old-bytes'), { status: 200 }))
        const v = await createOneDriveContentAdapter().getVersionContent!('conn1', 'item1', '2.0')
        expect(fetchMock.mock.calls[1][0]).toBe('https://graph.example/v1.0/me/drive/items/item1/versions/2.0/content')
        expect(v.fileName).toBe('Plan.xlsx')
        expect(v.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        expect(Buffer.from(v.stream as Buffer).toString()).toBe('old-bytes')
    })
})
