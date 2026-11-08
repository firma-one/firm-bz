import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { timedOutWords, useEngagementUpload, uploadRefusal } from './use-engagement-upload'
import { UploadProgressProvider, useUploadProgress } from '@/lib/upload-progress-context'

const SESSION_URL = 'https://graph.test/upload-session'

type InitBehavior = 'drop' | 'ok' | 503 | 403
let initBehaviors: InitBehavior[] = []
let initBodies: { parentId?: string; fileId?: string }[] = []
/** What index-file, index-file-intake, the session PUT, the folder listing and folder creation answer next. */
let indexAnswers: { status: number; body: unknown }[] = []
let intakeAnswers: { status: number; body: unknown }[] = []
let sessionAnswers: { status: number; body: unknown }[] = []
let listAnswers: { status: number; body: unknown }[] = []
let createFolderAnswers: { status: number; body: unknown }[] = []
let indexCalls: unknown[] = []

const json = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response

beforeEach(() => {
    vi.useFakeTimers()
    addToast.mockReset()
    initBehaviors = []
    initBodies = []
    indexAnswers = []
    intakeAnswers = []
    sessionAnswers = []
    listAnswers = []
    createFolderAnswers = []
    indexCalls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/projects/e1/index-file') {
            indexCalls.push(JSON.parse(init!.body as string))
            const a = indexAnswers.shift()
            if (a?.body === 'drop') throw new TypeError('Failed to fetch')
            return a ? json(a.status, a.body) : json(200, { success: true })
        }
        if (url.endsWith('/index-file-intake')) {
            const a = intakeAnswers.shift()
            return a ? json(a.status, a.body) : json(200, { ok: true })
        }
        if (url.startsWith('/api/billing/document-gate')) return json(200, { allowed: true })
        if (url === '/api/connectors/google-drive/upload') {
            initBodies.push(JSON.parse(init!.body as string))
            // Once the scripted answers run out, the server answers normally.
            const behavior = initBehaviors.shift() ?? 'ok'
            if (behavior === 'drop') throw new TypeError('Failed to fetch')
            if (behavior !== 'ok') return json(behavior, { error: `Status ${behavior}` })
            return json(200, { uploadUrl: SESSION_URL, provider: 'onedrive' })
        }
        if (url === SESSION_URL) {
            const a = sessionAnswers.shift()
            return a ? json(a.status, a.body) : json(201, { id: 'item-1', name: 'board-lanes.png' })
        }
        if (url === '/api/connectors/google-drive/linked-files') {
            const body = JSON.parse(init!.body as string)
            if (body.action === 'list') {
                const a = listAnswers.shift()
                return a ? json(a.status, a.body) : json(200, { files: [] })
            }
            const a = createFolderAnswers.shift()
            return a ? json(a.status, a.body) : json(200, { id: 'sub-folder' })
        }
        return json(200, {})
    }))
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const wrapper = ({ children }: { children: ReactNode }) => <UploadProgressProvider>{children}</UploadProgressProvider>

function setup({ external = false, openFolder = 'open-folder' as string | null } = {}) {
    const fetchFiles = vi.fn(async () => {})
    const { result } = renderHook(() => ({
        upload: useEngagementUpload({
            sessionRef: { current: { access_token: 't' } },
            projectId: 'e1',
            currentFolderIdRef: { current: openFolder },
            files: [],
            viewAsPersonaSlug: null,
            restrictToSharedOnly: external,
            fetchFiles,
        }),
        progress: useUploadProgress(),
    }), { wrapper })
    return { result, fetchFiles }
}

const pngFile = (relativePath?: string) => {
    const file = new File(['png'], 'board-lanes.png', { type: 'image/png' })
    if (relativePath) Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
    return file
}

/** Runs an upload to the end, moving the clock through its retry waits. */
async function settle(run: () => Promise<void>) {
    await act(async () => {
        let done = false
        const p = run().then(() => { done = true })
        for (let i = 0; !done && i < 40; i++) await vi.advanceTimersByTimeAsync(500)
        await p
    })
}

