import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adapter } = vi.hoisted(() => ({
    adapter: { getFileMetadata: vi.fn(async (..._args: unknown[]): Promise<any> => null) },
}))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(async () => adapter) }))

import { wasRestoredFromBin } from './trash-undo'

beforeEach(() => adapter.getFileMetadata.mockReset())

describe('wasRestoredFromBin', () => {
    it('is true only when the provider says the item is out of the trash', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce({ id: 'f', name: 'f', trashed: false })
        expect(await wasRestoredFromBin('conn', 'f')).toBe(true)
    })

    it('is false while the item is still in the trash', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce({ id: 'f', name: 'f', trashed: true })
        expect(await wasRestoredFromBin('conn', 'f')).toBe(false)
    })

    it('is false when the item is gone or the provider can\'t be reached, so the cleanup runs', async () => {
        adapter.getFileMetadata.mockResolvedValueOnce(null)
        expect(await wasRestoredFromBin('conn', 'f')).toBe(false)
        adapter.getFileMetadata.mockRejectedValueOnce(new Error('network'))
        expect(await wasRestoredFromBin('conn', 'f')).toBe(false)
    })
})
