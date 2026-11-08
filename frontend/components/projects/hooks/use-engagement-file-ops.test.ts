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
async function moveToBin(result: { current: ReturnType<typeof useEngagementFileOps> }, doc = FILE) {
    act(() => { result.current.handleTrash(doc) })
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

describe('a failed action says why', () => {
    const REASON = 'OneDrive has this locked, usually because a file is open in Word, Excel or another app.'
    const LINK = { ...FILE, documentType: 'LINK' }

    /** The billing gate lets it through; anything else gets this answer. */
    function everyAction(answer: () => Promise<Response>) {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.startsWith('/api/billing/document-gate')) return { ok: true, json: async () => ({ allowed: true }) } as Response
            return answer()
        }))
    }
    const refused = async () => ({ ok: false, status: 409, json: async () => ({ error: REASON }) }) as Response
    const noReason = async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('not JSON') } }) as unknown as Response
    const offline = async () => { throw new TypeError('Failed to fetch') }

    const ACTIONS: [string, string, (r: { current: ReturnType<typeof useEngagementFileOps> }) => Promise<unknown>][] = [
        ['duplicating', 'Duplicate failed', (r) => act(async () => { await r.current.handleDuplicate(FILE) })],
        ['moving to the trash', 'Move to trash failed', (r) => moveToBin(r)],
        ['deleting a link', 'Delete failed', (r) => moveToBin(r, LINK)],
        ['moving to another area', 'Move failed', (r) => act(async () => { await r.current.handleMoveTree(FILE, 'confidential') })],
    ]

    it.each(ACTIONS)("%s shows the server's reason", async (_name, title, run) => {
        everyAction(refused)
        const { result } = setup()
        await run(result)
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title, message: REASON })
    })

    it.each(ACTIONS)('%s still gives a reason when the answer has none', async (_name, title, run) => {
        everyAction(noReason)
        const { result } = setup()
        await run(result)
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title, message: 'The server answered 500. Try again.' })
    })

    it.each(ACTIONS)('%s says so when the request never got there', async (_name, title, run) => {
        everyAction(offline)
        const { result } = setup()
        await run(result)
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title, message: "Couldn't reach firma. Check your connection and try again." })
    })
})

describe('Move/Copy picker — look-ahead', () => {
    const folder = (id: string, name: string) => ({ id, name, mimeType: 'application/vnd.google-apps.folder' })
    // folder-1 (General) holds A and B; A holds A1; B and A1 hold no folders.
    const tree: Record<string, ReturnType<typeof folder>[]> = {
        'folder-1': [folder('A', 'Reports'), folder('B', 'Internal')],
        A: [folder('A1', 'Q3')],
        B: [],
        A1: [],
    }

    beforeEach(() => {
        vi.useRealTimers()
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(init!.body as string)
            requests.push(body)
            return { ok: true, json: async () => ({ files: tree[body.folderId] ?? [] }) } as Response
        }))
    })

    const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) })

    it('knows which folders have no subfolders before any click, and opens a folder without asking again', async () => {
        const { result } = setup()
        act(() => { result.current.openCopyMoveModal(FILE, 'copy') })
        await settle()
        expect(result.current.destinationFolders.map((f) => f.id)).toEqual(['A', 'B'])
        expect(Array.from(result.current.emptyFolderIds)).toEqual(['B'])
        expect(Array.from(result.current.subfolderIds)).toEqual(['A'])

        const listed = requests.length
        await act(async () => { await result.current.handleNavigateIntoFolder(folder('A', 'Reports') as any) })
        await settle()
        expect(result.current.destinationFolders.map((f) => f.id)).toEqual(['A1'])
        // Opening A used what the look-ahead fetched; only A's own children (A1) were looked up.
        expect(requests.slice(listed).map((r: any) => r.folderId)).toEqual(['A1'])
        expect(result.current.emptyFolderIds.has('A1')).toBe(true)
        expect(addToast).not.toHaveBeenCalled()
    })

    it('a failed lookup leaves the folder openable instead of marking it empty', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(init!.body as string)
            if (body.folderId === 'B') return { ok: false, status: 500, json: async () => ({}) } as Response
            return { ok: true, json: async () => ({ files: tree[body.folderId] ?? [] }) } as Response
        }))
        const { result } = setup()
        act(() => { result.current.openCopyMoveModal(FILE, 'copy') })
        await settle()
        expect(result.current.emptyFolderIds.has('B')).toBe(false)
        expect(result.current.subfolderIds.has('B')).toBe(false)
    })
})

