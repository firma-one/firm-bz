import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { useEngagementFileOps } from './use-engagement-file-ops'

const FILE = { id: 'drive-1', name: 'podcast-ep04.jpg', mimeType: 'image/jpeg', connectorId: 'conn' } as any

let requests: { action: string; fileId: string }[] = []

beforeEach(() => {
    vi.useFakeTimers()
    addToast.mockReset()
    requests = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        requests.push(JSON.parse(init!.body as string))
        return { ok: true, json: async () => ({ success: true }) } as Response
    }))
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup(opts: { canUndoTrash?: boolean; storageBinName?: string } = {}) {
    const fetchFiles = vi.fn(async () => {})
    const { result } = renderHook(() => useEngagementFileOps({
        sessionRef: { current: { access_token: 't' } },
        projectId: 'e1',
        currentFolderIdRef: { current: 'folder-1' },
        currentFolderType: 'general',
        generalFolderId: 'folder-1',
        confidentialFolderId: null,
        stagingFolderId: null,
        fetchFiles,
        fetchSharedIds: vi.fn(),
        startProcessing: vi.fn(),
        stopProcessing: vi.fn(),
        setFiles: vi.fn(),
        ...opts,
    }))
    return { result, fetchFiles }
}

/** Moves the file to the trash the way the UI does: open the confirmation, wait, confirm. */
async function moveToBin(result: { current: ReturnType<typeof useEngagementFileOps> }) {
    act(() => { result.current.handleTrash(FILE) })
    act(() => { vi.advanceTimersByTime(700) })
    await act(async () => { await result.current.handleTrashConfirmed() })
}

describe('Moved to trash — Undo', () => {
    it('offers Undo, which takes the file back out of the trash and refreshes the list', async () => {
        const { result, fetchFiles } = setup({ canUndoTrash: true })
        await moveToBin(result)
        const toast = addToast.mock.calls[0][0]
        expect(toast).toMatchObject({ title: 'Moved to trash', message: 'podcast-ep04.jpg moved to Google Drive trash', action: { label: 'Undo' } })

        await act(async () => { toast.action.onClick() })
        await act(async () => { await Promise.resolve() })
        expect(requests.map((r) => r.action)).toEqual(['trash', 'restore'])
        expect(requests[1]).toMatchObject({ fileId: 'drive-1', projectId: 'e1' })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Restored' }))
        expect(fetchFiles).toHaveBeenLastCalledWith('folder-1', true)
    })

    it('has no Undo where the provider can\'t restore, and names its trash', async () => {
        const { result } = setup({ canUndoTrash: false, storageBinName: 'Recycle bin' })
        await moveToBin(result)
        const toast = addToast.mock.calls[0][0]
        expect(toast.message).toBe('podcast-ep04.jpg moved to Recycle bin')
        expect(toast.action).toBeUndefined()
    })
})
