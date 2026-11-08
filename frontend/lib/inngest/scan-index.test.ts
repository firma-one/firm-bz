import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P2-38: the search index scan. A folder it couldn't list used to be skipped (`catch { // skip }`), so its
 * files were missing from search for good and nothing retried. A failed read now fails the step, and
 * Inngest retries it; a folder that's simply empty (or gone, which both storages list as empty) doesn't.
 */

const adapter = vi.hoisted(() => ({ getFileMetadata: vi.fn(), listFiles: vi.fn() }))
const indexFile = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: vi.fn() } } }) }))
vi.mock('@/lib/connectors/trash-undo', () => ({ TRASH_UNDO_WINDOW_SECONDS: 60, wasRestoredFromBin: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { indexFile } }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(async () => adapter), getMigrationAdapter: vi.fn(), getConnectorInstance: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { scanAndIndexProject } from './functions'
import { storageFailure } from '@/lib/connectors/storage-failure'

type Handler = (ctx: { event: { data: Record<string, unknown> }; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>
const handler = (scanAndIndexProject as unknown as { handler: Handler }).handler
const step = { run: (_name: string, fn: () => Promise<unknown>) => fn() }
const event = { data: { organizationId: 'o1', clientId: 'c1', projectId: 'p1', connectorId: 'k1', rootFolderIds: ['root'] } }

beforeEach(() => {
    vi.clearAllMocks()
    adapter.getFileMetadata.mockResolvedValue({ id: 'root', name: 'General', parents: ['eng'] })
})

describe('scan-and-index-project', () => {
    it('fails the step when a folder listing is refused, so Inngest retries it', async () => {
        const refusal = storageFailure('busy', 'OneDrive')
        adapter.listFiles.mockRejectedValueOnce(refusal)
        await expect(handler({ event, step })).rejects.toBe(refusal)
        expect(indexFile).not.toHaveBeenCalled()
    })

    it('fails the step when a root folder read throws', async () => {
        const refusal = storageFailure('reconnect', 'Google Drive')
        adapter.getFileMetadata.mockRejectedValueOnce(refusal)
        await expect(handler({ event, step })).rejects.toBe(refusal)
    })

    it('indexes what it finds, walking into subfolders', async () => {
        adapter.listFiles
            .mockResolvedValueOnce([{ id: 'sub', name: 'Drafts', mimeType: 'application/vnd.google-apps.folder' }, { id: 'f1', name: 'Plan.docx' }])
            .mockResolvedValueOnce([])
        await expect(handler({ event, step })).resolves.toEqual(expect.objectContaining({ projectId: 'p1' }))
        expect(indexFile.mock.calls.map(([f]) => f.externalId)).toEqual(['root', 'sub', 'f1'])
    })
})
