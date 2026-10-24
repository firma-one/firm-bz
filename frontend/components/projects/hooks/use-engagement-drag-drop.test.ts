import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEngagementDragDrop } from './use-engagement-drag-drop'
import type { DriveFile } from '@/lib/types'

const FOLDER = 'application/vnd.google-apps.folder'
const folder = (id: string, over: Partial<DriveFile> = {}) => ({ id, name: id, mimeType: FOLDER, ...over }) as DriveFile
const file = (id: string) => ({ id, name: id, mimeType: 'application/pdf' }) as DriveFile

/** A drag of files from the computer, as React hands it to the handlers. */
function fileDrag(names: string[]) {
    const files = names.map((n) => new File(['x'], n)) as unknown as FileList
    Object.defineProperty(files, 'length', { value: names.length })
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: { contains: () => false },
        relatedTarget: null,
        dataTransfer: { types: ['Files'], items: names.map(() => ({ webkitGetAsEntry: () => ({ isDirectory: false }) })), files, dropEffect: 'none' },
    } as unknown as React.DragEvent
}

function setup(opts: { canUpload?: boolean; canUploadIntoFolders?: boolean; compactDragImage?: boolean } = {}) {
    const processUploads = vi.fn(async () => {})
    const { result } = renderHook(() =>
        useEngagementDragDrop({ canEdit: true, processUploads, handleCopyMoveToFolder: vi.fn(async () => {}), addToast: vi.fn(), ...opts })
    )
    return { result, processUploads }
}

describe('useEngagementDragDrop — files from the computer', () => {
    it('uploads files dropped on a file row into the open folder (they used to be ignored)', async () => {
        const { result, processUploads } = setup()
        await act(async () => { await result.current.handleItemDrop(fileDrag(['a.pdf', 'b.pdf']), file('f1')) })
        expect(processUploads).toHaveBeenCalledWith(expect.anything(), undefined)
    })

    it('makes a folder row the target while dragging over it, and uploads into it', async () => {
        const { result, processUploads } = setup()
        act(() => { result.current.handleItemDragOver(fileDrag(['a.pdf']), folder('sub')) })
        expect(result.current.isDragging).toBe(true)
        expect(result.current.dropTargetFolder?.id).toBe('sub')
        expect(result.current.dragFileCount).toBe(1)
        await act(async () => { await result.current.handleItemDrop(fileDrag(['a.pdf']), folder('sub')) })
        expect(processUploads).toHaveBeenCalledWith(expect.anything(), 'sub')
        expect(result.current.isDragging).toBe(false)
    })

    it('never targets an approved deliverable: the open folder takes the files instead', async () => {
        const { result, processUploads } = setup()
        const approved = folder('done', { isDeliverable: true, deliverableStatus: 'approved' } as Partial<DriveFile>)
        act(() => { result.current.handleItemDragOver(fileDrag(['a.pdf']), approved) })
        expect(result.current.dropTargetFolder).toBeNull()
        await act(async () => { await result.current.handleItemDrop(fileDrag(['a.pdf']), approved) })
        expect(processUploads).toHaveBeenCalledWith(expect.anything(), undefined)
    })

    it('keeps folder rows from being targets when uploads can only land in the open folder', () => {
        const { result } = setup({ canUploadIntoFolders: false })
        act(() => { result.current.handleItemDragOver(fileDrag(['a.pdf']), folder('sub')) })
        expect(result.current.isDragging).toBe(true)
        expect(result.current.dropTargetFolder).toBeNull()
    })

    it('shows no target and uploads nothing where uploading isn’t offered', async () => {
        const { result, processUploads } = setup({ canUpload: false })
        act(() => { result.current.handleDragOver(fileDrag(['a.pdf'])) })
        expect(result.current.isDragging).toBe(false)
        await act(async () => { await result.current.handleDrop(fileDrag(['a.pdf'])) })
        await act(async () => { await result.current.handleItemDrop(fileDrag(['a.pdf']), folder('sub')) })
        expect(processUploads).not.toHaveBeenCalled()
    })
})

describe('useEngagementDragDrop — moving a row', () => {
    const rowDrag = () => ({ dataTransfer: { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: 'none' } }) as unknown as React.DragEvent & { dataTransfer: { setDragImage: ReturnType<typeof vi.fn> } }

    it('drags as a small card with the file\'s name, not a copy of the whole row', () => {
        const { result } = setup({ compactDragImage: true })
        const e = rowDrag()
        act(() => { result.current.handleItemDragStart(e, file('Plan.pdf')) })
        expect(e.dataTransfer.setDragImage).toHaveBeenCalledTimes(1)
        const card = e.dataTransfer.setDragImage.mock.calls[0][0] as HTMLElement
        expect(card.textContent).toBe('Plan.pdf')
        expect(result.current.isInternalDragging).toBe(true)
    })

    it('keeps the browser\'s own drag image when it\'s off', () => {
        const { result } = setup()
        const e = rowDrag()
        act(() => { result.current.handleItemDragStart(e, file('Plan.pdf')) })
        expect(e.dataTransfer.setDragImage).not.toHaveBeenCalled()
    })
})
