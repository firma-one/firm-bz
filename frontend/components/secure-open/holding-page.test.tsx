import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { SecureOpenHoldingPage, SLOW_AFTER_MS } from './holding-page'
import {
    holdingTabChannelName,
    holdingTabUrl,
    parseHoldingTabHash,
    type HoldingTabMessage,
} from '@/lib/secure-open/holding-tab'

vi.mock('@/config/brand', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/config/brand')>()), BRAND_NAME: 'Firma' }))

// The /open page: shows what the opening tab tells it, never decides or navigates by itself.

const KEY = 'abcdef0123456789abcdef01'
let hook: BroadcastChannel
let heard: HoldingTabMessage[]

function at(info: { fileName: string; provider?: 'onedrive' | 'google' }) {
    window.location.hash = holdingTabUrl({ key: KEY, ...info }).split('#')[1]
}
const tell = async (m: HoldingTabMessage) => {
    hook.postMessage(m)
    await act(() => new Promise((r) => setTimeout(r, 20)))
}

beforeEach(() => {
    heard = []
    hook = new BroadcastChannel(holdingTabChannelName(KEY))
    hook.onmessage = (e) => heard.push(e.data)
})
afterEach(() => {
    hook.close()
    window.location.hash = ''
    vi.useRealTimers()
})

describe('SecureOpenHoldingPage', () => {
    it('names Firma, the file and where it opens, in the page and the tab title', async () => {
        at({ fileName: 'Deepak article #7.docx', provider: 'onedrive' })
        render(<SecureOpenHoldingPage />)
        expect(screen.getByText('Deepak article #7.docx')).toBeTruthy()
        expect(screen.getByText('OneDrive · SharePoint')).toBeTruthy()
        expect(screen.getByText('Checking your access, then opening it in OneDrive')).toBeTruthy()
        expect(document.title).toBe('Opening Deepak article #7.docx · Firma')
        await act(() => new Promise((r) => setTimeout(r, 20)))
        expect(heard).toEqual([{ type: 'ready' }])
    })

    it('leaves the provider out when it is not known', () => {
        at({ fileName: 'Plan.xlsx' })
        render(<SecureOpenHoldingPage />)
        expect(screen.getByText('Checking your access, then opening it')).toBeTruthy()
    })

    it('says it is still working after a few seconds', () => {
        vi.useFakeTimers()
        at({ fileName: 'Plan.xlsx', provider: 'google' })
        render(<SecureOpenHoldingPage />)
        act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS) })
        expect(screen.getByText('Still working · this can take a moment the first time')).toBeTruthy()
        expect(screen.getByText('This tab moves to the document on its own.')).toBeTruthy()
    })

    it('shows the access as ready on hand-off', async () => {
        at({ fileName: 'Plan.xlsx', provider: 'onedrive' })
        render(<SecureOpenHoldingPage />)
        await tell({ type: 'state', state: 'done', provider: 'onedrive' })
        expect(screen.getByText('Access ready')).toBeTruthy()
        expect(screen.getByText(/opening OneDrive/)).toBeTruthy()
    })

    it("shows the hook's reason on a failure, with Try again only when it's worth it", async () => {
        at({ fileName: 'Plan.xlsx', provider: 'onedrive' })
        render(<SecureOpenHoldingPage />)
        await tell({ type: 'state', state: 'error', reason: "You don't have access to this document.", retry: false })
        expect(screen.getByRole('alert').textContent).toContain("You don't have access to this document.")
        expect(document.title).toBe("Couldn't open Plan.xlsx · Firma")
        expect(screen.getByRole('button', { name: 'Back to Firma' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()

        await tell({ type: 'state', state: 'error', reason: 'Opening this document is taking too long.', retry: true })
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await act(() => new Promise((r) => setTimeout(r, 20)))
        expect(heard.at(-1)).toEqual({ type: 'retry' })
        expect(screen.getByRole('status')).toBeTruthy()
    })

    it('Back to Firma closes the tab Firma opened', async () => {
        const close = vi.spyOn(window, 'close').mockImplementation(() => {})
        at({ fileName: 'Plan.xlsx' })
        render(<SecureOpenHoldingPage />)
        await tell({ type: 'state', state: 'error', reason: 'No.', retry: false })
        fireEvent.click(screen.getByRole('button', { name: 'Back to Firma' }))
        expect(close).toHaveBeenCalled()
    })

    it('without a document to open, says so and offers a way back', () => {
        render(<SecureOpenHoldingPage />)
        expect(screen.getByText(/nothing to open here/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Back to Firma' })).toBeTruthy()
    })
})

describe('parseHoldingTabHash', () => {
    it('reads back what holdingTabUrl wrote', () => {
        const url = holdingTabUrl({ key: KEY, fileName: 'Q3 report & notes #2.docx', mimeType: 'application/pdf', provider: 'google' })
        expect(url.startsWith('/open#')).toBe(true)
        expect(parseHoldingTabHash(url.slice(url.indexOf('#')))).toEqual({
            key: KEY, fileName: 'Q3 report & notes #2.docx', mimeType: 'application/pdf', provider: 'google',
        })
    })

    it('ignores a hash it did not write, and never carries a link to go to', () => {
        expect(parseHoldingTabHash('')).toBeNull()
        expect(parseHoldingTabHash('#k=short&n=x')).toBeNull()
        expect(parseHoldingTabHash(`#k=${KEY}&n=`)).toBeNull()
        const parsed = parseHoldingTabHash(`#k=${KEY}&n=x&p=dropbox&url=https://evil.example`)
        expect(parsed).toEqual({ key: KEY, fileName: 'x', mimeType: undefined, provider: undefined })
    })
})
