import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P2-37: the scope check behind bulk download and drive actions. A storage read that was refused used
 * to read as "not in this engagement" (its `.catch(() => null)`), so the person was refused with the
 * wrong reason. A refusal now throws the storage's reason; an item that's really gone is still "no".
 */

const prismaMock = vi.hoisted(() => ({
    engagement: { findUnique: vi.fn() },
    engagementDocument: { findFirst: vi.fn() },
    connector: { findUnique: vi.fn() },
}))
const adapter = vi.hoisted(() => ({ getFileMetadata: vi.fn(), getTrashState: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(async () => adapter) }))

import { isFileInEngagementTree } from './engagement-file-scope'
import { storageFailure, StorageFailure } from './storage-failure'

beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.engagement.findUnique.mockResolvedValue({ connectorRootFolderId: 'root' })
    prismaMock.engagementDocument.findFirst.mockResolvedValue(null)
    prismaMock.connector.findUnique.mockResolvedValue({ type: 'GOOGLE_DRIVE' })
})

describe('isFileInEngagementTree', () => {
    it('is true when the walk reaches the engagement root', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce({ id: 'f', name: 'f', parents: ['sub'] }).mockResolvedValueOnce({ id: 'sub', name: 'sub', parents: ['root'] })
        await expect(isFileInEngagementTree('e1', 'c1', 'f')).resolves.toBe(true)
    })

    it('is false for an item that is gone', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce(null)
        adapter.getTrashState.mockResolvedValueOnce('gone')
        await expect(isFileInEngagementTree('e1', 'c1', 'f')).resolves.toBe(false)
    })

    it('throws the storage reason when the read is refused, rather than answer "not in this engagement"', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce(null)
        const refusal = storageFailure('reconnect', 'Google Drive')
        adapter.getTrashState.mockRejectedValueOnce(refusal)
        await expect(isFileInEngagementTree('e1', 'c1', 'f')).rejects.toBe(refusal)
    })

    it('throws when metadata is missing for an item the storage says is there', async () => {
        prismaMock.connector.findUnique.mockResolvedValue({ type: 'ONEDRIVE' })
        adapter.getFileMetadata.mockResolvedValueOnce(null)
        adapter.getTrashState.mockResolvedValueOnce('restored')
        const err = await isFileInEngagementTree('e1', 'c1', 'f').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.message).toMatch(/OneDrive/)
    })

    it('lets a thrown metadata read through', async () => {
        const refusal = storageFailure('unreachable', 'OneDrive')
        adapter.getFileMetadata.mockRejectedValueOnce(refusal)
        await expect(isFileInEngagementTree('e1', 'c1', 'f')).rejects.toBe(refusal)
    })
})