describe('Move/Copy to folder — one item or the selection', () => {
    const file = (id: string, name: string) => ({ id, name, mimeType: 'image/png', connectorId: 'conn' }) as any
    const A = file('a', 'a.png'), B = file('b', 'b.png'), C = file('c', 'c.png')
    let gateUrls: string[] = []

    function stubDrive(failIds: string[] = []) {
        gateUrls = []
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (url.startsWith('/api/billing/document-gate')) {
                gateUrls.push(url)
                return { ok: true, json: async () => ({ allowed: true }) } as Response
            }
            const body = JSON.parse(init!.body as string)
            requests.push(body)
            if (body.action === 'list') return { ok: true, json: async () => ({ files: [] }) } as Response
            if (failIds.includes(body.fileId)) return { ok: false, json: async () => ({ error: 'Drive said no' }) } as Response
            return { ok: true, json: async () => ({ success: true }) } as Response
        }))
    }

    function setupWithRemoval() {
        const onItemRemoved = vi.fn()
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
            onItemRemoved,
        }))
        return { result, onItemRemoved, fetchFiles }
    }

    const moves = () => requests.filter((r: any) => r.action === 'move' || r.action === 'copy')

    beforeEach(() => { vi.useRealTimers() })

    it('a moved file leaves the list, and the list refreshes', async () => {
        stubDrive()
        const { result, onItemRemoved, fetchFiles } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal(A, 'move') })
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(onItemRemoved).toHaveBeenCalledWith('a')
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'success', title: 'Moved', message: 'a.png moved successfully' }))
        expect(result.current.copyMoveModalOpen).toBe(false)
        expect(fetchFiles).toHaveBeenLastCalledWith('folder-1', true)
    })

    it('moves every selected item to the picked folder, in one toast', async () => {
        stubDrive()
        const { result, onItemRemoved } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal([A, B, C], 'move') })
        expect(result.current.copyMoveTargets.map((t) => t.id)).toEqual(['a', 'b', 'c'])
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(moves().map((r: any) => [r.fileId, r.destinationFolderId])).toEqual([['a', 'dest'], ['b', 'dest'], ['c', 'dest']])
        expect(onItemRemoved.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b', 'c'])
        expect(addToast).toHaveBeenCalledTimes(1)
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'success', message: '3 items moved' }))
        expect(result.current.copyMoveTargets).toEqual([])
    })

    it('names what could not be moved, and keeps the rest moved', async () => {
        stubDrive(['b'])
        const { result, onItemRemoved } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal([A, B, C], 'move') })
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(onItemRemoved.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'c'])
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', title: '2 of 3 moved', message: 'Couldn’t move b.png: Drive said no' }))
        expect(result.current.copyMoveModalOpen).toBe(false)
    })

    it('keeps the picker open when nothing could be moved', async () => {
        stubDrive(['a'])
        const { result, onItemRemoved } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal(A, 'move') })
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(onItemRemoved).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', message: 'Drive said no' }))
        expect(result.current.copyMoveModalOpen).toBe(true)
    })

    it.each([['copy', 'Copy failed'], ['move', 'Move failed']] as const)('titles a failed %s, and gives the reason', async (action, title) => {
        stubDrive(['a'])
        const { result } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal(A, action) })
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', title, message: 'Drive said no' }))
    })

    it('says so when a move never got there', async () => {
        stubDrive()
        const answering = vi.mocked(fetch).getMockImplementation()!
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.body && JSON.parse(init.body as string).action === 'move') throw new TypeError('Failed to fetch')
            return answering(url, init)
        }))
        const { result } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal(A, 'move') })
        await act(async () => { await result.current.handleCopyMoveToFolder('dest') })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Move failed', message: "Couldn't reach firma. Check your connection and try again." }))
    })

    it('does nothing to items moved into the folder they are already in', async () => {
        stubDrive()
        const { result, onItemRemoved } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal([A, B], 'move') })
        await act(async () => { await result.current.handleCopyMoveToFolder('folder-1') })
        expect(moves()).toEqual([])
        expect(onItemRemoved).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'info', title: 'Already here' }))
    })

    it('checks the plan limit for every file a bulk copy adds, and leaves the copies\' sources listed', async () => {
        stubDrive()
        const { result, onItemRemoved } = setupWithRemoval()
        act(() => { result.current.openCopyMoveModal([A, B], 'copy') })
        await act(async () => { await result.current.handleCopyMoveToFolder('folder-1') })
        expect(gateUrls).toEqual(['/api/billing/document-gate?projectId=e1&count=2'])
        expect(moves().map((r: any) => [r.action, r.fileId])).toEqual([['copy', 'a'], ['copy', 'b']])
        expect(onItemRemoved).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'success', title: 'Copied', message: '2 items copied' }))
    })
})

