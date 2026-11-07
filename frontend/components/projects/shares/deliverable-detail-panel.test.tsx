import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// The deliverable pane under derived stages (.claude/plans/deliverable-stages-blocked.md): its stage
// only reads, its work is its documents on the Board, and Not started ones wait under their own line.

vi.mock('@/lib/supabase', () => ({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
    getSession: async () => ({ access_token: 't' }),
}))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ paneSize: 'medium', clearPane: vi.fn() }) }))
const { thread } = vi.hoisted(() => ({ thread: { mounts: 0, openDocument: null as ((doc: { documentId: string }) => void) | null } }))
vi.mock('@/components/projects/document-doc-comments-pane', async () => {
    const { useEffect } = await import('react')
    return {
        DocumentDocCommentsPane: (props: { onOpenDocument?: (doc: { documentId: string }) => void }) => {
            useEffect(() => { thread.mounts += 1 }, [])
            thread.openDocument = props.onOpenDocument ?? null
            return <div>the thread</div>
        },
    }
})
vi.mock('@/components/files/document-preview-pane', () => ({
    DocumentPreviewPane: ({ document }: { document: { name: string } }) => <div>{`previewing ${document.name}`}</div>,
}))
vi.mock('@/components/ui/document-action-menu', () => ({ DocumentActionMenu: () => null }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { DeliverableDetailPanel } from './deliverable-detail-panel'
import { createPanePreview } from './pane-preview'

const subtask = (id: string, status: string | null, extra: object = {}) => ({
    id, documentId: id, fileName: `${id}.docx`, docId: id.toUpperCase(), dueDate: null,
    assigneeUserId: null, assigneeName: null, assigneeEmail: null, status, ...extra,
})

let subtasks: any[] = []
let stageCalls: { url: string; body: any }[] = []

beforeEach(() => {
    stageCalls = []
    subtasks = [
        subtask('d1', 'approved'),
        subtask('d2', 'in_progress', { blocked: { reason: 'client', note: 'Q3 export', at: 'x', by: 'u' } }),
        subtask('d3', 'not_started'),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response
        if (url.includes('/sharing/activity')) {
            stageCalls.push({ url, body: JSON.parse(init?.body as string) })
            return json({ deliverable: { id: 'D', status: 'in_progress' } })
        }
        if (url.includes('/subtasks')) return json({ subtasks, deliverable: { ownerUserId: null } })
        if (url.includes('/members')) return json({ members: [] })
        if (url.includes('/doc-comments')) return json({ messages: [] })
        return json({ sharing: { settings: {} } })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const panel = (props: Partial<React.ComponentProps<typeof DeliverableDetailPanel>> = {}) =>
    render(
        <DeliverableDetailPanel
            documentId="D"
            projectId="p1"
            docId="QSR-1"
            fileName="Market report"
            activityStatus="in_progress"
            canManage
            roleSlug="eng_admin"
            {...props}
        />,
    )

describe('DeliverableDetailPanel', () => {
    it('shows its stage without a way to set it', async () => {
        panel()
        await waitFor(() => expect(screen.getByText('1 of 2 documents approved')).toBeTruthy())
        expect(screen.queryByRole('combobox', { name: 'Deliverable status' })).toBeNull()
    })

    it('counts and lists the documents on the Board, folding the Not started ones away', async () => {
        panel()
        await waitFor(() => expect(screen.getByText('1 not on the Board')).toBeTruthy())
        expect(screen.getByText('D1')).toBeTruthy()
        expect(screen.queryByText('D3')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: '1 not on the Board' }))
        expect(screen.getByText('D3')).toBeTruthy()
    })

    it('adds a Not started document to the Board at To do', async () => {
        const onStatusChange = vi.fn()
        panel({ activityStatus: 'to_do', onStatusChange })
        fireEvent.click(await screen.findByRole('button', { name: '1 not on the Board' }))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to Board' })) })
        expect(stageCalls).toEqual([{ url: '/api/projects/p1/documents/d3/sharing/activity', body: { status: 'to_do' } }])
        // Its deliverable followed: the Board card hears of it.
        expect(onStatusChange).toHaveBeenCalledWith('in_progress')
    })

    it("tags a blocked document", async () => {
        panel()
        expect(await screen.findByLabelText('Blocked: Waiting on client')).toBeTruthy()
    })

    it("gives a reviewer the one action, taken on the deliverable's documents", async () => {
        panel({ canManage: false, roleSlug: 'eng_viewer', isExternalViewer: true, activityStatus: 'in_review' })
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Request changes' })) })
        expect(stageCalls[0]).toEqual({ url: '/api/projects/p1/documents/D/sharing/activity', body: { status: 'in_progress' } })
    })
})

describe('a preview over the details', () => {
    const openPanel = (props: Partial<React.ComponentProps<typeof DeliverableDetailPanel>> = {}) => {
        thread.mounts = 0
        thread.openDocument = null
        const pane = { setTitle: vi.fn(), setHeaderSubtitle: vi.fn(), setHeaderIcon: vi.fn(), setIconTooltip: vi.fn(), setPaneSize: vi.fn() }
        const showDetailsHeader = vi.fn()
        const panePreview = createPanePreview(pane, showDetailsHeader)
        const onOpenSubtaskDocument = vi.fn()
        render(
            <DeliverableDetailPanel
                documentId="D"
                projectId="p1"
                docId="QSR-1"
                fileName="Market report"
                activityStatus="in_progress"
                canManage
                roleSlug="eng_admin"
                panePreview={panePreview}
                openLabel="Open in OneDrive"
                onOpenSubtaskDocument={onOpenSubtaskDocument}
                {...props}
            />,
        )
        return { pane, showDetailsHeader, panePreview, onOpenSubtaskDocument }
    }
    const previewFirstDocument = async () => {
        const buttons = await screen.findAllByRole('button', { name: 'Preview' })
        fireEvent.click(buttons[0])
    }

    beforeEach(() => {
        subtasks = [subtask('d2', 'in_progress', { externalId: 'x2', breadcrumb: ['General', 'Research'] })]
    })

    it('shows the document under its location', async () => {
        openPanel()
        await previewFirstDocument()
        expect(screen.getByText('previewing d2.docx')).toBeTruthy()
        expect(screen.getByText('Engagement root / Research')).toBeTruthy()
    })

    it('hides the details without unmounting them, and brings them back', async () => {
        const { panePreview, pane, showDetailsHeader } = openPanel()
        await previewFirstDocument()
        const row = screen.getAllByText('d2.docx')[0]
        expect(row.closest('.invisible')).not.toBeNull()

        act(() => { panePreview.close() })
        expect(screen.queryByText('previewing d2.docx')).toBeNull()
        expect(screen.getAllByText('d2.docx')[0]).toBe(row)
        expect(row.closest('.invisible')).toBeNull()
        expect(showDetailsHeader).toHaveBeenCalledTimes(1)
        expect(pane.setPaneSize).toHaveBeenCalledWith('medium')
    })

    it('comes back to the discussion it was opened from, with the thread never remounted', async () => {
        const { panePreview } = openPanel()
        await screen.findAllByRole('button', { name: 'Preview' })
        fireEvent.click(screen.getAllByRole('button', { name: /^Comments/ })[0])
        const mounts = thread.mounts
        expect(mounts).toBeGreaterThan(0)

        act(() => thread.openDocument!({ documentId: 'd2' }))
        expect(screen.getByText('previewing d2.docx')).toBeTruthy()

        act(() => { panePreview.close() })
        expect(screen.getByText('the thread')).toBeTruthy()
        expect(thread.mounts).toBe(mounts)
    })

    it('closes on Esc, and goes back to the details', async () => {
        const { panePreview, showDetailsHeader } = openPanel()
        await previewFirstDocument()
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(panePreview.get()).toBeNull()
        expect(showDetailsHeader).toHaveBeenCalledTimes(1)
    })

    it('opens the document it shows', async () => {
        const { onOpenSubtaskDocument } = openPanel()
        await previewFirstDocument()
        fireEvent.click(screen.getAllByRole('button', { name: 'Open in OneDrive' })[0])
        expect(onOpenSubtaskDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'd2', externalId: 'x2', fileName: 'd2.docx' }))
    })

    it('turns Open off in an approved deliverable', async () => {
        subtasks = [subtask('d2', 'approved')]
        const { onOpenSubtaskDocument } = openPanel({ activityStatus: 'approved' })
        await previewFirstDocument()
        const open = screen.getAllByRole('button', { name: 'Open in OneDrive' })[0]
        expect(open.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(open)
        expect(onOpenSubtaskDocument).not.toHaveBeenCalled()
    })
})
