import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen, fireEvent } from '@testing-library/react'

// The engagement Overview: a failed load is never zero counts (P1-66); Brio's summary failures say
// why, the credit limit in its own words (P1-77); a link to one of its charts lands once they load.

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't', user: { email: 'me@firm.com' } } }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/lib/actions/project', () => ({
    updateEngagementInsightsSummary: vi.fn(),
    approveEngagementAiSummary: vi.fn(),
    dismissEngagementAiSummary: vi.fn(async () => ({ ok: true, data: undefined })),
}))
vi.mock('@/components/projects/floating-ai-chat', () => ({ FloatingAiChat: () => null }))

import { EngagementInsightsDashboard, overviewFailureText, summaryFailureNote, useRingAnchor } from './engagement-insights-dashboard'

const fetchMock = vi.fn()
beforeEach(() => {
    addToast.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('EngagementInsightsDashboard when the Overview fails to load (P1-66)', () => {
    it('shows the reason and a retry, never zero counts or "nothing overdue"', async () => {
        fetchMock.mockResolvedValueOnce(answer(500, { error: 'Something went wrong on our side. Try again.' }))
        render(<EngagementInsightsDashboard projectId="p1" />)
        expect(await screen.findByText("Couldn't load this overview")).toBeTruthy()
        expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy()
        expect(screen.queryByText('nothing overdue')).toBeNull()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })

    it('tries again on Retry', async () => {
        fetchMock.mockResolvedValueOnce(answer(500, { error: 'x' })).mockResolvedValueOnce(answer(500, { error: 'Still down.' }))
        render(<EngagementInsightsDashboard projectId="p1" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Still down.')).toBeTruthy()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('says a dropped request never got there', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        render(<EngagementInsightsDashboard projectId="p1" />)
        expect(await screen.findByText(/Couldn.t reach firma/)).toBeTruthy()
    })
})

describe('overviewFailureText', () => {
    it("words the guards' bare answers, and passes the route's own words through", async () => {
        expect(await overviewFailureText(answer(403, { error: 'Forbidden' }))).toBe("You don't have access to this engagement's overview.")
        expect(await overviewFailureText(answer(404, { error: 'Project not found' }))).toBe('This engagement was deleted or moved.')
        expect(await overviewFailureText(answer(401, { error: 'Unauthorized' }))).toBe('Sign in again to see it.')
        expect(await overviewFailureText(answer(500, { error: 'Something went wrong on our side. Try again.' }))).toBe('Something went wrong on our side. Try again.')
        expect(await overviewFailureText(new Response('<html>', { status: 502 }))).toBe('The server answered 502. Try again.')
    })
})

describe('summaryFailureNote (P1-77)', () => {
    it("shows the credit limit's own words, not \"try again\"", async () => {
        const limit = "You've used this month's 500 AI credits. They refill on Dec 1."
        expect(await summaryFailureNote(answer(429, { error: limit, kind: 'period' }))).toBe(limit)
    })

    it('says when Brio is not set up, and words a refusal', async () => {
        expect(await summaryFailureNote(answer(503, { error: 'AI is not configured' }))).toMatch(/is not configured\.$/)
        expect(await summaryFailureNote(answer(403, { error: 'Forbidden' }))).toMatch(/^You can't ask .+ for a summary on this engagement\.$/)
        expect(await summaryFailureNote(answer(409, { error: 'This engagement is completed. It is read only.' }))).toBe('This engagement is completed. It is read only.')
        expect(await summaryFailureNote(answer(500, {}))).toMatch(/couldn't write a summary\. Try again\.$/)
    })
})

describe('useRingAnchor', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        window.history.replaceState(null, '', '/')
    })

    it("scrolls to the chart a link names (the RAID log's Health entries) once the charts are shown, once", () => {
        const chart = document.createElement('div')
        chart.id = 'ring-pace'
        chart.scrollIntoView = vi.fn()
        document.body.appendChild(chart)
        window.history.replaceState(null, '', '/e/q2/analytics#ring-pace')

        const { rerender } = renderHook(({ shown }) => useRingAnchor(shown), { initialProps: { shown: false } })
        expect(chart.scrollIntoView).not.toHaveBeenCalled()
        rerender({ shown: true })
        expect(chart.scrollIntoView).toHaveBeenCalledTimes(1)
        expect(chart.classList.contains('ring-pulse')).toBe(true)

        // A refresh hides and shows the charts again: the page stays where the reader is.
        rerender({ shown: false })
        rerender({ shown: true })
        expect(chart.scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it('jumps again when the hash changes on the page, and ignores a hash that is not a chart', () => {
        const chart = document.createElement('div')
        chart.id = 'ring-planning'
        chart.scrollIntoView = vi.fn()
        document.body.appendChild(chart)
        window.history.replaceState(null, '', '/e/q2/analytics#summary')

        renderHook(() => useRingAnchor(true))
        expect(chart.scrollIntoView).not.toHaveBeenCalled()
        act(() => {
            window.history.replaceState(null, '', '/e/q2/analytics#ring-planning')
            window.dispatchEvent(new HashChangeEvent('hashchange'))
        })
        expect(chart.scrollIntoView).toHaveBeenCalledTimes(1)
    })
})