describe('upload retries', () => {
    it('a dropped connection before the upload starts is retried, and the file uploads', async () => {
        const { result } = setup()
        initBehaviors = ['drop']
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))

        expect(initBodies).toHaveLength(2)
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['completed'])
    })

    it('a folder upload retries too, into the subfolder it made', async () => {
        const { result } = setup()
        initBehaviors = ['drop', 503]
        await settle(() => result.current.upload.processFolderUpload([pngFile('Library/board-lanes.png')] as unknown as FileList))

        expect(initBodies).toHaveLength(3)
        expect(initBodies.every(b => b.parentId === 'sub-folder')).toBe(true)
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['completed'])
    })

    it('a refusal (403) is not retried', async () => {
        const { result } = setup()
        initBehaviors = [403]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))

        expect(initBodies).toHaveLength(1)
        expect(result.current.progress.uploadQueue[0]).toMatchObject({ status: 'error', error: 'Status 403' })
    })

    it('a file that keeps failing stays in the panel, named plainly, and Retry uploads it to the same folder', async () => {
        const { result } = setup()
        initBehaviors = ['drop', 'drop', 'drop']
        await settle(() => result.current.upload.processFolderUpload([pngFile('Library/board-lanes.png')] as unknown as FileList))

        expect(initBodies).toHaveLength(3)
        const [failed] = result.current.progress.uploadQueue
        expect(failed).toMatchObject({ status: 'error', error: 'Connection dropped before the upload started.' })

        // Finished runs clear after 8 seconds; one with a failure does not.
        await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
        expect(result.current.progress.uploadQueue).toHaveLength(1)

        await settle(async () => { result.current.progress.onRetry!([failed]) })
        expect(initBodies).toHaveLength(4)
        expect(initBodies[3].parentId).toBe('sub-folder')
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['completed'])
    })

    it('after the panel was closed, a toast names the failed file and its Retry brings it back', async () => {
        const { result } = setup()
        act(() => { result.current.progress.dismiss() })
        initBehaviors = ['drop', 'drop', 'drop']
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))

        const toast = addToast.mock.calls.at(-1)![0]
        expect(toast).toMatchObject({ type: 'error', title: "1 file didn't upload", action: { label: 'Retry' } })
        expect(toast.message).toContain('board-lanes.png')

        act(() => { result.current.progress.dismiss() })
        expect(result.current.progress.uploadQueue).toHaveLength(0)
        await settle(async () => { toast.action.onClick() })
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['completed'])
        expect(initBodies.at(-1)!.parentId).toBe('open-folder')
    })
})

describe('a file in storage but not in Firma', () => {
    it("shows as failed with Firma's reason, isn't counted as complete, and Retry tells Firma again without uploading twice", async () => {
        const { result } = setup()
        act(() => { result.current.progress.dismiss() })
        indexAnswers = [{ status: 403, body: { error: 'Your plan allows 10 files and folders. You have 10 indexed. Upgrade to add more.' } }]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))

        const [row] = result.current.progress.uploadQueue
        expect(row).toMatchObject({ status: 'error', error: 'In storage, but not added to firma · Your plan allows 10 files and folders. You have 10 indexed. Upgrade to add more.' })
        const toast = addToast.mock.calls.at(-1)![0]
        expect(toast.type).toBe('error')
        expect(toast.title).toBe('1 file not added to firma')
        expect(addToast.mock.calls.some(([t]) => t.title === 'Upload complete')).toBe(false)

        await settle(async () => { result.current.progress.onRetry!([row]) })
        expect(initBodies).toHaveLength(1)
        expect(indexCalls).toHaveLength(2)
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['completed'])
    })

    it('a dropped connection to Firma after the upload says so on the row', async () => {
        const { result } = setup()
        indexAnswers = [{ status: 0, body: 'drop' }]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))
        expect(result.current.progress.uploadQueue[0].error).toBe("In storage, but not added to firma · Couldn't reach firma. Check your connection and try again.")
    })

    it("a Limited Access contributor's upload that didn't reach review says so", async () => {
        const { result } = setup({ external: true })
        intakeAnswers = [{ status: 500, body: { error: 'Internal server error' } }]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))
        expect(result.current.progress.uploadQueue[0]).toMatchObject({
            status: 'error',
            error: 'Uploaded, but not sent for review · Something went wrong on our side. Try again.',
        })
        expect(indexCalls).toHaveLength(0)
    })

    it('a batch whose indexing is refused marks every file in it', async () => {
        const { result } = setup()
        indexAnswers = [{ status: 500, body: { error: 'Internal server error' } }]
        await settle(() => result.current.upload.processFolderUpload([pngFile('Library/board-lanes.png'), pngFile('Library/two.png')] as unknown as FileList))
        expect(result.current.progress.uploadQueue.map(i => i.status)).toEqual(['error', 'error'])
        expect(result.current.progress.uploadQueue[0].error).toMatch(/^In storage, but not added to firma · /)
    })
})

