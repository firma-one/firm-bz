import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// "Authenticate Editor Access" (AC-10, P1-42): "check your email" only when the route says Google sent
// one, and a refusal shows the route's words.

const { toasts } = vi.hoisted(() => ({ toasts: [] as { type: string; title: string; message?: string }[] }))

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: (t: { type: string; title: string; message?: string }) => toasts.push(t) }) }))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({}) }))
vi.mock('./document-header', () => ({ DocumentHeader: () => null }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { ReGrantEditorAccessButton } from './document-edit-sheet'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
    toasts.length = 0
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('open', vi.fn(() => ({ closed: false })))
})
afterEach(() => vi.unstubAllGlobals())

const click = async () => {
    render(<ReGrantEditorAccessButton projectId="p1" documentId="d1" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Authenticate Editor Access/ })) })
}

describe('ReGrantEditorAccessButton', () => {
    it('says a link was emailed only when the route says Google sent one', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, provider: 'google', emailed: true }) })
        await click()
        expect(screen.getByText('Secure Edit Link Sent!')).toBeTruthy()
    })

    it('never claims an email when none was sent', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, provider: 'google', emailed: false }) })
        await click()
        expect(screen.queryByText('Secure Edit Link Sent!')).toBeNull()
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't authenticate editor access", message: "Storage didn't send a link to open it. Try again in a moment." }])
    })

    it("shows the route's reason for a refusal", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "Couldn't open this document · Google Drive refused access for sam@client.com.", code: 'grant_refused' }) })
        await click()
        expect(toasts[0]).toMatchObject({ title: "Couldn't authenticate editor access", message: "Couldn't open this document · Google Drive refused access for sam@client.com." })
    })
})
