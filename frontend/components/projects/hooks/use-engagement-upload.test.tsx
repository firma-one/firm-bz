import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { useEngagementUpload } from './use-engagement-upload'
import { UploadProgressProvider, useUploadProgress } from '@/lib/upload-progress-context'

const SESSION_URL = 'https://graph.test/upload-session'

type InitBehavior = 'drop' | 'ok' | 503 | 403
let initBehaviors: InitBehavior[] = []
let initBodies: { parentId?: string; fileId?: string }[] = []

const json = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response

beforeEach(() => {
    vi.useFakeTimers()
    addToast.mockReset()
    initBehaviors = []
    initBodies = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('/api/billing/document-gate')) return json(200, { allowed: true })
        if (url === '/api/connectors/google-drive/upload') {
            initBodies.push(JSON.parse(init!.body as string))
            // Once the scripted answers run out, the server answers normally.
            const behavior = initBehaviors.shift() ?? 'ok'
            if (behavior === 'drop') throw new TypeError('Failed to fetch')
            if (behavior !== 'ok') return json(behavior, { error: `Status ${behavior}` })
            return json(200, { uploadUrl: SESSION_URL, provider: 'onedrive' })
        }
        if (url === SESSION_URL) return json(201, { id: 'item-1', name: 'board-lanes.png' })
        if (url === '/api/connectors/google-drive/linked-files') return json(200, { id: 'sub-folder' })
        return json(200, {})
    }))
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const wrapper = ({ children }: { children: ReactNode }) => <UploadProgressProvider>{children}</UploadProgressProvider>

function setup() {
    const fetchFiles = vi.fn(async () => {})
    const { result } = renderHook(() => ({
        upload: useEngagementUpload({
            sessionRef: { current: { access_token: 't' } },
            projectId: 'e1',
            currentFolderIdRef: { current: 'open-folder' },
            files: [],
            viewAsPersonaSlug: null,
            restrictToSharedOnly: false,
            fetchFiles,
        }),
        progress: useUploadProgress(),
    }), { wrapper })
    return { result }
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
