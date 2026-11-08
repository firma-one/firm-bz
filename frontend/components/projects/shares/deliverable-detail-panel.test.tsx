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
vi.mock('@/components/ui/document-action-menu', () => ({
    // Its "Move to trash" item, as the menu calls it.
    DocumentActionMenu: ({ document, onDeleteDocument }: { document: { name: string }; onDeleteDocument?: () => void }) =>
        onDeleteDocument ? <button type="button" onClick={onDeleteDocument}>{`Trash ${document.name}`}</button> : null,
}))
const { toasts } = vi.hoisted(() => ({ toasts: [] as { type: string; title: string; message?: string }[] }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: (t: { type: string; title: string; message?: string }) => toasts.push(t) }) }))

import { DeliverableDetailPanel } from './deliverable-detail-panel'
import { createPanePreview } from './pane-preview'

const subtask = (id: string, status: string | null, extra: object = {}) => ({
    id, documentId: id, fileName: `${id}.docx`, docId: id.toUpperCase(), dueDate: null,
    assigneeUserId: null, assigneeName: null, assigneeEmail: null, status, ...extra,
})

let subtasks: any[] = []
let stageCalls: { url: string; body: any }[] = []
/** Answers for a route, to make it refuse: "[METHOD ]url fragment" → [status, body]. */
let refusals: Record<string, [number, unknown]> = {}
let writes: { url: string; method?: string; body: any }[] = []
let members: any[] = []
let sharing: unknown = { sharing: { settings: {} } }

