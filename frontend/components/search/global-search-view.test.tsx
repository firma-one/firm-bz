import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Doc Search never shows a failed search, a failed filter load or a failed open as "nothing there"
// (EM-6, P2-62, P1-79).

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }))
vi.mock('@/components/shell/shell-data-context', () => ({ useOptionalShellData: () => null }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { GlobalSearchView, openFailureText } from './global-search-view'
import { searchFailureText } from './search-failed'

type Answer = { status: number; body: unknown } | 'drop'
let pickerAnswer: Answer
let searchAnswers: Answer[]
let deeplinkAnswer: Answer
const fetchMock = vi.fn(async (url: string) => {
    const answer = url.includes('/picker-data') ? pickerAnswer
        : url.includes('/search?') ? (searchAnswers.shift() ?? { status: 200, body: { files: [] } })
        : url.includes('/api/deeplink') ? deeplinkAnswer
        : { status: 404, body: {} }
    if (answer === 'drop') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(answer.body), { status: answer.status })
})

const FILE = { externalId: 'x1', documentId: 'd1', fileName: 'Budget.xlsx', engagementId: 'e1', updatedAt: '2026-11-01T00:00:00Z', matchType: 'name' }

beforeEach(() => {
    addToast.mockReset()
    fetchMock.mockClear()
    pickerAnswer = { status: 200, body: { clients: [], engagements: [], deliverables: [] } }
    searchAnswers = []
    deeplinkAnswer = { status: 200, body: { url: '/d/g/f/acme/c/c1/e/e1/files#doc-file:d1' } }
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const search = (text: string) => fireEvent.change(screen.getByLabelText('Document search'), { target: { value: text } })

describe('GlobalSearchView when a search fails (EM-6)', () => {
    it('says the search couldn\'t run, with the reason and a retry, never "No results found"', async () => {
        searchAnswers = [{ status: 500, body: { error: "Search couldn't run. Something went wrong on our side. Try again." } }]
        render(<GlobalSearchView firmId="f1" />)
        search('budget')
        expect(await screen.findByText("Search couldn't run", {}, { timeout: 3000 })).toBeTruthy()
        expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy()
        expect(screen.queryByText('No results found')).toBeNull()

        searchAnswers = [{ status: 200, body: { files: [FILE] } }]
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Budget.xlsx')).toBeTruthy()
        expect(screen.queryByText("Search couldn't run")).toBeNull()
    })

    it('says a dropped request never got there', async () => {
        searchAnswers = ['drop']
        render(<GlobalSearchView firmId="f1" />)
        search('budget')
        expect(await screen.findByText(/Couldn.t reach firma/, {}, { timeout: 3000 })).toBeTruthy()
    })

    it('still says "No results found" when the search ran and found nothing', async () => {
        render(<GlobalSearchView firmId="f1" />)
        search('budget')
        expect(await screen.findByText('No results found', {}, { timeout: 3000 })).toBeTruthy()
    })
})

describe('GlobalSearchView opening a result (P1-79)', () => {
    it('says why "Open in Files" failed instead of a spinner and nothing', async () => {
        searchAnswers = [{ status: 200, body: { files: [FILE] } }]
        deeplinkAnswer = { status: 403, body: { error: 'Forbidden' } }
        render(<GlobalSearchView firmId="f1" />)
        search('budget')
        fireEvent.click(await screen.findByText('Budget.xlsx', {}, { timeout: 3000 }))
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({
            type: 'error', title: "Couldn't open this file", message: "You don't have access to its engagement anymore.",
        }))
    })

    it('words each status the link resolver answers', () => {
        expect(openFailureText(404)).toBe('Its engagement was deleted or moved.')
        expect(openFailureText(401)).toBe('Sign in again to open it.')
        expect(openFailureText(502)).toBe('The server answered 502. Try again.')
    })
})

describe('GlobalSearchView filter options (P2-62)', () => {
    it('says the options didn\'t load, with a retry, instead of "Nothing available"', async () => {
        pickerAnswer = { status: 500, body: { error: 'x' } }
        render(<GlobalSearchView firmId="f1" />)
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/picker-data'), expect.anything()))
        const trigger = screen.getByRole('button', { name: /Client/ })
        trigger.focus()
        fireEvent.keyDown(trigger, { key: 'Enter' })
        expect(await screen.findByText("Couldn't load options.")).toBeTruthy()
        expect(screen.queryByText('Nothing available')).toBeNull()

        pickerAnswer = { status: 200, body: { clients: [{ id: 'c1', name: 'Contoso' }], engagements: [], deliverables: [] } }
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Contoso')).toBeTruthy()
    })
})

describe('searchFailureText', () => {
    it('drops a "Search couldn\'t run." the route already put first, and fills in a missing reason', () => {
        expect(searchFailureText("Search couldn't run. Something went wrong on our side. Try again.")).toBe('Something went wrong on our side. Try again.')
        expect(searchFailureText('Sign in again to search.')).toBe('Sign in again to search.')
        expect(searchFailureText(null)).toBe('Something went wrong. Try again.')
    })
})
