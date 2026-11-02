import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { UploadProgressPanel } from './upload-progress-panel'
import { UploadProgressProvider, useUploadProgress, type UploadQueueItem } from '@/lib/upload-progress-context'

const item = (name: string, status: UploadQueueItem['status'], error?: string): UploadQueueItem =>
    ({ id: name, file: new File(['x'], name, { type: 'image/png' }), progress: 0, status, error })

function Seed({ items, onRetry }: { items: UploadQueueItem[]; onRetry: ((items: UploadQueueItem[]) => void) | null }) {
    const { addToQueue, setRetryCallback } = useUploadProgress()
    useEffect(() => {
        addToQueue(items)
        setRetryCallback(onRetry)
    }, [])
    return null
}

function renderPanel(items: UploadQueueItem[], onRetry: ((items: UploadQueueItem[]) => void) | null = vi.fn()) {
    render(
        <UploadProgressProvider>
            <Seed items={items} onRetry={onRetry} />
            <UploadProgressPanel />
        </UploadProgressProvider>
    )
    return onRetry
}

describe('UploadProgressPanel', () => {
    it('a finished run with a failure says how many failed, and Retry takes one file or all of them', () => {
        const failedA = item('a.png', 'error', 'Connection dropped before the upload started.')
        const failedB = item('b.png', 'error', 'Upload failed: 503')
        const onRetry = renderPanel([item('ok.png', 'completed'), failedA, failedB])

        expect(screen.getByText('1 of 3 uploaded')).toBeTruthy()
        expect(screen.getByText('· 2 failed')).toBeTruthy()
        expect(screen.getByText('Connection dropped before the upload started.')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Retry a.png' }))
        expect(onRetry).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a.png' })])

        fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
        expect(onRetry).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a.png' }), expect.objectContaining({ id: 'b.png' })])
    })

    it('a clean run keeps the old header and shows no Retry', () => {
        renderPanel([item('ok.png', 'completed')])
        expect(screen.getByText('Uploads complete 1/1')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
    })

    it('with no Files page open to run it, failures show but Retry does not', () => {
        renderPanel([item('a.png', 'error', 'Upload failed: 503')], null)
        expect(screen.getByText('Upload failed: 503')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
    })
})
