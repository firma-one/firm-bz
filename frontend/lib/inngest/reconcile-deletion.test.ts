import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cleanup after "Move to trash" deletes the app's records for good, so when the trash came from
 * the Files list it first waits out the Undo window (.claude/plans/undo-move-to-bin.md).
 */

const { restored, prismaMock, revoke, notify, logged } = vi.hoisted(() => ({
    restored: { value: false as boolean | Error },
    revoke: vi.fn(async (..._args: unknown[]) => true),
    notify: vi.fn(async () => 1),
    logged: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
    wasRestoredFromBin: vi.fn(async () => {
        if (restored.value instanceof Error) throw restored.value
        return restored.value
    }),
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({ revokePermission: revoke, trashFile: vi.fn() }),
    getMigrationAdapter: vi.fn(),
    getConnectorInstance: vi.fn(),
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'client-conn' }))
vi.mock('@/lib/storage-access-notice', () => ({ notifyLeadsOfStorageAccess: notify }))
vi.mock('@/lib/logger', () => ({ logger: logged }))
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

describe("when storage can't say whether the item came back", () => {
    it.each([
        ['file', reconcileFileDeletion],
        ['folder', reconcileFolderDeletion],
    ])('the %s cleanup stops, so Inngest tries the check again, and deletes nothing', async (_kind, fn) => {
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        restored.value = storageFailure('unreachable', 'Google Drive')
        const s = step()
        await expect(handlerOf(fn)({ event: { data: { organizationId: 'f1', externalId: 'x', connectorId: 'conn', undoable: true } }, step: s })).rejects.toMatchObject({ reason: 'unreachable' })
        expect(SearchService.removeFile).not.toHaveBeenCalled()
        expect(prismaMock.engagementDocument.deleteMany).not.toHaveBeenCalled()
        expect(prismaMock.engagementDocumentSharingUser.deleteMany).not.toHaveBeenCalled()
    })
})

describe('the cleanup after the trash takes back what rows still hold', () => {
    const row = { id: 's1', userId: 'u1', engagementId: 'e1', connectorPermissionId: 'perm-1', document: { id: 'd1', fileName: 'Budget.xlsx', isFolder: false, externalId: 'x', connectorId: null } }

    beforeEach(() => {
        prismaMock.engagementDocument.findMany.mockResolvedValue([{ id: 'd1', settings: {}, connectorId: null, firmId: 'f1', engagementId: 'e1' }] as never)
        prismaMock.engagementDocumentSharingUser.findMany.mockResolvedValue([row] as never)
        revoke.mockReset()
    })

    it('revokes every permission a row still holds, whatever its status, through its connector', async () => {
        revoke.mockResolvedValue(true)
        await handlerOf(reconcileFileDeletion)({ event: { data: { organizationId: 'f1', externalId: 'x' } }, step: step() })
        expect((prismaMock.engagementDocumentSharingUser.findMany.mock.calls[0] as unknown[])[0]).toMatchObject({
            where: { projectDocumentId: { in: ['d1'] }, connectorPermissionId: { not: null } },
        })
        expect(revoke).toHaveBeenCalledWith('client-conn', 'x', 'perm-1')
        expect(notify).not.toHaveBeenCalled()
    })

    it('records what storage would not give up, with the file and the person, before the rows go', async () => {
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        const refusal = storageFailure('no_permission', 'Google Drive')
        revoke.mockRejectedValue(refusal)
        await handlerOf(reconcileFileDeletion)({ event: { data: { organizationId: 'f1', externalId: 'x' } }, step: step() })
        expect(logged.warn).toHaveBeenCalledWith('Trash cleanup could not take back storage access', {
            engagementId: 'e1',
            stillStanding: [{ file: 'Budget.xlsx', userId: 'u1', reason: refusal.message }],
        })
        expect(notify).toHaveBeenCalledWith('e1', [expect.objectContaining({ kind: 'revoke', itemName: 'Budget.xlsx', documentId: null, reason: refusal.message })])
        expect(prismaMock.engagementDocumentSharingUser.deleteMany).toHaveBeenCalled()
    })
})
