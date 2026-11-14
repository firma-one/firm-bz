import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

/**
 * /tour's Discussions, as a Lead sees the app's: Threads | Memos (| RAID when passed), the sub-tab in
 * the URL, and Memos over canned memos in memory: the pane, Find actions, Add. Nothing is sent.
 */

const h = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: h.addToast }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))

import { DemoEngagementComments as Comments } from './demo-engagement-comments'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'

const engagement = DEMO_FIRM.clients[0].engagements[0]
/** As the tour's layout provides it. */
const DemoEngagementComments = (props: React.ComponentProps<typeof Comments>) => <TooltipProvider><Comments {...props} /></TooltipProvider>
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

beforeEach(() => {
    window.history.replaceState(null, '', '/tour/acme/q2?tab=comments')
    h.addToast.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('/tour sends nothing') }))
})
afterEach(() => vi.unstubAllGlobals())

describe('the switch on /tour', () => {
    it('Threads and Memos with their counts, the lock on Memos, and no RAID without one', async () => {
        render(<DemoEngagementComments engagement={engagement} />)
        await settle()
        const tabs = screen.getAllByRole('tab')
        expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Threads', 'Memos'])
        expect(within(tabs[1]).getByText('3')).toBeTruthy()
        expect(within(tabs[1]).getByRole('img', { name: /^Internal only/ })).toBeTruthy()
        expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    })

    it('keeps the sub-tab in the URL beside the tour\'s own tab', async () => {
        render(<DemoEngagementComments engagement={engagement} />)
        await settle()
        fireEvent.click(screen.getByRole('tab', { name: /^Memos/ }))
        expect(new URLSearchParams(window.location.search).get('tab')).toBe('comments')
        expect(new URLSearchParams(window.location.search).get('view')).toBe('memos')
    })

    it('RAID takes the same optional body as the app', async () => {
        window.history.replaceState(null, '', '/tour/acme/q2?tab=comments&view=raid')
        render(<DemoEngagementComments engagement={engagement} renderRaid={() => <p>Tour RAID</p>} raidCount={5} />)
        await settle()
        expect(screen.getByRole('tab', { name: /^RAID5/ }).getAttribute('aria-selected')).toBe('true')
        expect(screen.getByText('Tour RAID')).toBeTruthy()
    })
})

describe('Memos on /tour', () => {
    async function openMemos() {
        window.history.replaceState(null, '', '/tour/acme/q2?tab=comments&view=memos')
        render(<DemoEngagementComments engagement={engagement} />)
        await settle()
    }

    it('lists the canned memos newest first, and opens the newest as the app would read its file', async () => {
        await openMemos()
        const rows = screen.getAllByTestId(/^memo-row-/).map((r) => r.getAttribute('data-testid'))
        expect(rows).toEqual(['memo-row-tour-memo-weekly', 'memo-row-tour-memo-kickoff', 'memo-row-tour-memo-scoping'])
        expect(screen.getByText('Each memo is a Markdown file in “Internal Memos” in your Google Drive.')).toBeTruthy()

        const pane = screen.getByRole('region', { name: 'Memo' })
        expect(await within(pane).findByRole('heading', { name: 'Weekly check-in' }, { timeout: 2000 })).toBeTruthy()
        expect(within(pane).getByText(/· Alex Jordan$/)).toBeTruthy()
        expect(within(pane).getByText(/latest figures by end of next week/)).toBeTruthy()
        expect(within(pane).getByRole('button', { name: 'Open in Google Drive' }).hasAttribute('disabled')).toBe(true)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('Find actions answers with canned proposals, and an applied one is noted on the memo', async () => {
        await openMemos()
        fireEvent.click(screen.getByTestId('memo-row-tour-memo-kickoff'))
        const pane = screen.getByRole('region', { name: 'Memo' })
        await within(pane).findByRole('heading', { name: 'Kickoff call' }, { timeout: 2000 })
        expect(within(pane).getAllByText('Dana Whitfield:')[0].tagName).toBe('STRONG')

        const actions = screen.getByRole('region', { name: 'Action items' })
        fireEvent.click(within(actions).getByRole('button', { name: 'Identify action items in Kickoff call' }))
        fireEvent.click(await within(actions).findByRole('button', { name: 'Apply 1 selected' }, { timeout: 3000 }))
        await waitFor(() => expect(within(screen.getByTestId('memo-row-tour-memo-kickoff')).getByText('1 action item applied')).toBeTruthy(), { timeout: 3000 })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('a memo added joins the list and opens', async () => {
        await openMemos()
        fireEvent.click(screen.getByRole('button', { name: /Add internal memo/ }))
        fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Budget review' } })
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2030-01-15' } })
        fireEvent.change(screen.getByLabelText('Notes or transcript'), { target: { value: 'Agreed to send the revised budget' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save memo' }))
        await waitFor(() => expect(h.addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Memo saved', message: 'Saved as 2030-01-15-Budget-review.md in Internal Memos.' })), { timeout: 3000 })
        // The sheet closes; the new memo is the one open.
        const pane = await screen.findByRole('region', { name: 'Memo' }, { timeout: 3000 })
        expect(await within(pane).findByRole('heading', { name: 'Budget review' }, { timeout: 3000 })).toBeTruthy()
        expect(fetch).not.toHaveBeenCalled()
    })
})
