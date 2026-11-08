import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// The Details pane's Blocked row (P1-65): a refused or dropped save says why, and what's shown stays as saved.

vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { BlockedProperty } from './blocked-property'

let answer: () => Promise<Response> = async () => ({ ok: true, status: 200, json: async () => ({ blocked: null }) }) as Response
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => answer())) })
afterEach(() => vi.unstubAllGlobals())

const row = () => {
    const onSaved = vi.fn(), onError = vi.fn()
    render(<BlockedProperty projectId="p1" documentId="d1" value={null} canEdit onSaved={onSaved} onError={onError} />)
    return { onSaved, onError }
}
const block = async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Blocked' }), { button: 0, ctrlKey: false })
    await act(async () => { fireEvent.click(await screen.findByText('Waiting on client')) })
}

describe('BlockedProperty', () => {
    it("says the route's words when it refuses", async () => {
        answer = async () => ({ ok: false, status: 403, json: async () => ({ error: 'Only a Lead or a Contributor · Full Access can block a document.' }) }) as Response
        const { onSaved, onError } = row()
        await block()
        await waitFor(() => expect(onError).toHaveBeenCalledWith('Only a Lead or a Contributor · Full Access can block a document.'))
        expect(onSaved).not.toHaveBeenCalled()
        expect(screen.getByText('Not blocked')).toBeTruthy()
    })

    it('says the request never got there, instead of nothing', async () => {
        answer = async () => { throw new TypeError('Failed to fetch') }
        const { onSaved, onError } = row()
        await block()
        await waitFor(() => expect(onError).toHaveBeenCalledWith("Couldn't reach firma. Check your connection and try again."))
        expect(onSaved).not.toHaveBeenCalled()
    })

    it('says the status when the route said nothing', async () => {
        answer = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json') } }) as unknown as Response
        const { onError } = row()
        await block()
        await waitFor(() => expect(onError).toHaveBeenCalledWith('The server answered 502. Try again.'))
    })
})
