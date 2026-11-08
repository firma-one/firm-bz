import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adapter, st } = vi.hoisted(() => ({
    adapter: { getTrashState: vi.fn(async (..._args: unknown[]): Promise<any> => 'gone') },
    st: { hasAdapter: true },
}))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(async () => (st.hasAdapter ? adapter : null)) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { wasRestoredFromBin } from './trash-undo'
import { storageFailure } from './storage-failure'

const NO_PAUSE = { pauseMs: 0 }

beforeEach(() => {
    adapter.getTrashState.mockReset()
    st.hasAdapter = true
})

describe('wasRestoredFromBin', () => {
    it('is true only when the provider says the item is out of the trash', async () => {
        adapter.getTrashState.mockResolvedValueOnce('restored')
        expect(await wasRestoredFromBin('conn', 'f', NO_PAUSE)).toBe(true)
    })

    it('is false while the item is still in the trash, or gone for good, so the cleanup runs', async () => {
        adapter.getTrashState.mockResolvedValueOnce('trashed')
        expect(await wasRestoredFromBin('conn', 'f', NO_PAUSE)).toBe(false)
        adapter.getTrashState.mockResolvedValueOnce('gone')
        expect(await wasRestoredFromBin('conn', 'f', NO_PAUSE)).toBe(false)
    })

    it('asks again when the provider could not be reached, and goes by the answer it gets', async () => {
        adapter.getTrashState
            .mockRejectedValueOnce(storageFailure('unreachable', 'Google Drive'))
            .mockResolvedValueOnce('restored')
        expect(await wasRestoredFromBin('conn', 'f', NO_PAUSE)).toBe(true)
        expect(adapter.getTrashState).toHaveBeenCalledTimes(2)
    })

    it("never takes \"couldn't reach the storage\" for \"still trashed\": it throws, so the cleanup waits", async () => {
        const unreachable = storageFailure('unreachable', 'OneDrive')
        adapter.getTrashState.mockRejectedValue(unreachable)
        await expect(wasRestoredFromBin('conn', 'f', NO_PAUSE)).rejects.toBe(unreachable)
        expect(adapter.getTrashState).toHaveBeenCalledTimes(3)
    })

    it('is false when no connector is left to bring it back through', async () => {
        st.hasAdapter = false
        expect(await wasRestoredFromBin('conn', 'f', NO_PAUSE)).toBe(false)
    })
})
