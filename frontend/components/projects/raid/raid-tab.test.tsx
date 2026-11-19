import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, within, fireEvent, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { RaidTab, RaidTabView, checkStatusTip, useRaidCounts, type RaidHandlers } from './raid-tab'
import { demoRaidLog } from '@/components/demo/demo-raid'
import { RAID_CHANGED_EVENT, dueDay, nextWeekStart, type RaidItemView, type RaidLogPayload } from '@/lib/raid/raid-shared'

/**
 * The RAID tab: Brio's suggestions wait in their own Suggested view with their source; + Add opens a side
 * pane; the log filters by type and
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
    it("keeps Brio's suggestions in their own view, each with its source: a thread's quote, what an attachment adds to", () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('Risks, Actions, Issues and Decisions · Internal only')).toBeTruthy()
        // The log opens on its entries alone; the Suggested button counts what waits.
        expect(screen.queryByTestId('raid-suggestion-raid-suggest-1099')).toBeNull()
        const button = screen.getByTestId('raid-suggested-view')
        expect(button.textContent).toBe('Suggested3')
        fireEvent.click(button)
        expect(button.getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('From new messages and memos. Nothing enters the log until someone accepts it.')).toBeTruthy()
        expect(screen.queryAllByTestId(/^raid-row-/)).toHaveLength(0)

        const thread = screen.getByTestId('raid-suggestion-raid-suggest-1099')
        expect(within(thread).getByText("“The brokerage still hasn't issued the 1099-B, and they won't say when.”")).toBeTruthy()
        expect(within(thread).getByText(/^Thread · QSR-9 · Dana · /)).toBeTruthy()

        const attach = screen.getByTestId('raid-suggestion-raid-suggest-pricing')
        expect(within(attach).getByText(/^adds to the open Issue “QSR-9 overdue”/)).toBeTruthy()

        // Open goes back to the log.
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        expect(button.getAttribute('aria-pressed')).toBe('false')
        expect(screen.getAllByTestId(/^raid-row-/).length).toBeGreaterThan(0)
    })

    it('accepts and dismisses through its handlers', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        fireEvent.click(screen.getByTestId('raid-suggested-view'))
        const title = 'The brokerage 1099-B may not arrive before the end of the month'
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Accept ${title}` })) })
        // Brio's priority kept, and its title untouched: accepted as Brio wrote it.
        expect(h.onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 'raid-suggest-1099' }), undefined, undefined)
        // A title edited on the row is accepted as edited. One that adds to an entry has no title of its own to edit.
        fireEvent.change(screen.getByDisplayValue(title), { target: { value: 'The joint account 1099-B may not arrive before the end of the month' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Accept ${title}` })) })
        expect(h.onAccept).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'raid-suggest-1099' }), undefined, 'The joint account 1099-B may not arrive before the end of the month')
        expect(screen.queryByDisplayValue('Pricing in section 4.2 may be out of date')).toBeNull()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dismiss Pricing in section 4.2 may be out of date' })) })
        expect(h.onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'raid-suggest-pricing' }))
    })

    it("lists a memo's suggestion with the rest, but it waits on the memo (§13): no Accept here, only the way to it", () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        fireEvent.click(screen.getByTestId('raid-suggested-view'))
        const memo = screen.getByTestId('raid-suggestion-tour-raid-weekly-1')
        expect(within(memo).getByText('Waits on the memo, with its action items')).toBeTruthy()
        expect(within(memo).queryByRole('button', { name: /^Accept / })).toBeNull()
        expect(within(memo).getByRole('link', { name: 'Review in Memos' }).getAttribute('href')).toBe('/d/e/q2/comments?view=memos&memo=tour-memo-weekly')
    })

    it('goes back to the whole open log once the last suggestion is handled, with the accepted one tinted', async () => {
        const first = demoRaidLog(NOW)
        const only = { ...first, suggestions: first.suggestions.filter((s) => s.id === 'raid-suggest-1099') }
        const accepted = only.suggestions[0]
        const after = { ...only, suggestions: [], items: [{ ...accepted, status: 'OPEN' as const }, ...only.items] }
        const h = handlers()
        const view = render(<RaidTabView log={only} engagementBase="" readOnly={false} now={NOW} {...h} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        fireEvent.click(within(bar).getByRole('button', { name: /^Risks/ }))
        fireEvent.click(screen.getByTestId('raid-suggested-view'))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Accept ${accepted.title}` })) })
        view.rerender(<RaidTabView log={after} engagementBase="" readOnly={false} now={NOW} {...h} />)

        expect(screen.getByTestId('raid-suggested-view').getAttribute('aria-pressed')).toBe('false')
        expect(within(bar).getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true')
        expect(within(bar).getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByTestId('raid-row-raid-suggest-1099').getAttribute('data-flash')).toBe('true')
        // The button stays, without a count.
        expect(screen.getByTestId('raid-suggested-view').textContent).toBe('Suggested')
    })

    it('shimmers the Suggested button once for suggestions this browser has not seen, and not again once they are', async () => {
        window.localStorage.clear()
        const first = render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        const button = screen.getByTestId('raid-suggested-view')
        await waitFor(() => expect(button.className).toContain('fm-shimmer-once'))
        fireEvent.click(button)
        expect(button.className).not.toContain('fm-shimmer-once')
        first.unmount()

        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
        expect(screen.getByTestId('raid-suggested-view').className).not.toContain('fm-shimmer-once')
    })

    it('filters by type with counts, and by Open or Closed', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        expect(within(bar).getByRole('button', { name: 'All 8' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(bar).getByRole('button', { name: 'Risks 2' })).toBeTruthy()
        expect(within(bar).getByRole('button', { name: 'Actions 2' })).toBeTruthy()
        expect(within(bar).getByRole('button', { name: 'Decisions 2' })).toBeTruthy()
        expect(screen.getAllByTestId(/^raid-row-/)).toHaveLength(8)

        fireEvent.click(within(bar).getByRole('button', { name: 'Issues 2' }))
        expect(screen.getAllByTestId(/^raid-row-/).map((r) => r.getAttribute('data-testid')).sort()).toEqual(['raid-row-raid-overdue', 'raid-row-raid-waiting'])

        fireEvent.click(within(bar).getByRole('button', { name: 'Closed' }))
        expect(screen.getByText('Nothing closed here yet.')).toBeTruthy()
    })

    it('under the Actions filter, reads as an action list: no priority, "Action" and "Next step", and Done', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
        expect(headers()).toEqual(expect.arrayContaining(['Priority', 'Item', 'Due', 'Mitigation · next step']))

        fireEvent.click(within(bar).getByRole('button', { name: 'Actions 2' }))
        expect(screen.getAllByTestId(/^raid-row-/).map((r) => r.getAttribute('data-testid')).sort()).toEqual(['raid-row-raid-k1', 'raid-row-raid-letter'])
        expect(headers()).toEqual(expect.arrayContaining(['Action', 'Due', 'Next step']))
        expect(headers()).not.toContain('Priority')
        expect(headers()).not.toContain('Item')
        expect(within(bar).queryByRole('button', { name: 'Closed' })).toBeNull()

        fireEvent.click(within(bar).getByRole('button', { name: 'Done' }))
        expect(screen.getByText('Nothing done here yet.')).toBeTruthy()
    })

    it("shows an Action's due date, in red once it's past; other types have none", () => {
        const log = demoRaidLog(NOW)
        render(<RaidTabView log={log} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const letter = log.items.find((i) => i.id === 'raid-letter')!
        const k1 = log.items.find((i) => i.id === 'raid-k1')!
        const lateDue = within(screen.getByTestId('raid-row-raid-letter')).getByText(`${dueDay(letter.dueDate)} · overdue`)
        expect(lateDue.className).toContain('text-danger')
        expect(within(screen.getByTestId('raid-row-raid-letter')).getByText('Open').closest('span[class*="bg-tag-red-bg"]')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-k1')).getByRole('button', { name: `Due ${dueDay(k1.dueDate)} for ${k1.title}. Change` })).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-letter')).getByText('Add a next step')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-pace')).queryByRole('button', { name: /^Due / })).toBeNull()
    })

    it('a done Action reads "Done", and its menu offers Mark done while it is open', async () => {
        const log = demoRaidLog(NOW)
        const done: RaidLogPayload = {
            ...log,
            items: log.items.map((i): RaidItemView => (i.id === 'raid-k1' ? { ...i, status: 'CLOSED', closedReason: 'Done by Alex · Nov 12', canReopen: true } : i)),
        }
        render(<RaidTabView log={done} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        fireEvent.click(within(bar).getByRole('button', { name: 'Closed' }))
        const row = screen.getByTestId('raid-row-raid-k1')
        expect(within(row).getByText('Done').closest('span[class*="bg-tag-green-bg"]')).toBeTruthy()
        expect(within(row).getByTitle('Done by Alex · Nov 12')).toBeTruthy()

        fireEvent.click(within(bar).getByRole('button', { name: 'Open' }))
        const trigger = within(screen.getByTestId('raid-row-raid-letter')).getByRole('button', { name: 'More for Send Dana the revised engagement letter' })
        fireEvent.keyDown(trigger, { key: 'Enter' })
        expect(await screen.findByRole('menuitem', { name: 'Mark done' })).toBeTruthy()
    })

    it('lists an Assumption saved before Actions with the Decisions, labelled', () => {
        const log = demoRaidLog(NOW)
        const scope = log.items.find((i) => i.id === 'raid-scope')!
        const legacy: RaidItemView = { ...scope, id: 'raid-legacy', type: 'ASSUMPTION', status: 'OPEN', title: 'Client keeps the same brokerage' }
        render(<RaidTabView log={{ ...log, items: [...log.items, legacy] }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const bar = screen.getByRole('toolbar', { name: 'Filter the RAID log' })
        fireEvent.click(within(bar).getByRole('button', { name: 'Decisions 3' }))
        const row = screen.getByTestId('raid-row-raid-legacy')
        // A gray tag beside its words, and the Decisions' letter (its own word for screen readers).
        expect(within(row).getAllByText('Assumption').some((el) => el.closest('span[class*="bg-tag-gray-bg"]'))).toBe(true)
        expect(within(row).getByText('D')).toBeTruthy()
    })

    it('shows where each kept entry comes from and how it closes, and an overdue Issue in the danger tone', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const overdue = screen.getByTestId('raid-row-raid-overdue')
        // Single-line rows like the Files table: how it closes is the Source cell's tooltip.
        expect(within(overdue).getByTitle('From status · closes itself when approved')).toBeTruthy()
        expect(within(overdue).getByText('Open').closest('span[class*="bg-tag-red-bg"]')).toBeTruthy()
        const waiting = screen.getByTestId('raid-row-raid-waiting')
        expect(within(waiting).getByText('Open').closest('span[class*="bg-tag-yellow-bg"]')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-scope')).getByText('Recorded').closest('span[class*="bg-tag-blue-bg"]')).toBeTruthy()
        expect(within(screen.getByTestId('raid-row-raid-planning')).getByText('Add a mitigation')).toBeTruthy()
    })

    it('links a Health entry to the Overview chart it comes from', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" readOnly={false} now={NOW} {...handlers()} />)
        const healthLink = (id: string) => within(screen.getByTestId(id)).getByRole('link', { name: 'Health' }).getAttribute('href')
        expect(healthLink('raid-row-raid-pace')).toBe('/d/e/q2/analytics#ring-pace')
        expect(healthLink('raid-row-raid-planning')).toBe('/d/e/q2/analytics#ring-planning')
    })

    it("says whether Brio has read the threads and memos as they are now, as the Summary says it's out of date", () => {
        const { rerender } = render(<RaidTabView log={{ ...demoRaidLog(NOW), conversation: 'current' }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('Up to date')).toBeTruthy()
        expect(screen.queryByText('Out of date')).toBeNull()
        rerender(<RaidTabView log={{ ...demoRaidLog(NOW), conversation: 'changed' }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('Out of date')).toBeTruthy()
        // Nothing to read: nothing to say.
        rerender(<RaidTabView log={{ ...demoRaidLog(NOW), conversation: 'none' }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.queryByText('Up to date')).toBeNull()
        expect(screen.queryByText('Out of date')).toBeNull()
    })

    it('says when Brio last checked in the tooltip', () => {
        const at = new Date(2026, 10, 12, 8, 2).toISOString()
        const later = new Date(2026, 10, 12, 15, 0)
        expect(checkStatusTip('current', at, later)).toBe('Brio has read every thread message. Last checked today 08:02.')
        expect(checkStatusTip('changed', at, later)).toBe('Threads changed since Brio last checked, today 08:02. Brio reads them once a day, or now with the sparkle.')
        expect(checkStatusTip('changed', null, later)).toMatch(/^Brio hasn't read this engagement's threads yet\./)
    })

    it('checks with the sparkle, and says what it found', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check with Brio' })) })
        expect(h.onCheckNow).toHaveBeenCalled()
        expect(screen.getByRole('status').textContent).toBe('Nothing new since the last check.')
    })

    it('after a check that suggested something, offers to review it in the Suggested view', async () => {
        const h = handlers()
        vi.mocked(h.onCheckNow).mockResolvedValueOnce({ message: null, error: null, suggested: 2 })
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check with Brio' })) })
        expect(screen.getByRole('status').textContent).toBe('2 new suggestions·Review')
        fireEvent.click(screen.getByRole('button', { name: 'Review' }))
        expect(screen.getByTestId('raid-suggested-view').getAttribute('aria-pressed')).toBe('true')
        expect(screen.queryByRole('status')).toBeNull()
    })

    it("offers no check while Brio isn't available", async () => {
        const h = handlers()
        render(<RaidTabView log={{ ...demoRaidLog(NOW), canCheck: false }} engagementBase="" readOnly={false} now={NOW} {...h} />)
        const sparkle = screen.getByRole('button', { name: 'Check with Brio' })
        expect(sparkle.getAttribute('aria-disabled')).toBe('true')
        await act(async () => { fireEvent.click(sparkle) })
        expect(h.onCheckNow).not.toHaveBeenCalled()
    })

    it('a completed engagement offers nothing to change', () => {
        render(<RaidTabView log={{ ...demoRaidLog(NOW), readOnly: true }} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        expect(screen.getByText('Read only · completed')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Check with Brio' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
        expect(screen.queryByText('Up to date')).toBeNull()
        expect(screen.queryByTestId('raid-suggested-view')).toBeNull()
        expect(screen.queryByText('Add a mitigation')).toBeNull()
    })

    it('shows each Risk and Issue with its priority, High first, and a dash for the others', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        const rows = screen.getAllByTestId(/^raid-row-/).map((r) => r.getAttribute('data-testid'))
        expect(rows.slice(0, 2)).toEqual(['raid-row-raid-overdue', 'raid-row-raid-pace'])
        // Editable on a live entry: a picker named for it.
        expect(within(screen.getByTestId('raid-row-raid-overdue')).getByRole('combobox', { name: /^Priority of / }).textContent).toContain('High')
        expect(within(screen.getByTestId('raid-row-raid-k1')).getByLabelText('No priority')).toBeTruthy()
    })

    it("offers Brio's priority on a Risk or an Issue it suggests, to keep or change before accepting", () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        fireEvent.click(screen.getByTestId('raid-suggested-view'))
        const risk = screen.getByTestId('raid-suggestion-raid-suggest-1099')
        expect(within(risk).getByRole('combobox', { name: 'Priority of The brokerage 1099-B may not arrive before the end of the month' }).textContent).toContain('Medium')
        // The pricing issue adds to an entry already in the log, so it has none of its own to set.
        expect(within(screen.getByTestId('raid-suggestion-raid-suggest-pricing')).queryByRole('combobox')).toBeNull()
    })

    it('adds in a side pane titled for its type, asking a priority only for a Risk or an Issue', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        const pane = screen.getByRole('dialog')
        expect(within(pane).getByRole('heading', { name: 'New Risk' })).toBeTruthy()
        const priority = within(pane).getByRole('radiogroup', { name: 'Priority' })
        expect(within(priority).getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true')
        fireEvent.click(within(pane).getByRole('radio', { name: 'Decision' }))
        expect(within(pane).getByRole('heading', { name: 'New Decision' })).toBeTruthy()
        expect(within(pane).queryByRole('radiogroup', { name: 'Priority' })).toBeNull()
        expect(within(pane).queryByLabelText(/^Mitigation/)).toBeNull()
    })

    it('opens the pane on the type the log is filtered to', () => {
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...handlers()} />)
        fireEvent.click(within(screen.getByRole('toolbar', { name: 'Filter the RAID log' })).getByRole('button', { name: /^Issues/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'New Issue' })).toBeTruthy()
    })

    it('asks an owner and a due date for an Action being added, and no priority', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('radio', { name: 'Action' }))
        expect(screen.queryByRole('radiogroup', { name: 'Priority' })).toBeNull()
        expect(screen.getByRole('combobox', { name: 'Owner' }).textContent).toBe('You')
        const due = screen.getByLabelText('Due') as HTMLInputElement
        expect(due.type).toBe('date')
        expect(due.value).toBe(nextWeekStart())
        expect(screen.getByLabelText(/^Next step/, { selector: 'textarea' })).toBeTruthy()

        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Send Dana the signed letter' } })
        fireEvent.change(due, { target: { value: '2026-11-20' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to the log' })) })
        // Left as You, the server makes the person adding it the owner.
        expect(h.onAdd).toHaveBeenCalledWith({ type: 'ACTION', title: 'Send Dana the signed letter', notes: null, dueDate: '2026-11-20' })
    })

    it('adds an entry through its handler', async () => {
        const h = handlers()
        render(<RaidTabView log={demoRaidLog(NOW)} engagementBase="" readOnly={false} now={NOW} {...h} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('radio', { name: 'Issue' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand guidelines missing' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to the log' })) })
        // A Risk or an Issue a person adds starts at Medium.
        expect(h.onAdd).toHaveBeenCalledWith({ type: 'ISSUE', title: 'Brand guidelines missing', notes: null, priority: 'MEDIUM' })
        // The pane closes once it's in.
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('tints the row an add made, so it can be found', async () => {
        const log = demoRaidLog(NOW)
        const h = handlers()
        const view = render(<RaidTabView log={log} engagementBase="" readOnly={false} now={NOW} {...h} />)
        const added = { ...log.items[0], id: 'raid-new', title: 'Brand guidelines missing' }
        vi.mocked(h.onAdd).mockImplementationOnce(async () => {
            view.rerender(<RaidTabView log={{ ...log, items: [added, ...log.items] }} engagementBase="" readOnly={false} now={NOW} {...h} />)
            return null
        })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brand guidelines missing' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to the log' })) })
        expect(screen.getByTestId('raid-row-raid-new').getAttribute('data-flash')).toBe('true')
        expect(screen.getByTestId('raid-row-raid-overdue').getAttribute('data-flash')).toBeNull()
    })
})

describe('useRaidCounts', { timeout: 20_000 }, () => {
    it('reads the count and the suggestions waiting, and follows the tab on this page', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { count: 7, suggested: 2 } }), { status: 200 })))
        const { result } = renderHook(() => useRaidCounts('p1'))
        await waitFor(() => expect(result.current).toEqual({ count: 7, suggested: 2 }))
        act(() => { window.dispatchEvent(new CustomEvent(RAID_CHANGED_EVENT, { detail: { projectId: 'p1', count: 8, suggested: 0 } })) })
        expect(result.current).toEqual({ count: 8, suggested: 0 })
        act(() => { window.dispatchEvent(new CustomEvent(RAID_CHANGED_EVENT, { detail: { projectId: 'other', count: 1, suggested: 5 } })) })
        expect(result.current).toEqual({ count: 8, suggested: 0 })
    })

    it('stays empty for someone the log is not for', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }))
        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useRaidCounts('p1'))
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
        expect((await screen.findByTestId('raid-suggested-view')).textContent).toBe('Suggested3')
        expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    })
})
