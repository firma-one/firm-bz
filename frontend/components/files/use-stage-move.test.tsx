import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StageConfirmDialog, stageDoneTitle, stageFailureTitle, useStageMove, type StageConfirmation, type StageMoveResult } from './use-stage-move'

// The question a stage move asks (shared by Files, the panes and /tour's Files list).

const approve: StageConfirmation = {
    deliverable: { id: 'D', docId: 'QGT-12', name: 'GTM Playbook' },
    from: 'in_review',
    to: 'approved',
    externalCollaborators: 0,
    viewers: 0,
    approves: true,
}
const share: StageConfirmation = { ...approve, from: 'to_do', to: 'in_review', viewers: 1, approves: false }
const noop = vi.fn()

describe('StageConfirmDialog', () => {
    it('asks to approve, naming the deliverable by its Doc ID', () => {
        render(<StageConfirmDialog confirmation={approve} onOpenChange={noop} onCancel={noop} onConfirm={noop} />)
        expect(screen.getByText('Approve the deliverable?')).toBeTruthy()
        expect(screen.getByText('QGT-12 · GTM Playbook moves to Approved')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    })

    it('asks to share, counting who would newly see its documents', () => {
        render(<StageConfirmDialog confirmation={share} onOpenChange={noop} onCancel={noop} onConfirm={noop} />)
        expect(screen.getByText('Share its documents with 1 Reviewer?')).toBeTruthy()
        expect(screen.getByText(/1 Reviewer already sees the deliverable/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Move and share' })).toBeTruthy()
    })
})

describe('sending a change that may move the deliverable', () => {
    const answer = (status: number, body: object) => ({ ok: status < 400, status, json: async () => body }) as Response

    function Host({ request, onResult }: { request: (confirm: boolean) => Promise<Response>; onResult: (r: StageMoveResult) => void }) {
        const { send, dialog } = useStageMove()
        return <><button onClick={() => { void send(request).then(onResult) }}>send</button>{dialog}</>
    }
    const run = async (request: (confirm: boolean) => Promise<Response>) => {
        const onResult = vi.fn()
        render(<Host request={request} onResult={onResult} />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'send' })) })
        return onResult
    }

    it('asks, then resends with the agreement', async () => {
        const request = vi.fn(async (confirm: boolean) => confirm ? answer(200, {}) : answer(409, { needsConfirmation: approve }))
        const onResult = await run(request)
        expect(screen.getByText('Approve the deliverable?')).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })) })
        expect(request.mock.calls.map(([confirm]) => confirm)).toEqual([false, true])
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: true, deliverable: null }))
    })

    it('stops when the answer is no', async () => {
        const request = vi.fn(async () => answer(409, { needsConfirmation: approve }))
        const onResult = await run(request)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
        expect(request).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: false, cancelled: true }))
    })

    it.each([
        ['what the server said', async () => answer(409, { error: 'A shared document can\'t be made internal only.' }), 'A shared document can\'t be made internal only.'],
        ['the status when it said nothing', async () => answer(500, {}), 'The server answered 500. Try again.'],
        ['that it never got there', async () => { throw new TypeError('fetch failed') }, "Couldn't reach firma. Check your connection and try again."],
    ])('says why it failed: %s', async (_label, request, error) => {
        const onResult = await run(request)
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: false, error }))
    })

    it('carries the route\'s code, so a refused approval and a refused access are told apart', async () => {
        const onResult = await run(async () => answer(500, { error: "Couldn't move it to In review · clients couldn't be given access to what's in it. Try again.", code: 'stage_access' }))
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({
            ok: false,
            error: "Couldn't move it to In review · clients couldn't be given access to what's in it. Try again.",
            code: 'stage_access',
        }))
    })

    it('says "done, but…" when the move stood and part of it couldn\'t be done', async () => {
        const warning = 'Moved, but Market report stayed where it was · clients couldn\'t be given access to its documents. Move a document again to retry.'
        const onResult = await run(async () => answer(200, { deliverable: { id: 'D', status: 'to_do' }, warning }))
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: true, deliverable: { id: 'D', status: 'to_do' }, warning }))
    })

    it('says why when the session lookup itself threw', async () => {
        const onResult = await run(async () => { throw new Error('Sign in again to continue.') })
        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: false, error: 'Sign in again to continue.' }))
    })
})

describe('toast titles for a stage move', () => {
    it('names an approval when the approval was refused or put back', () => {
        expect(stageFailureTitle({ code: 'approval_not_recorded' })).toBe("Couldn't approve")
        expect(stageFailureTitle({ code: 'approval_storage' })).toBe("Couldn't approve")
        expect(stageFailureTitle({}, 'approved')).toBe("Couldn't approve")
    })
    it('names the stage for anything else', () => {
        expect(stageFailureTitle({ code: 'stage_access' }, 'in_review')).toBe("Couldn't change the stage")
        expect(stageFailureTitle({})).toBe("Couldn't change the stage")
    })
    it('names what was done', () => {
        expect(stageDoneTitle('approved')).toBe('Approved')
        expect(stageDoneTitle('in_review')).toBe('Stage updated')
    })
})

// A move whose answer is lost (the connection dropped) may still have been made: it's read back.
describe('a move whose answer never arrived', () => {
    vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

    function Mover({ onResult }: { onResult: (r: StageMoveResult) => void }) {
        const { move } = useStageMove()
        return <button onClick={() => { void move('p1', 'd1', 'approved').then(onResult) }}>move</button>
    }
    const moveWith = async (readBack: () => Promise<Response>) => {
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'PATCH') throw new TypeError('Failed to fetch')
            return readBack()
        })
        vi.stubGlobal('fetch', fetchMock)
        const onResult = vi.fn()
        render(<Mover onResult={onResult} />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'move' })) })
        await waitFor(() => expect(onResult).toHaveBeenCalled())
        vi.unstubAllGlobals()
        return { result: onResult.mock.calls[0][0] as StageMoveResult, fetchMock }
    }

    it('says it went through when the server has it at the new stage', async () => {
        const { result, fetchMock } = await moveWith(async () => ({ ok: true, json: async () => ({ sharing: { settings: { activity: { status: 'approved' } } } }) }) as Response)
        expect(result).toMatchObject({ ok: true, warning: expect.stringMatching(/the move went through/) })
        expect(fetchMock.mock.calls[1][0]).toBe('/api/projects/p1/documents/d1/sharing')
    })

    it("says it couldn't reach the server when the stage didn't change", async () => {
        const { result } = await moveWith(async () => ({ ok: true, json: async () => ({ sharing: { settings: { activity: { status: 'in_review' } } } }) }) as Response)
        expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^Couldn't reach/) })
    })

    it('says it could not reach the server when the read-back fails too', async () => {
        const { result } = await moveWith(async () => { throw new TypeError('Failed to fetch') })
        expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^Couldn't reach/) })
    })
})