describe("the storage's refusal, in words", () => {
    it('OneDrive refusing a chunk says why, not "Upload failed: 423"', async () => {
        const { result } = setup()
        sessionAnswers = [{ status: 423, body: { error: { code: 'resourceLocked', message: 'The resource you are attempting to access is locked' } } }]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList))
        expect(result.current.progress.uploadQueue[0].error).toMatch(/^OneDrive has this locked/)
    })

    it('a Google Drive upload that runs out of time names the size as the likely cause', () => {
        expect(timedOutWords(1.5 * 1024 * 1024 * 1024)).toMatch(/^Timed out after 5 minutes · At 1\.5 GB it may be too large for this connection\./)
    })

    it("reads Drive's answer shape too", () => {
        expect(uploadRefusal(403, JSON.stringify({ error: { code: 403, message: 'The user has exceeded their Drive storage quota', errors: [{ reason: 'storageQuotaExceeded' }] } }), 'Google Drive'))
            .toBe('The Google Drive account connected to this client is out of storage space. Free some up, then try again.')
    })
})

describe('a folder upload that stops', () => {
    it('says no files went up and how many empty folders were made, and shows them', async () => {
        const { result, fetchFiles } = setup()
        createFolderAnswers = [{ status: 200, body: { id: 'lib' } }, { status: 403, body: { error: "The Google Drive account connected to this client doesn't have permission to change this.", code: 'no_permission' } }]
        await settle(() => result.current.upload.processFolderUpload([pngFile('Library/Sub/board-lanes.png')] as unknown as FileList))
        const toast = addToast.mock.calls.at(-1)![0]
        expect(toast.title).toBe('Folder upload stopped')
        expect(toast.message).toBe("Couldn't create “Sub” · The Google Drive account connected to this client doesn't have permission to change this. No files were uploaded. 1 empty folder was created.")
        expect(initBodies).toHaveLength(0)
        expect(fetchFiles).toHaveBeenCalledWith('open-folder', true)
    })

    it('says to open a folder first, instead of doing nothing', async () => {
        const { result } = setup({ openFolder: null })
        await settle(() => result.current.upload.processFolderUpload([pngFile('Library/board-lanes.png')] as unknown as FileList))
        expect(addToast.mock.calls.at(-1)![0]).toMatchObject({ type: 'error', title: "Couldn't upload the folder" })
    })
})

describe('the same-name check', () => {
    it("doesn't upload unasked when the drop target's listing fails, and offers to upload anyway", async () => {
        const { result } = setup()
        listAnswers = [{ status: 503, body: { error: 'Google Drive is busy right now. Try again in a minute.', code: 'busy' } }]
        await settle(() => result.current.upload.processUploads([pngFile()] as unknown as FileList, 'other-folder'))
        const toast = addToast.mock.calls.at(-1)![0]
        expect(toast).toMatchObject({ title: "Couldn't check for files with the same name", action: { label: 'Upload anyway' } })
        expect(toast.message).toMatch(/^Google Drive is busy right now/)
        expect(initBodies).toHaveLength(0)

        await settle(async () => { toast.action.onClick() })
        expect(initBodies).toHaveLength(1)
        expect(initBodies[0].parentId).toBe('other-folder')
    })
})
