import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// The new tab opens on the click itself (a holding tab), and is pointed at the document once the
// grant comes back — or closed when Google sends an email instead.

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: async () => ({ data: { session: { access_token: 't' } } }),
            getUser: async () => ({ data: { user: { email: 'sam@client.com' } } }),
        },
    },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { useSecureOpenDocument } from './use-secure-open-document'

const doc = { documentId: 'd1', fileName: 'Plan.xlsx', externalId: 'ext1' }

function fakeTab() {
    return {
        closed: false,
        opener: {} as unknown,
        document: { title: '', createElement: () => ({ setAttribute: vi.fn(), textContent: '' }), body: { appendChild: vi.fn() } },
        location: { replace: vi.fn() },
        close: vi.fn(function (this: { closed: boolean }) { this.closed = true }),
    }
}

let tab: ReturnType<typeof fakeTab>
let open: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    tab = fakeTab()
    open = vi.fn(() => tab)
    fetchMock = vi.fn()
    vi.stubGlobal('open', open)
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const respond = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body })

describe('useSecureOpenDocument', () => {
    it('opens a holding tab on the click and points it at the document (Google: stays in "opened")', async () => {
        respond({ success: true, provider: 'google', documentUrl: 'https://docs.google.com/x' })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(open).toHaveBeenCalledTimes(1)
        expect(open).toHaveBeenCalledWith('', '_blank')
        expect(tab.opener).toBeNull()
        expect(tab.location.replace).toHaveBeenCalledWith('https://docs.google.com/x')
        expect(result.current.secureModalMode).toBe('opened')
    })

    it('SharePoint: same tab, then the brief "opening" state', async () => {
        respond({ success: true, provider: 'onedrive', documentUrl: 'https://contoso.sharepoint.com/doc' })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(tab.location.replace).toHaveBeenCalledWith('https://contoso.sharepoint.com/doc')
        expect(result.current.secureModalMode).toBe('opening')
    })

    it('closes the holding tab when Google emails instead', async () => {
        respond({ success: true, provider: 'google', emailed: true })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(tab.close).toHaveBeenCalled()
        expect(result.current.secureModalMode).toBe('email')
    })

    it('closes the holding tab on an error', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(tab.close).toHaveBeenCalled()
        expect(result.current.secureModalMode).toBe('error')
    })

    it('"Email me a new access link" asks again with ?fresh=1 and opens no tab', async () => {
        respond({ success: true, provider: 'google', documentUrl: 'https://docs.google.com/x' })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        open.mockClear()
        respond({ success: true, provider: 'google', emailed: true })
        await act(async () => { result.current.requestNewAccessLink() })
        await act(async () => {})
        expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/projects/p1/documents/d1/sharing/regrant?fresh=1')
        expect(open).not.toHaveBeenCalled()
        expect(result.current.secureModalMode).toBe('email')
    })

    // AC-10: "Check your email" only when the route says Google's email went out.
    it('never says to check email when no email was sent and there is no link', async () => {
        respond({ success: true, provider: 'google', emailed: false })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(tab.close).toHaveBeenCalled()
        expect(result.current.secureModalMode).toBe('error')
        expect(result.current.regrantError).toBe("Couldn't open this document · storage didn't send a link to open it. Try again in a moment.")
    })

    // P1-42: the route's words, and a 403 isn't read as "revoked".
    it("shows the route's reason for a refusal", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "This document couldn't be prepared. Try again in a moment.", code: 'pdf_unavailable' }) })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(result.current.regrantError).toBe("This document couldn't be prepared. Try again in a moment.")
    })

    it('a bare 403 says there is no access, not that it was revoked', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => { throw new Error('not json') } })
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(result.current.regrantError).toBe("You don't have access to this document. Ask the engagement's Lead if you need it.")
        expect(result.current.regrantError).not.toMatch(/revoked/)
    })

    it('says when the request never got there', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
        const { result } = renderHook(() => useSecureOpenDocument({ projectId: 'p1' }))
        await act(async () => { await result.current.handleSecureOpen(doc) })
        expect(result.current.regrantError).toBe("Couldn't reach firma. Check your connection and try again.")
    })
})
