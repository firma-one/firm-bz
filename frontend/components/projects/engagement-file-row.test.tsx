import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// The row's quick actions, in order: Bookmark, Details, Rename, Preview, Open, Copy link. Rename and
// Open follow the ⋮ menu's rules. The internal only mark is only a mark.

vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({}) }))
vi.mock('@/components/ui/document-action-menu', () => ({ DocumentActionMenu: () => null }))
vi.mock('@/components/files/asset-details-pane', () => ({ openAssetDetailsPane: vi.fn() }))
vi.mock('@/components/projects/file-property-cells', () => ({ FileAssigneeCell: () => null, FileDueDateCell: () => null, FileStatusCell: () => null }))

import { EngagementFileRow, type EngagementFileRowProps } from './engagement-file-row'

const FILE = { id: 'f1', name: 'Plan.xlsx', mimeType: 'application/vnd.ms-excel', projectDocumentId: 'd1' } as EngagementFileRowProps['file']
const FOLDER = { id: 'fo1', name: 'Reports', mimeType: 'application/vnd.google-apps.folder' } as EngagementFileRowProps['file']
const empty = new Set<string>()

const handlers = { onOpenRename: vi.fn(), onOpenDocument: vi.fn(), onPrivacy: vi.fn() }

function renderRow(overrides: Partial<EngagementFileRowProps> = {}) {
    const props = {
        file: FILE, isSelected: false, selectedFileIdsSize: 0, canEdit: true, canManage: true, isProjectLead: true, loading: false,
        activeCommentDocId: null, activeInfoDocId: null, activePreviewDocId: null, highlightedFileId: null,
        draggedItem: null, dragOverFolderId: null, restrictToSharedOnly: false, viewAsPersonaSlug: null,
        currentFolderType: 'general', generalFolderId: 'g', projectId: 'p', isActionMenuOpen: false, isRegrantingId: null,
        sharedExternalIds: empty, ancestorFolderIds: empty, sharedExternalIdsForEC: empty, ancestorFolderIdsForEC: empty,
        sharedExternalIdsForGuest: empty, ancestorFolderIdsForGuest: empty, descendantIds: empty, descendantIdsForEC: empty,
        descendantIdsForGuest: empty, processingFileIds: empty,
        ...handlers,
        ...overrides,
    } as unknown as EngagementFileRowProps
    return render(<TooltipProvider><EngagementFileRow {...props} /></TooltipProvider>)
}

const stripLabels = (container: HTMLElement) =>
    within(container).getAllByRole('button', { hidden: true })
        .map((b) => b.getAttribute('aria-label'))
        .filter(Boolean)

beforeEach(() => Object.values(handlers).forEach((fn) => fn.mockReset()))

describe('the quick actions', () => {
    it('run Bookmark, Details, Rename, Preview, Open, Copy link', () => {
        const { container } = renderRow({ bookmarkId: 'b1' })
        expect(stripLabels(container)).toEqual(['Remove bookmark', 'Details', 'Rename', 'Preview', 'Open', 'Copy link'])
    })

    it('leave out Rename for someone who cannot edit', () => {
        const { container } = renderRow({ canEdit: false })
        expect(stripLabels(container)).not.toContain('Rename')
    })

    it('are Rename and Copy link on a folder, which opens by its name', () => {
        const { container } = renderRow({ file: FOLDER })
        expect(stripLabels(container)).toEqual(['Rename', 'Copy link'])
    })
})

describe('Rename', () => {
    it('opens the rename dialog', () => {
        renderRow()
        fireEvent.click(screen.getByRole('button', { name: 'Rename', hidden: true }))
        expect(handlers.onOpenRename).toHaveBeenCalledWith(FILE)
    })

    it('holds its slot but does nothing on a finalized document', () => {
        renderRow({ file: { ...FILE, lock: { type: 'finalize' } } as EngagementFileRowProps['file'] })
        const rename = screen.getByRole('button', { name: 'Rename', hidden: true })
        expect(rename.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(rename)
        expect(handlers.onOpenRename).not.toHaveBeenCalled()
    })
})

describe('Open', () => {
    it('opens the document through the secure open', () => {
        renderRow()
        fireEvent.click(screen.getByRole('button', { name: 'Open', hidden: true }))
        expect(handlers.onOpenDocument).toHaveBeenCalledWith(FILE)
    })

    it('goes straight to the address of a link', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderRow({ file: { ...FILE, documentType: 'LINK', externalUrl: 'https://example.com/x' } as EngagementFileRowProps['file'] })
        fireEvent.click(screen.getByRole('button', { name: 'Open', hidden: true }))
        expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer')
        expect(handlers.onOpenDocument).not.toHaveBeenCalled()
        open.mockRestore()
    })

    it('is off inside an approved deliverable, as in the menu', () => {
        renderRow({ isInsideApprovedDeliverable: true })
        const openButton = screen.getByRole('button', { name: 'Open', hidden: true })
        expect(openButton.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(openButton)
        expect(handlers.onOpenDocument).not.toHaveBeenCalled()
    })
})

describe('the internal only mark', () => {
    const PRIVATE = { ...FILE, isPrivate: true } as EngagementFileRowProps['file']

    it('shows on a folder too, since a folder hides all it holds', () => {
        renderRow({ file: { ...PRIVATE, mimeType: 'application/vnd.google-apps.folder' } })
        expect(screen.getByRole('button', { name: /^Internal only/, hidden: true })).toBeTruthy()
    })

    it('comes off when clicked', () => {
        renderRow({ file: PRIVATE })
        fireEvent.click(screen.getByRole('button', { name: /^Internal only/, hidden: true }))
        expect(handlers.onPrivacy).toHaveBeenCalledWith(PRIVATE, false)
    })

    it('only marks the file for someone who cannot change it', () => {
        renderRow({ file: PRIVATE, canManage: false })
        expect(screen.getByRole('img', { name: 'Internal only', hidden: true })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^Internal only/, hidden: true })).toBeNull()
    })

    it('only marks the file inside an approved deliverable, as the menu has it', () => {
        renderRow({ file: PRIVATE, isInsideApprovedDeliverable: true })
        expect(screen.queryByRole('button', { name: /^Internal only/, hidden: true })).toBeNull()
    })
})
