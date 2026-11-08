import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DocumentImagePreviewPane } from './document-image-preview-pane'
import { DocumentMediaPreviewPane } from './document-media-preview-pane'

// An image, video or audio preview that fails shows "Preview not available" with the route's reason,
// not a broken-image icon or a black pane (P1-40).

vi.mock('@/components/ui/tooltip', () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: () => null,
}))

afterEach(() => { vi.unstubAllGlobals() })

const DOC = { id: 'd1', name: 'photo.png', mimeType: 'image/png' }
const refusal = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This is no longer in OneDrive. It may have been moved or deleted there. Refresh the list.', code: 'not_found' }), { status: 404 })))

describe('media previews that fail', () => {
    it('an image says why, with Reload', async () => {
        refusal()
        render(<DocumentImagePreviewPane document={DOC} projectId="p1" />)
        fireEvent.error(screen.getByRole('img'))
        expect(await screen.findByText('Preview not available')).toBeTruthy()
        await waitFor(() => expect(screen.getByText(/no longer in OneDrive/)).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
        expect(screen.getByRole('img')).toBeTruthy()
    })

    it('a video says why', async () => {
        refusal()
        const { container } = render(<DocumentMediaPreviewPane document={{ ...DOC, mimeType: 'video/mp4' }} projectId="p1" kind="video" />)
        fireEvent.error(container.querySelector('video')!)
        await waitFor(() => expect(screen.getByText(/no longer in OneDrive/)).toBeTruthy())
    })
})

describe('the PDF preview when the route refuses', () => {
    it('shows the reason and Reload, never the route\'s JSON in a frame', async () => {
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.', code: 'reconnect' }), { status: 502 })))
        const { DocumentPdfPreviewPane } = await import('./document-pdf-preview-pane')
        const { container } = render(<DocumentPdfPreviewPane document={{ id: 'd1', name: 'Plan.docx', mimeType: 'application/pdf' }} projectId="p1" />)
        expect(await screen.findByText('Preview not available')).toBeTruthy()
        expect(screen.getByText(/needs renewing/)).toBeTruthy()
        expect(container.querySelector('iframe')).toBeNull()
        expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    })
})
