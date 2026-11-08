import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'

// A preview over a deliverable's details. Closing it goes back to the details at the size they were.

vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ paneSize: 'medium' }) }))
vi.mock('@/components/files/document-preview-pane', () => ({
    DocumentPreviewPane: ({ document, projectId }: { document: { id: string; name: string }; projectId: string }) => <div>{`previewing ${document.name} (${document.id}) in ${projectId}`}</div>,
}))

import { APPROVED_OPEN_OFF_REASON, createPanePreview, LocatedDocumentPreview, usePanePreview, type PanePreviewDocument } from './pane-preview'

const DOC: PanePreviewDocument = { documentId: 'd1', externalId: 'x1', fileName: 'Plan.pdf', mimeType: 'application/pdf', folderPath: ['Engagement root', 'Research'], approved: false }

const setup = () => {
    const pane = { setTitle: vi.fn(), setHeaderSubtitle: vi.fn(), setHeaderIcon: vi.fn(), setIconTooltip: vi.fn(), setPaneSize: vi.fn() }
    const showDetailsHeader = vi.fn()
    return { pane, showDetailsHeader, preview: createPanePreview(pane, showDetailsHeader) }
}

describe('createPanePreview', () => {
    it('puts the document in the pane\'s header', () => {
        const { pane, preview } = setup()
        preview.open(DOC, 'medium')
        expect(preview.get()).toBe(DOC)
        expect(pane.setTitle).toHaveBeenCalledWith('Plan.pdf')
        expect(pane.setHeaderSubtitle).toHaveBeenCalledWith('')
        expect(pane.setPaneSize).not.toHaveBeenCalled()
    })

    it.each([
        ['Medium, then collapsed to Small', 'medium'],
        ['Medium, then expanded to Large', 'medium'],
        ['Large, where it was opened', 'large'],
        ['Small, where it was opened', 'small'],
    ] as const)('returns to the details at the size they were: %s', (_how, sizeWhenOpened) => {
        const { pane, showDetailsHeader, preview } = setup()
        preview.open(DOC, sizeWhenOpened)
        expect(preview.close()).toBe(true)
        expect(preview.get()).toBeNull()
        expect(showDetailsHeader).toHaveBeenCalledTimes(1)
        expect(pane.setPaneSize).toHaveBeenCalledWith(sizeWhenOpened)
    })

    it('says when there was nothing to close, so the pane itself may close', () => {
        const { pane, showDetailsHeader, preview } = setup()
        expect(preview.close()).toBe(false)
        expect(showDetailsHeader).not.toHaveBeenCalled()
        expect(pane.setPaneSize).not.toHaveBeenCalled()
    })

    it('keeps the size to return to when another document opens over the first', () => {
        const { pane, preview } = setup()
        preview.open(DOC, 'medium')
        preview.open({ ...DOC, documentId: 'd2' }, 'large')
        preview.close()
        expect(pane.setPaneSize).toHaveBeenCalledWith('medium')
    })

    it('tells everyone watching it', () => {
        const { preview } = setup()
        const docked = renderHook(() => usePanePreview(preview))
        const fullScreen = renderHook(() => usePanePreview(preview))
        act(() => preview.open(DOC, 'medium'))
        expect(docked.result.current).toBe(DOC)
        expect(fullScreen.result.current).toBe(DOC)
        act(() => { preview.close() })
        expect(docked.result.current).toBeNull()
        expect(fullScreen.result.current).toBeNull()
    })

    it('reads as no preview without one', () => {
        expect(renderHook(() => usePanePreview(undefined)).result.current).toBeNull()
    })
})

describe('LocatedDocumentPreview', () => {
    const located = (doc: PanePreviewDocument = DOC, onOpen = vi.fn()) => {
        render(<LocatedDocumentPreview doc={doc} projectId="p1" filesBase="https://app.test/e/files" openLabel="Open in OneDrive" onOpen={onOpen} />)
        return onOpen
    }

    it('shows the document under its location', () => {
        located()
        expect(screen.getByText('previewing Plan.pdf (d1) in p1')).toBeTruthy()
        expect(screen.getByText('Engagement root / Research')).toBeTruthy()
    })

    it('links to the document in Files', () => {
        located()
        expect((screen.getByRole('link', { name: 'Open in Files' }) as HTMLAnchorElement).href).toBe('https://app.test/e/files#doc-file:d1')
    })

    it('opens the document it shows', () => {
        const onOpen = located()
        fireEvent.click(screen.getByRole('button', { name: 'Open in OneDrive' }))
        expect(onOpen).toHaveBeenCalledWith(DOC)
    })

    it('turns Open off in an approved deliverable', () => {
        const onOpen = located({ ...DOC, approved: true })
        const open = screen.getByRole('button', { name: 'Open in OneDrive' })
        expect(open.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(open)
        expect(onOpen).not.toHaveBeenCalled()
        expect(APPROVED_OPEN_OFF_REASON).toBe('Approved deliverables open in preview only')
    })
})
