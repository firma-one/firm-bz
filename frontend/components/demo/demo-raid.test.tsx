import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { DemoRaidOverviewCard, DemoRaidTab } from './demo-raid'

/**
 * The RAID log on /tour: the app's own tab and card over canned entries in memory. Accept, Dismiss and
 * Check with Brio work, and nothing reaches the network.
 */

const fetchSpy = vi.fn()

beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

// Rendering the table's selects and menus is slow on a busy machine.
describe('DemoRaidTab', { timeout: 20_000 }, () => {
    it('shows the mock: two suggestions from threads, one waiting on a memo, and seven entries', () => {
        render(<DemoRaidTab />)
        expect(screen.getByText('suggests 2')).toBeTruthy()
        expect(within(screen.getByRole('list', { name: 'Suggestions waiting on memos' })).getByRole('link', { name: 'Review in Memos' }).getAttribute('href'))
            .toBe('?tab=comments&view=memos&memo=tour-memo-weekly')
        expect(screen.getAllByTestId(/^raid-row-/)).toHaveLength(7)
    })

    it('accepting a suggestion puts it in the log; one that adds to an entry merges into it instead', async () => {
        render(<DemoRaidTab />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Accept Dana sends the brokerage 1099-B/ })) })
        expect(screen.getByTestId('raid-row-raid-suggest-1099')).toBeTruthy()
        expect(screen.getByText('suggests 1')).toBeTruthy()

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept Pricing in section 4.2 may be out of date' })) })
        expect(screen.queryByTestId('raid-row-raid-suggest-pricing')).toBeNull()
        expect(within(screen.getByTestId('raid-row-raid-overdue')).getByText('+1')).toBeTruthy()
        expect(screen.getAllByTestId(/^raid-row-/)).toHaveLength(8)
    })

    it('links each source to where it came from on the tour: Health to the Overview chart', () => {
        render(<DemoRaidTab />)
        const link = (rowId: string, name: string) => within(screen.getByTestId(rowId)).getByRole('link', { name }).getAttribute('href')
        expect(link('raid-row-raid-pace', 'Health')).toBe('?tab=analytics#ring-pace')
        expect(link('raid-row-raid-planning', 'Health')).toBe('?tab=analytics#ring-planning')
        expect(link('raid-row-raid-overdue', 'Board')).toBe('?tab=board')
    })

    it('dismissing a suggestion drops it', async () => {
        render(<DemoRaidTab />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dismiss Pricing in section 4.2 may be out of date' })) })
        expect(screen.queryByTestId('raid-suggestion-raid-suggest-pricing')).toBeNull()
        expect(screen.getAllByTestId(/^raid-row-/)).toHaveLength(7)
    })

    it('Check with Brio finds nothing new, in memory', async () => {
        vi.useFakeTimers()
        render(<DemoRaidTab />)
        expect(screen.getByText('Up to date')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Check with Brio' }))
        expect(screen.getByText('is checking…')).toBeTruthy()
        await act(async () => { await vi.advanceTimersByTimeAsync(800) })
        expect(screen.getByRole('status').textContent).toBe('Nothing new since the last check.')
        expect(screen.getByText('Up to date')).toBeTruthy()
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('DemoRaidOverviewCard', { timeout: 20_000 }, () => {
    it('renders the card over the same log, without asking the server', () => {
        render(<DemoRaidOverviewCard />)
        expect(screen.getByRole('heading', { name: 'RAID' })).toBeTruthy()
        expect(screen.getByRole('link', { name: '2 suggestions to review' })).toBeTruthy()
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