describe('answers that only partly worked, or that failed to load', () => {
    const answer = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, clone() { return this } }) as unknown as Response
    const respond = (fn: (url: string, init?: RequestInit) => Response) => vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => fn(String(url), init))

    it('an Unlock that leaves it locked says so, as a warning, not "Unlocked"', async () => {
        respond(() => answer(200, { ok: true, unlocked: false, warning: "Google Drive wouldn't give ana@client.com edit access back. It stays locked until then. Try Unlock again." }))
        const { result } = setup()
        await act(async () => { await result.current.handleUnlockFromBadge({ ...FILE, projectDocumentId: 'd1' }) })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'warning', title: 'Still locked', message: expect.stringContaining('It stays locked') }))
        expect(addToast.mock.calls.some(([t]) => t.title === 'Returned to Draft')).toBe(false)
    })

    it('a refused Unlock names the action and says why', async () => {
        respond(() => answer(502, { error: "Couldn't unlock this · The connection to Google Drive needs renewing." }))
        const { result } = setup()
        await act(async () => { await result.current.handleUnlockFromBadge({ ...FILE, projectDocumentId: 'd1' }) })
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title: 'Return to draft failed', message: "Couldn't unlock this · The connection to Google Drive needs renewing." })
    })

    it('a refused Reject keeps the row and never says "has been removed"', async () => {
        respond(() => answer(409, { error: 'Google Drive has this locked.', code: 'locked' }))
        const { result } = setup()
        await act(async () => { await result.current.handleIntakeAction({ ...FILE, projectDocumentId: 'd1' }, 'reject') })
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title: 'Reject failed', message: 'Google Drive has this locked.' })
        expect(addToast.mock.calls.some(([t]) => /has been removed/.test(t.message ?? ''))).toBe(false)
    })

    it('an approve of something no longer waiting says what to do', async () => {
        respond(() => answer(409, { error: 'Document is not pending intake' }))
        const { result } = setup()
        await act(async () => { await result.current.handleIntakeAction({ ...FILE, projectDocumentId: 'd1' }, 'approve') })
        expect(addToast).toHaveBeenLastCalledWith({ type: 'error', title: 'Approve failed', message: "It's no longer waiting for review. Refresh the list." })
    })

    it("Internal only's warning shows as a warning", async () => {
        respond(() => answer(200, { ok: true, warning: 'Internal only is set, but ana@client.com still has access in Google Drive.' }))
        const { result } = setup()
        await act(async () => { await result.current.handlePrivacy({ ...FILE, projectDocumentId: 'd1' }, true) })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'warning', message: 'Internal only is set, but ana@client.com still has access in Google Drive.' }))
    })

    it("the Move/Copy picker says why its folders didn't load, and Try again loads them", async () => {
        respond(() => answer(503, { error: 'Google Drive is busy right now. Try again in a minute.', code: 'busy' }))
        const { result } = setup()
        await act(async () => { result.current.openCopyMoveModal(FILE, 'move') })
        await act(async () => { await vi.runAllTimersAsync() })
        expect(result.current.destinationsError).toBe('Google Drive is busy right now. Try again in a minute.')

        respond(() => answer(200, { files: [{ id: 'sub', name: 'Sub', mimeType: 'application/vnd.google-apps.folder' }] }))
        await act(async () => { result.current.retryDestinations() })
        await act(async () => { await vi.runAllTimersAsync() })
        expect(result.current.destinationsError).toBeNull()
        expect(result.current.destinationFolders.map((f) => f.id)).toEqual(['sub'])
    })

    it('the copy-to-engagement list says why it did not load, instead of "No other engagements"', async () => {
        respond(() => answer(500, { error: 'Something went wrong on our side. Try again.' }))
        const { result } = setup()
        await act(async () => { await result.current.openCrossEngagementModal(FILE) })
        expect(result.current.crossEngagementError).toBe('Something went wrong on our side. Try again.')
    })

    it('a folder copied only in part says X of Y to where, and what was not copied', async () => {
        respond((url) => url.endsWith('/engagements')
            ? answer(200, { engagements: [{ id: 'e2', name: 'Acme Audit', clientId: 'c', clientName: 'Acme' }] })
            : url.startsWith('/api/billing') ? answer(200, { allowed: true })
            : answer(200, { success: true, filesCopied: 12, filesTotal: 15, failed: [{ name: 'Budget.xlsx', reason: 'Google Drive has this locked.' }] }))
        const { result } = setup()
        await act(async () => { await result.current.openCrossEngagementModal(FILE) })
        act(() => { result.current.setCrossEngagementSelectedId('e2') })
        await act(async () => { await result.current.handleCrossEngagementSubmit() })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({
            type: 'warning',
            title: 'Copied 12 of 15',
            message: 'Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx · Google Drive has this locked.',
        }))
    })

    it("OneDrive still copying after 30 seconds isn't called done or failed", async () => {
        respond((url) => url.startsWith('/api/billing') ? answer(200, { allowed: true })
            : answer(504, { error: 'OneDrive is taking longer than expected. Refresh in a minute to see if it finished.', code: 'timed_out' }))
        const { result } = setup()
        act(() => { result.current.setCrossEngagementTarget(FILE); result.current.setCrossEngagementSelectedId('e2') })
        await act(async () => { await result.current.handleCrossEngagementSubmit() })
        expect(addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'info', title: 'Copy still running' }))
    })
})
