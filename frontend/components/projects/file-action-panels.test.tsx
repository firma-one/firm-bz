import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DownloadQueuePanel, TrashQueuePanel, downloadPanelTitle, trashPanelTitle } from './file-action-panels'

// The Files list's corner panels never call a failure or a short ZIP complete, and each row says why.

describe('download panel', () => {
    it('a failed ZIP reads "Download failed" with its reason drawn, never "Download complete 0/1"', () => {
        render(<DownloadQueuePanel open onToggle={vi.fn()} onClose={vi.fn()} bottom="1rem"
            queue={[{ id: 'd', name: '3 items', status: 'error', error: 'Nothing could be added to the ZIP. Google Drive has these locked.' }]} />)
        expect(screen.getByText('Download failed')).toBeTruthy()
        expect(screen.getByText('Nothing could be added to the ZIP. Google Drive has these locked.')).toBeTruthy()
        expect(screen.queryByText(/complete/)).toBeNull()
    })

    it('a short ZIP says what it left out', () => {
        render(<DownloadQueuePanel open onToggle={vi.fn()} onClose={vi.fn()} bottom="1rem"
            queue={[{ id: 'd', name: 'Acme.zip', status: 'partial', note: 'Downloaded 96 of 100. Not included: Budget.xlsx · Google Drive has this locked.' }]} />)
        expect(screen.getByText('Downloaded, with files left out')).toBeTruthy()
        expect(screen.getByText(/Downloaded 96 of 100/)).toBeTruthy()
    })

    it('titles count what failed', () => {
        expect(downloadPanelTitle([{ id: 'a', name: 'a', status: 'done' }, { id: 'b', name: 'b', status: 'error' }])).toBe('1 of 2 downloaded · 1 failed')
        expect(downloadPanelTitle([{ id: 'a', name: 'a', status: 'done' }])).toBe('Download complete')
    })
})

describe('trash panel', () => {
    it('says how many went, and each failed row says why in words', () => {
        const queue = [
            { id: 'a', name: 'a.pdf', connectorId: 'c', status: 'done' as const },
            { id: 'b', name: 'b.pdf', connectorId: 'c', status: 'error' as const, error: 'OneDrive has this locked.' },
            { id: 'c', name: 'c.pdf', connectorId: 'c', status: 'error' as const, error: 'OneDrive has this locked.' },
        ]
        render(<TrashQueuePanel open onToggle={vi.fn()} onClose={vi.fn()} bottom="1rem" queue={queue} />)
        expect(screen.getByText('Moved 1 of 3 to trash')).toBeTruthy()
        expect(screen.getAllByText('OneDrive has this locked.')).toHaveLength(2)
    })

    it('titles every case', () => {
        const row = (status: 'pending' | 'done' | 'error') => ({ id: status + Math.random(), name: 'x', connectorId: 'c', status })
        expect(trashPanelTitle([row('done'), row('pending')])).toBe('Moving to trash… 1/2')
        expect(trashPanelTitle([row('done'), row('done')])).toBe('Moved 2 to trash')
        expect(trashPanelTitle([row('error'), row('error')])).toBe("Couldn't move 2 to trash")
    })
})
