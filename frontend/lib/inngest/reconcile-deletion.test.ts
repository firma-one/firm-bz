import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cleanup after "Move to trash" deletes the app's records for good, so when the trash came from
 * the Files list it first waits out the Undo window (.claude/plans/undo-move-to-bin.md).
 */

const { restored, prismaMock } = vi.hoisted(() => ({
    restored: { value: false },
    prismaMock: {
        engagementDocument: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null), deleteMany: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
        engagementDocumentSharingUser: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({})) },
        firm: { findUnique: vi.fn(async () => null) },
    },
}))

// Each function's handler, as the Inngest client would receive it.
vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/connectors/trash-undo', () => ({
    TRASH_UNDO_WINDOW_SECONDS: 60,
    wasRestoredFromBin: vi.fn(async () => restored.value),
}))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { removeFile: vi.fn(async () => {}) } }))

import { reconcileFileDeletion, reconcileFolderDeletion } from './functions'
import { SearchService } from '@/lib/services/search-service'

const step = () => ({ sleep: vi.fn(async () => {}), run: vi.fn(async (_id: string, fn: () => unknown) => fn()) })
const handlerOf = (fn: unknown) => (fn as { handler: (ctx: unknown) => Promise<any> }).handler

beforeEach(() => {
    vi.clearAllMocks()
    restored.value = false
})

describe.each([
    ['file', reconcileFileDeletion],
    ['folder', reconcileFolderDeletion],
])('%s deletion cleanup', (_kind, fn) => {
    it('waits out the Undo window, and keeps everything if the item came back', async () => {
        restored.value = true
        const s = step()
        const result = await handlerOf(fn)({ event: { data: { organizationId: 'f1', externalId: 'x', connectorId: 'conn', undoable: true } }, step: s })
        expect(s.sleep).toHaveBeenCalledWith('undo-window', '60s')
        expect(result.status).toBe('restored')
        expect(SearchService.removeFile).not.toHaveBeenCalled()
    })

    it('cleans up after the window when the item is still in the trash', async () => {
        const s = step()
        const result = await handlerOf(fn)({ event: { data: { organizationId: 'f1', externalId: 'x', connectorId: 'conn', undoable: true } }, step: s })
        expect(s.sleep).toHaveBeenCalled()
        expect(result.status).toBe('reconciled')
        expect(SearchService.removeFile).toHaveBeenCalledWith('f1', 'x')
    })

    it('cleans up at once for deletions that cannot be undone', async () => {
        const s = step()
        await handlerOf(fn)({ event: { data: { organizationId: 'f1', externalId: 'x' } }, step: s })
        expect(s.sleep).not.toHaveBeenCalled()
        expect(SearchService.removeFile).toHaveBeenCalledWith('f1', 'x')
    })
})
