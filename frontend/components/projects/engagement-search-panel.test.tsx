import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// An engagement search that couldn't run says so, with the reason and a retry, never "No results" (EM-6).

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('@/components/ui/document-action-menu', () => ({ DocumentActionMenu: () => null }))

import { EngagementSearchProvider, useEngagementSearch } from './engagement-search-context'
import { EngagementSearchPanel } from './engagement-search-panel'

let projectSeq = 0
let projectId = 'p0'

function Typer({ q }: { q: string }) {
    const { setSearchQuery } = useEngagementSearch()
    return <button type="button" onClick={() => setSearchQuery(q)}>type</button>
}

function renderPanel(q: string) {
    render(
        <EngagementSearchProvider projectId={projectId}>
            <Typer q={q} />
            <EngagementSearchPanel projectId={projectId} generalFolderId={null} confidentialFolderId={null} stagingFolderId={null} navigateToItem={async () => {}} />
        </EngagementSearchProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'type' }))
}

const fetchMock = vi.fn()

beforeEach(() => {
    // The search store is per project and outlives a render: a fresh project per test.
    projectId = `p${++projectSeq}`
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('EngagementSearchPanel when the search fails', () => {
    it("shows the route's reason and a retry, not \"No results\"", async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Search couldn't run. Something went wrong on our side. Try again." }), { status: 500 }))
        renderPanel('budget')
        expect(await screen.findByText("Search couldn't run", {}, { timeout: 2000 })).toBeTruthy()
        expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy()
        expect(screen.queryByText('No results')).toBeNull()

        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('No results', {}, { timeout: 2000 })).toBeTruthy()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('says a dropped request never got there', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        renderPanel('budget')
        expect(await screen.findByText(/Couldn.t reach firma/, {}, { timeout: 2000 })).toBeTruthy()
    })

    it('still says "No results" when the search ran and found nothing', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
        renderPanel('budget')
        await waitFor(() => expect(screen.getByText('No results')).toBeTruthy(), { timeout: 2000 })
        expect(screen.queryByText("Search couldn't run")).toBeNull()
    })
})