beforeEach(() => {
    stageCalls = []
    refusals = {}
    writes = []
    members = []
    sharing = { sharing: { settings: {} } }
    toasts.length = 0
    subtasks = [
        subtask('d1', 'approved'),
        subtask('d2', 'in_progress', { blocked: { reason: 'client', note: 'Q3 export', at: 'x', by: 'u' } }),
        subtask('d3', 'not_started'),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response
        if (init?.method && init.method !== 'GET') writes.push({ url, method: init.method, body: init.body ? JSON.parse(init.body as string) : null })
        const method = init?.method ?? 'GET'
        const refused = Object.entries(refusals).find(([key]) => {
            const [m, fragment] = key.includes(' ') ? key.split(' ') : [null, key]
            return (!m || m === method) && url.includes(fragment)
        })
        if (refused) return json(refused[1][1], refused[1][0])
        if (url.includes('/sharing/activity')) {
            stageCalls.push({ url, body: JSON.parse(init?.body as string) })
            return json({ deliverable: { id: 'D', status: 'in_progress' } })
        }
        if (url.includes('/subtasks')) return json({ subtasks, deliverable: { ownerUserId: null } })
        if (url.includes('/members')) return json({ members })
        if (url.includes('/doc-comments')) return json({ messages: [] })
        if (url.includes('/drive-action') || url.includes('/assignee')) return json({ ok: true })
        return json(sharing)
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

    it('marks an internal only document, and leaves it out of the progress', async () => {
        subtasks = [subtask('d1', 'approved'), subtask('d2', 'in_progress', { isPrivate: true })]
        const onSubtaskStatusChange = vi.fn()
        panel({ onSubtaskStatusChange })
        await waitFor(() => expect(screen.getByText('1 of 1 documents approved')).toBeTruthy())
        expect(screen.getByText('D2')).toBeTruthy()
        expect(screen.getByRole('img', { name: 'Internal only' })).toBeTruthy()
        expect(onSubtaskStatusChange).toHaveBeenLastCalledWith(1, 1)
    })

    it('changes nothing once the engagement is completed', async () => {
        panel({ readOnly: true, canManage: false })
        fireEvent.click(await screen.findByRole('button', { name: '1 not on the Board' }))
        expect(screen.queryByRole('button', { name: 'Add to Board' })).toBeNull()
        expect(screen.getByText('D1')).toBeTruthy()
    })

    it("offers a reviewer no action once the engagement is completed", async () => {
        panel({ readOnly: true, canManage: false, roleSlug: 'eng_viewer', isExternalViewer: true, activityStatus: 'in_review' })
        await waitFor(() => expect(screen.getByText('D1')).toBeTruthy())
        expect(screen.queryByRole('button', { name: 'Request changes' })).toBeNull()
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

describe('writes in the pane say when they fail', () => {
    // BD-1: the trash the Files list uses, read for its answer.
    it('moves a document to the trash through the Files trash, after asking', async () => {
        subtasks = [subtask('d2', 'in_progress', { externalId: 'x2' })]
        panel()
        fireEvent.click(await screen.findByRole('button', { name: 'Trash d2.docx' }))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to trash' })) })
        expect(writes).toEqual([{ url: '/api/drive-action', method: 'POST', body: { action: 'trash', fileId: 'x2', projectId: 'p1', fileName: 'd2.docx' } }])
        expect(toasts).toEqual([{ type: 'success', title: 'Moved to trash', message: "d2.docx moved to the storage's trash" }])
        expect(screen.queryByRole('button', { name: 'Trash d2.docx' })).toBeNull()
    })

    it('keeps the row and says why when the trash is refused', async () => {
        subtasks = [subtask('d2', 'in_progress', { externalId: 'x2' })]
        refusals = { '/drive-action': [409, { error: 'OneDrive has this locked. Close it everywhere, then try again.' }] }
        panel()
        fireEvent.click(await screen.findByRole('button', { name: 'Trash d2.docx' }))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to trash' })) })
        expect(toasts).toEqual([{ type: 'error', title: 'Move to trash failed', message: 'OneDrive has this locked. Close it everywhere, then try again.' }])
        expect(screen.getByRole('button', { name: 'Trash d2.docx' })).toBeTruthy()
    })

    // BD-2
    it('puts the assignee back when the change is refused', async () => {
        subtasks = [subtask('d2', 'in_progress', { assigneeUserId: 'u1', assigneeName: 'Ana Lead' })]
        refusals = { '/assignee': [403, { error: 'Only a Lead can assign this.' }] }
        panel()
        await screen.findAllByText('d2.docx')
        await act(async () => { fireEvent.click(await screen.findByLabelText('Unassign')) })
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't change the assignee", message: 'Only a Lead can assign this.' }])
        expect(screen.getAllByText('Ana Lead').length).toBeGreaterThan(0)
    })

    // P1-63
    it('puts the Lead back when the change is refused, and says why', async () => {
        members = [
            { userId: 'u1', name: 'Ana Lead', email: 'ana@firm.com', avatarUrl: null, role: 'eng_admin' },
            { userId: 'u2', name: 'Ben Member', email: 'ben@firm.com', avatarUrl: null, role: 'eng_member' },
        ]
        refusals = { '/documents/D/assignee': [500, { error: 'Something went wrong on our side. Try again.' }] }
        const { container } = panel()
        await waitFor(() => expect(screen.getByText('No lead')).toBeTruthy())
        fireEvent.click(screen.getByText('No lead'))
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Ben Member/ })) })
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't change the Lead", message: 'Something went wrong on our side. Try again.' }])
        expect(container.textContent).toContain('No lead')
    })

    // BD-3, and AC-11: only the options are sent.
    it('flips a delivery toggle back when the save is refused, sending only the options', async () => {
        refusals = { 'PUT /documents/D/sharing': [403, { error: 'Your plan does not include download controls.' }] }
        panel()
        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
        await waitFor(() => expect((screen.getAllByRole('switch')[0] as HTMLButtonElement).disabled).toBe(false))
        const toggle = screen.getAllByRole('switch')[0]
        await act(async () => { fireEvent.click(toggle) })
        expect(writes[0].body).not.toHaveProperty('guest')
        expect(writes[0].body).not.toHaveProperty('externalCollaborator')
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't save delivery settings", message: 'Your plan does not include download controls.' }])
        expect(toggle.getAttribute('aria-checked')).toBe('false')
    })

    it("doesn't offer the toggles after a failed load, so no default is saved over the real settings", async () => {
        refusals = { 'GET /documents/D/sharing': [500, { error: 'Failed to load sharing' }] }
        panel()
        expect(await screen.findByText("Couldn't load the description")).toBeTruthy()
        expect(screen.queryByPlaceholderText('Add a description…')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
        expect(await screen.findByText("Couldn't load the delivery settings")).toBeTruthy()
        expect(screen.queryAllByRole('switch')).toEqual([])
    })

    // BD-4
    it('marks the description not saved, with why', async () => {
        panel()
        const box = await screen.findByPlaceholderText('Add a description…')
        await waitFor(() => expect((box as HTMLTextAreaElement).disabled).toBe(false))
        refusals = { 'PUT /documents/D/sharing': [403, { error: "This engagement is completed, so it's read only." }] }
        fireEvent.change(box, { target: { value: 'Fee schedule' } })
        expect(await screen.findByText("Not saved · This engagement is completed, so it's read only.", {}, { timeout: 3000 })).toBeTruthy()
    })

    // EM-4
    it("says its documents didn't load, never that there are none", async () => {
        refusals = { '/subtasks': [500, { error: 'Something went wrong on our side. Try again.' }] }
        panel()
        expect(await screen.findByText("Couldn't load this deliverable's documents")).toBeTruthy()
        expect(screen.queryByText('No files in this deliverable yet.')).toBeNull()
        expect(screen.queryByText('No documents yet')).toBeNull()
    })
})
