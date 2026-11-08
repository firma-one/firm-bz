import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** Export and deletion say why they failed, and a failed check for an open request isn't "none". */

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { DataPrivacyCard } from './data-privacy-card'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => addToast.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('DataPrivacyCard', () => {
    it('a failed export toasts the route’s reason', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (
            url === '/api/account/export'
                ? json({ error: 'Something went wrong on our side building the file. Try again, or contact support if it keeps failing.' }, 500)
                : json({ data: { open: null } })
        )))
        render(<DataPrivacyCard />)
        fireEvent.click(screen.getByRole('button', { name: /Download/ }))
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({
            type: 'error',
            title: "Couldn't download your data",
            message: 'Something went wrong on our side building the file. Try again, or contact support if it keeps failing.',
        }))
    })

    it('a refused deletion request toasts the route’s reason', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
            init?.method === 'POST'
                ? json({ error: "It wasn't saved on our side, so nothing was requested. Try again, or email support@firmaone.com." }, 500)
                : json({ data: { open: null } })
        )))
        render(<DataPrivacyCard />)
        fireEvent.click(screen.getByRole('button', { name: /Request deletion/ }))
        fireEvent.click(screen.getAllByRole('button', { name: /Request deletion/ }).at(-1)!)
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
            title: "Couldn't request deletion",
            message: "It wasn't saved on our side, so nothing was requested. Try again, or email support@firmaone.com.",
        })))
    })

    it('says it couldn’t check for an earlier request, rather than reading as none', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ error: "Couldn't check for an earlier request." }, 500)))
        render(<DataPrivacyCard />)
        expect(await screen.findByText(/Couldn't check for an earlier request\./)).toBeTruthy()
    })
})
