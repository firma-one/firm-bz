import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// Saving a due date under the nesting rule (.claude/plans/due-date-rule.md): a conflict asks, with
// the fix, the alternative, or closing to cancel.

vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { useDueDateSave, type DueSaveResult } from './use-due-date-save'

const CONFLICT = {
    kind: 'after_deliverable',
    proposed: '2026-11-12T00:00:00.000Z',
    document: { id: 'd1', docId: 'QSR-16', name: 'Plan.xlsx' },
    deliverable: { id: 'D', docId: 'QSR-9', name: 'Market report', due: '2026-11-05T00:00:00.000Z' },
}

let sent: any[] = []
let results: DueSaveResult[] = []

function Harness() {
    const { save, dialog } = useDueDateSave()
    return (
        <>
            <button type="button" onClick={async () => { results.push(await save('p1', 'd1', '2026-11-12')) }}>Set Nov 12</button>
            {dialog}
        </>
    )
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
    sent = []
    results = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string)
        sent.push(body)
        const resolved = body.fixes || body.dueDate !== '2026-11-12'
        return (resolved
            ? { ok: true, status: 200, json: async () => ({ dueDate: body.dueDate, alsoChanged: body.fixes ? [{ id: 'D', dueDate: body.dueDate }] : [] }) }
            : { ok: false, status: 409, json: async () => ({ needsResolution: CONFLICT }) }) as Response
    }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const ask = async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Set Nov 12' }))
    return screen.findByText('Due after its deliverable')
}

describe('useDueDateSave', () => {
    it('names both sides of the conflict', async () => {
        await ask()
        expect(screen.getByText(/QSR-16 · Plan\.xlsx · Nov 12, 2026/)).toBeTruthy()
        expect(screen.getByText('QSR-9 · Market report')).toBeTruthy()
        expect(screen.getByText(/A document can.t be due after its deliverable/)).toBeTruthy()
    })

    it('moves the deliverable with it, on the fix', async () => {
        await ask()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move the deliverable to Nov 12' })) })
        await waitFor(() => expect(results).toHaveLength(1))
        expect(sent[1]).toEqual({ dueDate: '2026-11-12', fixes: ['move_deliverable'] })
        expect(results[0]).toMatchObject({ ok: true, alsoChanged: [{ id: 'D' }] })
    })

    it("keeps the document on the deliverable's day, on the alternative", async () => {
        await ask()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep QSR-16 on Nov 5' })) })
        await waitFor(() => expect(results).toHaveLength(1))
        expect(sent[1]).toEqual({ dueDate: '2026-11-05T00:00:00.000Z' })
        expect(results[0]).toMatchObject({ ok: true, dueDate: '2026-11-05T00:00:00.000Z' })
    })

    it('saves nothing when closed', async () => {
        await ask()
        await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }) })
        await waitFor(() => expect(results).toEqual([{ ok: false, cancelled: true }]))
        expect(sent).toHaveLength(1)
    })
})
