import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// The Files Status cell under derived stages (.claude/plans/deliverable-stages-blocked.md): a
// deliverable's only reads; a document's move asks first when its deliverable would be shown to
// the client or approved.

vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { FileStatusCell } from './file-property-cells'

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

    it('asks before the move shows its deliverable to the client, then sends it agreed', async () => {
        answer = (body) => (body.confirm ? { status: 200, json: { deliverable: { id: 'D', status: 'in_progress' } } } : { status: 409, json: CONFIRMATION })
        const { onSaved } = cell()
        await pick('In progress')
        // What the move opens to them is the documents: they see the deliverable's card already.
        expect(await screen.findByText('Share its documents with 1 external contributor?')).toBeTruthy()
        // Named by its Doc ID, as everywhere in the app
        expect(screen.getByText('QSR-9 · Market report moves to In progress')).toBeTruthy()
        expect(screen.getByText('QSR-9 · Market report')).toBeTruthy()
        expect(screen.getByText(/1 external contributor already sees the deliverable\. From then on they.ll see its documents too/)).toBeTruthy()
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
