import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * DO-2 and P1-12 (Dossier, beta): a page whose text fails to load stays read only and says why, with
 * Retry. It used to become an empty editable page, and setContent('') alone emitted an update, so the
 * autosave wrote that blank over the real file 1.5 seconds later, without a keystroke. A save that
 * fails says "Not saved" with its reason, never "Saved".
 */

const { actions, toast } = vi.hoisted(() => ({
    actions: {
        getWikiPageContent: vi.fn(),
        updateWikiPage: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: {} })),
    },
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/engagement-wiki', () => actions)
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))

import { WikiEditor } from './wiki-editor'

const page = { id: 'p1', engagementId: 'e1', firmId: 'f1', title: 'Notes', slug: 'notes', driveFileId: 'file-1', order: 0, parentId: 'sec-1', createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date() }

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

describe('WikiEditor', () => {
    it('says the page did not load, stays read only, and never saves over it', async () => {
        actions.getWikiPageContent.mockResolvedValue({ ok: false, code: 'reconnect', error: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.' })
        render(<WikiEditor page={page} canEdit onTitleChange={() => {}} />)
        expect(await screen.findByText("Couldn't load this page")).toBeTruthy()
        expect(screen.getByText(/needs renewing\. Reconnect the storage, then try again\. It can't be edited until it loads\./)).toBeTruthy()
        // No toolbar, no editor body: nothing to type into.
        expect(screen.queryByTitle('Bold')).toBeNull()
        await act(async () => { vi.advanceTimersByTime(5000) })
        expect(actions.updateWikiPage).not.toHaveBeenCalled()
    })

    it('loads the text without saving it back', async () => {
        actions.getWikiPageContent.mockResolvedValue({ ok: true, data: 'Real words' })
        render(<WikiEditor page={page} canEdit onTitleChange={() => {}} />)
        expect(await screen.findByText('Real words')).toBeTruthy()
        await act(async () => { vi.advanceTimersByTime(5000) })
        expect(actions.updateWikiPage).not.toHaveBeenCalled()
    })

    it('tries again from the failure', async () => {
        actions.getWikiPageContent
            .mockResolvedValueOnce({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
            .mockResolvedValueOnce({ ok: true, data: 'Real words' })
        render(<WikiEditor page={page} canEdit onTitleChange={() => {}} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Real words')).toBeTruthy()
    })

    it('says "Not saved" with the reason when a save fails', async () => {
        actions.getWikiPageContent.mockResolvedValue({ ok: true, data: 'Real words' })
        actions.updateWikiPage.mockResolvedValueOnce({ ok: false, code: 'locked', error: 'Google Drive has this locked.' })
        render(<WikiEditor page={page} canEdit onTitleChange={() => {}} />)
        await screen.findByText('Real words')
        fireEvent.change(screen.getByPlaceholderText('Untitled'), { target: { value: 'Notes 2' } })
        await act(async () => { vi.advanceTimersByTime(1500) })
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not saved · Google Drive has this locked.'))
        expect(screen.queryByText('Saved')).toBeNull()
    })
})
