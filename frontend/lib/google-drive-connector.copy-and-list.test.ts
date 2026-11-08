import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
    prisma: { connector: { findUnique: vi.fn(async () => ({ id: 'conn-1', settings: {}, tokenExpiresAt: null })) } },
    basePrisma: {},
}))
vi.mock('./prisma', () => ({
    prisma: { connector: { findUnique: vi.fn(async () => ({ id: 'conn-1', settings: {}, tokenExpiresAt: null })) } },
    basePrisma: {},
}))

import { GoogleDriveConnector } from './google-drive-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'

// Folder copy and import keep what worked and say what didn't, with Drive's reason; a folder of more
// than one page is copied whole. The Files list hears "no longer available" for a folder that's gone.

const g = GoogleDriveConnector.getInstance()
const FOLDER = 'application/vnd.google-apps.folder'

const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response

afterEach(() => { vi.restoreAllMocks() })

describe('recursiveCopy', () => {
    it('reads every page of a folder, keeps what copied and names what Drive refused, with why', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/files/root-folder?')) return json({ id: 'root-folder', name: 'Acme Reports', mimeType: FOLDER })
            if (url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && init?.method === 'POST') {
                return json({ id: 'new-folder', name: 'Acme Reports' })
            }
            if (url.includes('/drive/v3/files?q=')) {
                return url.includes('pageToken=p2')
                    ? json({ files: [{ id: 'f3', name: 'Q3.pdf', mimeType: 'application/pdf' }] })
                    : json({ nextPageToken: 'p2', files: [{ id: 'f1', name: 'Budget.xlsx', mimeType: 'x' }, { id: 'f2', name: 'Notes.docx', mimeType: 'y' }] })
            }
            if (url.includes('/files/f1/copy')) return json({ error: { code: 403, message: 'The file is locked', errors: [{ reason: 'locked' }] } }, 403)
            if (url.includes('/copy')) return json({ id: `copy-of-${url.split('/files/')[1].split('/')[0]}` })
            return json({}, 404)
        })

        const outcome = await g.recursiveCopy('root-folder', 'dest', 'token')

        expect(outcome.filesTotal).toBe(3)
        expect(outcome.filesCopied).toBe(2)
        expect(outcome.copied.map((c) => c.name)).toEqual(['Acme Reports', 'Notes.docx', 'Q3.pdf'])
        expect(outcome.failed).toHaveLength(1)
        expect(outcome.failed[0].name).toBe('Budget.xlsx')
        expect(outcome.failed[0].reason).toContain('Google Drive has this locked')
        // The second page was asked for.
        expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('pageToken=p2'))).toBe(true)
    })

    it('throws the reason when the picked item itself cannot be read', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { code: 404, message: 'File not found' } }, 404))
        await expect(g.recursiveCopy('gone', 'dest', 'token')).rejects.toBeInstanceOf(StorageFailure)
    })

    it('counts a folder it could not list, rather than calling it copied', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/files/root-folder?')) return json({ id: 'root-folder', name: 'Acme', mimeType: FOLDER })
            if (init?.method === 'POST') return json({ id: 'new-folder', name: 'Acme' })
            return json({ error: { code: 429, message: 'Rate limit exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }, 429)
        })
        const outcome = await g.recursiveCopy('root-folder', 'dest', 'token')
        expect(outcome.failed).toEqual([{ name: "What's in Acme", reason: expect.stringContaining('busy') }])
    })
})

describe('listFiles', () => {
    beforeEach(() => {
        vi.spyOn(g as unknown as { getAccessTokenFromConnector: () => string }, 'getAccessTokenFromConnector').mockReturnValue('token')
        vi.spyOn(g, 'resolveIgnoreIds').mockResolvedValue([])
    })

    it('a folder that is gone lists as empty for tree walks, and as "no longer available" for the Files list', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { code: 404 } }, 404))
        await expect(g.listFiles('conn-1', 'gone')).resolves.toEqual([])
        await expect(g.listFiles('conn-1', 'gone', 100, undefined, null, { missingFolder: 'throw' }))
            .rejects.toMatchObject({ reason: 'not_found', message: expect.stringContaining('no longer available in Google Drive') })
    })

    it('a folder in the trash is no longer available, not empty', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) =>
            String(input).includes('fields=id,trashed') ? json({ id: 'f', trashed: true }) : json({ files: [] }))
        await expect(g.listFiles('conn-1', 'f', 100, undefined, null, { missingFolder: 'throw' })).rejects.toMatchObject({ reason: 'not_found' })
    })

    it("a refusal says Drive's reason instead of an HTTP status", async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { code: 403, message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } }, 403))
        await expect(g.listFiles('conn-1', 'f')).rejects.toMatchObject({ reason: 'no_permission' })
    })
})
