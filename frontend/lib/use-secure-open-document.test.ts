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
        respond({ success: true, provider: 'google' })
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
        respond({ success: true, provider: 'google' })
        await act(async () => { result.current.requestNewAccessLink() })
        await act(async () => {})
        expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/projects/p1/documents/d1/sharing/regrant?fresh=1')
        expect(open).not.toHaveBeenCalled()
        expect(result.current.secureModalMode).toBe('email')
    })
})
