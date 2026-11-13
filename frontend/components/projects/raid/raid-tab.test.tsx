import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, within, fireEvent, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { RaidTab, RaidTabView, useRaidCount, type RaidHandlers } from './raid-tab'
import { demoRaidLog } from '@/components/demo/demo-raid'
import { RAID_CHANGED_EVENT } from '@/lib/raid/raid-shared'

/**
 * Discussions › RAID: Brio's suggestions wait in a strip with their source; the log filters by type and
 * Open or Closed; a completed engagement offers nothing to change.
 */

const NOW = new Date('2026-11-12T12:00:00Z')

function handlers(): RaidHandlers & Record<string, ReturnType<typeof vi.fn>> {
    return {
        onCheckNow: vi.fn(async () => ({ message: 'Nothing new since the last check.', error: null })),
        onAccept: vi.fn(async () => null),
        onDismiss: vi.fn(async () => null),
        onAdd: vi.fn(async () => null),
        onEdit: vi.fn(async () => null),
        onClose: vi.fn(async () => null),
        onReopen: vi.fn(async () => null),
    }
}

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

// Rendering the table's selects and menus is slow on a busy machine.
describe('RaidTabView', { timeout: 20_000 }, () => {
    it("shows Brio's suggestions with their source: a thread's quote, a memo's link and never its words, what an attachment adds to", () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('suggests 3')).toBeTruthy()
        expect(screen.getByText('Nothing enters the log until someone accepts it')).toBeTruthy()

        const memo = screen.getByTestId('raid-suggestion-raid-suggest-depreciation')
        expect(within(memo).getByText('Internal source')).toBeTruthy()
        expect(within(memo).queryByRole('blockquote')).toBeNull()
        expect(memo.querySelector('blockquote')).toBeNull()

        const thread = screen.getByTestId('raid-suggestion-raid-suggest-1099')
        expect(thread.querySelector('blockquote')?.textContent).toBe("“I'll chase the 1099-B and send it before the end of the month.”")
        expect(within(thread).getByText(/^Thread · QSR-9 · Dana · /)).toBeTruthy()

        const attach = screen.getByTestId('raid-suggestion-raid-suggest-pricing')
        expect(within(attach).getByText('· adds to the open Issue “QSR-9 overdue”')).toBeTruthy()
    })

    it('accepts and dismisses through its handlers', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept Dana sends the brokerage 1099-B by Nov 29' })) })
        expect(h.onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 'raid-suggest-1099' }))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dismiss Rental depreciation is scoped separately' })) })
        expect(h.onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'raid-suggest-depreciation' }))
    })

    it('filters by type with counts, and by Open or Closed', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        expect(within(bar).getByRole('button', { name: 'All 7' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(bar).getByRole('button', { name: 'Risks 2' })).toBeTruthy()
        expect(within(bar).getByRole('button', { name: 'Decisions 2' })).toBeTruthy()
        expect(screen.getAllByTestId(/^raid-row-/)).toHaveLength(7)

        fireEvent.click(within(bar).getByRole('button', { name: 'Issues 2' }))
        expect(screen.getAllByTestId(/^raid-row-/).map((r) => r.getAttribute('data-testid')).sort()).toEqual(['raid-row-raid-overdue', 'raid-row-raid-waiting'])

        fireEvent.click(within(bar).getByRole('button', { name: 'Closed' }))
        expect(screen.getByText('Nothing closed here yet.')).toBeTruthy()
    })

    it('shows where each kept entry comes from and how it closes, and an overdue Issue in the danger tone', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const overdue = screen.getByTestId('raid-row-raid-overdue')
        expect(within(overdue).getByText('From status · closes itself when approved')).toBeTruthy()
        expect(within(overdue).getByText('Open').closest('span[class*="bg-tag-red-bg"]')).toBeTruthy()
        const waiting = screen.getByTestId('raid-row-raid-waiting')
        expect(within(waiting).getByText('Open').closest('span[class*="bg-tag-yellow-bg"]')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-scope')).getByText('Recorded').closest('span[class*="bg-tag-blue-bg"]')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-planning')).getByText('Add a mitigation')).toBeTruthy()
    })

    it('says when Brio last checked, and what Check now found', async () => {
        const h = handlers()
        render(<RaidTabView log={{ ...demoRaidLog(NOW), lastCheckedAt: new Date(2026, 10, 12, 8, 2).toISOString() }} engagementBase="" readOnly={false} now={new Date(2026, 10, 12, 15, 0)} {...h} />)
        expect(screen.getByText('Checked today 08:02')).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check now' })) })
        expect(h.onCheckNow).toHaveBeenCalled()
        expect(screen.getByRole('status').textContent).toBe('Nothing new since the last check.')
    })

    it('a completed engagement offers nothing to change', () => {
        render(<RaidTabView log={{ ...demoRaidLog(NOW), readOnly: true }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('Read only · completed')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
        expect(screen.queryByRole('button', { name: /Add item/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /^Accept / })).toBeNull()
        expect(screen.queryByText('Add a mitigation')).toBeNull()
    })

    it('adds an entry through its handler', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
        fireEvent.click(screen.getByRole('radio', { name: 'Issue' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand guidelines missing' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to the log' })) })
        expect(h.onAdd).toHaveBeenCalledWith({ type: 'ISSUE', title: 'Brand guidelines missing', notes: null })
    })
})

describe('useRaidCount', { timeout: 20_000 }, () => {
    it('reads the count, and follows the tab on this page', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { count: 7 } }), { status: 200 })))
        const { result } = renderHook(() => useRaidCount('p1'))
        await waitFor(() => expect(result.current).toBe(7))
        act(() => { window.dispatchEvent(new CustomEvent(RAID_CHANGED_EVENT, { detail: { projectId: 'p1', count: 8 } })) })
        expect(result.current).toBe(8)
        act(() => { window.dispatchEvent(new CustomEvent(RAID_CHANGED_EVENT, { detail: { projectId: 'other', count: 1 } })) })
        expect(result.current).toBe(8)
    })

    it('stays empty for someone the log is not for', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }))
        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useRaidCount('p1'))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/raid?view=count'))
        expect(result.current).toBeNull()
    })
})

describe('RaidTab', { timeout: 20_000 }, () => {
    it('shows the log once it loads, under the double mount React does in development', async () => {
        // The tab once cleared its "still mounted" flag on the first, simulated unmount and never set it
        // again, so the log arrived and was dropped: "Loading the RAID log…" forever (2026-11-13).
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: demoRaidLog(NOW) }), { status: 200 })))
        render(<StrictMode><RaidTab projectId="p1" engagementBase="" /></StrictMode>)
        expect(await screen.findByText(/suggests/)).toBeTruthy()
        expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    })
})
