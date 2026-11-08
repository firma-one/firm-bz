import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// The Files Status cell under derived stages (.claude/plans/deliverable-stages-blocked.md): a
// deliverable's only reads; a document's move asks first when its deliverable would be shown to
// the client or approved.

vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { FileAssigneeCell, FileDueDateCell, FileStatusCell } from './file-property-cells'

let sent: any[] = []
let answer: (body: any) => { status: number; json: object } = () => ({ status: 200, json: {} })

beforeEach(() => {
    sent = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        sent.push(body)
        const { status, json } = answer(body)
        return { ok: status < 400, status, json: async () => json } as Response
    }))
})
afterEach(() => vi.unstubAllGlobals())

const cell = (props: Partial<React.ComponentProps<typeof FileStatusCell>> = {}) => {
    const onSaved = vi.fn()
    const onDeliverableChanged = vi.fn()
    const onAddToast = vi.fn()
    render(
        <FileStatusCell
            projectId="p1"
            documentId="d1"
            fileName="Budget.xlsx"
            isFolder={false}
            status="to_do"
            roleSlug="eng_admin"
            emptyLabel="Not set"
            emptyClassName=""
            onSaved={onSaved}
            onDeliverableChanged={onDeliverableChanged}
            onAddToast={onAddToast}
            {...props}
        />,
    )
    return { onSaved, onDeliverableChanged, onAddToast }
}

const pick = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: /To do|Not started/ }))
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: label })) })
}

const CONFIRMATION = {
    needsConfirmation: {
        deliverable: { id: 'D', docId: 'QSR-9', name: 'Market report' }, from: 'to_do', to: 'in_progress',
        externalCollaborators: 1, viewers: 0, approves: false,
    },
}

describe('FileStatusCell', () => {
    it("only reads a deliverable's stage: it follows its documents", () => {
        cell({ isFolder: true, status: 'in_progress' })
        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.getByText('In progress')).toBeTruthy()
    })

    it('offers a document Not started, the stage before the Board', async () => {
        cell()
        fireEvent.click(screen.getByRole('button', { name: /To do/ }))
        expect(await screen.findByRole('button', { name: 'Not started' })).toBeTruthy()
    })

    it('moves a document, and tells the row its deliverable followed', async () => {
        answer = () => ({ status: 200, json: { deliverable: { id: 'D', status: 'in_progress' } } })
        const { onSaved, onDeliverableChanged } = cell()
        await pick('In progress')
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('in_progress'))
        expect(onDeliverableChanged).toHaveBeenCalledWith({ id: 'D', status: 'in_progress' })
        expect(sent).toEqual([{ status: 'in_progress' }])
    })

    it('asks before the move shows its deliverable to someone new, then sends it agreed', async () => {
        answer = (body) => (body.confirm ? { status: 200, json: { deliverable: { id: 'D', status: 'in_progress' } } } : { status: 409, json: CONFIRMATION })
        const { onSaved } = cell()
        await pick('In progress')
        // What the move opens to them is the documents: they see the deliverable's card already.
        expect(await screen.findByText('Share its documents with 1 Limited Access contributor?')).toBeTruthy()
        // Named by its Doc ID, as everywhere in the app
        expect(screen.getByText('QSR-9 · Market report moves to In progress')).toBeTruthy()
        expect(screen.getByText('QSR-9 · Market report')).toBeTruthy()
        expect(screen.getByText(/1 Limited Access contributor already sees the deliverable\. From then on they.ll see its documents too/)).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move and share' })) })
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('in_progress'))
        expect(sent).toEqual([{ status: 'in_progress' }, { status: 'in_progress', confirm: true }])
    })

    it('leaves everything as it was when the move is called off', async () => {
        answer = () => ({ status: 409, json: CONFIRMATION })
        const { onSaved, onAddToast } = cell()
        await pick('In progress')
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })) })
        expect(onSaved).not.toHaveBeenCalled()
        expect(onAddToast).not.toHaveBeenCalled()
        expect(sent).toHaveLength(1)
    })
})

// P1-61 and the stage hand-off: a move that stood with a warning says so; a refusal names the action.
describe('FileStatusCell answers', () => {
    it('warns, with the route\'s words, when the move stood but its deliverable stayed', async () => {
        const warning = "Moved, but Market report stayed where it was · clients couldn't be given access to its documents. Move a document again to retry."
        answer = () => ({ status: 200, json: { deliverable: { id: 'D', status: 'to_do' }, warning } })
        const { onSaved, onAddToast } = cell()
        await pick('In progress')
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('in_progress'))
        expect(onAddToast).toHaveBeenCalledWith({ type: 'warning', title: 'Stage updated', message: warning })
    })

    it("says clients couldn't be given access, and keeps the stage", async () => {
        const error = "Couldn't move it to In progress · clients couldn't be given access to what's in it. Try again."
        answer = () => ({ status: 500, json: { error, code: 'stage_access' } })
        const { onSaved, onAddToast } = cell()
        await pick('In progress')
        await waitFor(() => expect(onAddToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't change the stage", message: error }))
        expect(onSaved).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /To do/ })).toBeTruthy()
    })

    it("titles an approval Firma couldn't record as one", async () => {
        const error = 'Approved in storage, but Firma couldn\'t record it. The file is locked and its approved version was copied to the Archive folder. Try again in a moment.'
        answer = () => ({ status: 500, json: { error, code: 'approval_not_recorded' } })
        const { onAddToast } = cell({ status: 'in_review' })
        fireEvent.click(screen.getByRole('button', { name: /In review/ }))
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Approved' })) })
        await waitFor(() => expect(onAddToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't approve", message: error }))
    })

    it('says the request never got there', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const { onAddToast } = cell()
        await pick('In progress')
        await waitFor(() => expect(onAddToast).toHaveBeenCalledWith({
            type: 'error', title: "Couldn't change the stage", message: "Couldn't reach firma. Check your connection and try again.",
        }))
    })
})

describe('FileDueDateCell answers (P1-62)', () => {
    const due = () => {
        const onSaved = vi.fn(), onError = vi.fn(), onWarning = vi.fn(), onOthersChanged = vi.fn()
        render(<FileDueDateCell projectId="p1" documentId="d1" dueDate="2026-10-18" placeholder="Not set"
            onSaved={onSaved} onError={onError} onWarning={onWarning} onOthersChanged={onOthersChanged} asProperty />)
        return { onSaved, onError, onWarning, onOthersChanged }
    }
    const clear = async () => {
        fireEvent.click(screen.getByRole('button'))
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Clear' })) })
    }

    it('saves, and warns when its reminders could not follow', async () => {
        answer = () => ({ status: 200, json: { dueDate: null, warning: "Due date saved, but its reminders and notices for Budget.xlsx couldn't all be updated. Set the date again to retry." } })
        const { onSaved, onWarning, onError } = due()
        await clear()
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null))
        expect(onWarning).toHaveBeenCalledWith("Due date saved, but its reminders and notices for Budget.xlsx couldn't all be updated. Set the date again to retry.")
        expect(onError).not.toHaveBeenCalled()
    })

    it("says why it wasn't saved, and shows the engagement's date when it moved anyway", async () => {
        const error = "Couldn't set the due date. The engagement's due date moved to Feb 10, 2027, but Budget.xlsx didn't. Try again."
        answer = () => ({ status: 500, json: { error, engagementDueDate: '2027-02-10T00:00:00.000Z' } })
        const { onSaved, onError, onOthersChanged } = due()
        await clear()
        await waitFor(() => expect(onError).toHaveBeenCalledWith(error))
        expect(onSaved).not.toHaveBeenCalled()
        expect(onOthersChanged).toHaveBeenCalled()
    })

    it('says the request never got there', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const { onError } = due()
        await clear()
        await waitFor(() => expect(onError).toHaveBeenCalledWith("Couldn't reach firma. Check your connection and try again."))
    })
})

describe('FileAssigneeCell answers (P1-65)', () => {
    it('says why, and keeps who it was', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const onSaved = vi.fn(), onError = vi.fn()
        render(<FileAssigneeCell projectId="p1" documentId="d1" assignee={{ id: 'u1', name: 'Ana Ruiz' }}
            people={[{ id: 'u1', name: 'Ana Ruiz' }, { id: 'u2', name: 'Raj Patel' }]} canEdit placeholder="—" onSaved={onSaved} onError={onError} />)
        fireEvent.click(screen.getByRole('button', { name: /Ana Ruiz/ }))
        await act(async () => { fireEvent.click(await screen.findByText('Raj Patel')) })
        await waitFor(() => expect(onError).toHaveBeenCalledWith("Couldn't reach firma. Check your connection and try again."))
        expect(onSaved).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /Ana Ruiz/ })).toBeTruthy()
    })

    it("says the route's words", async () => {
        answer = () => ({ status: 403, json: { error: 'Only a Lead can change the assignee.' } })
        const onError = vi.fn()
        render(<FileAssigneeCell projectId="p1" documentId="d1" assignee={null}
            people={[{ id: 'u2', name: 'Raj Patel' }]} canEdit placeholder="—" onSaved={vi.fn()} onError={onError} />)
        fireEvent.click(screen.getByRole('button'))
        await act(async () => { fireEvent.click(await screen.findByText('Raj Patel')) })
        await waitFor(() => expect(onError).toHaveBeenCalledWith('Only a Lead can change the assignee.'))
    })
})
