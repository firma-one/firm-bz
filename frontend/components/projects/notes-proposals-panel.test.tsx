import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react'

/**
 * The proposal rows: what starts selected, what "Apply N selected" applies, and what a failed apply
 * says. Nothing is sent anywhere: `apply` is a stub and fetch is stubbed.
 */

vi.mock('@/lib/actions/user-reminders', () => ({ createManualReminder: vi.fn() }))
vi.mock('@/components/files/use-due-date-save', () => ({ useDueDateSave: () => ({ save: vi.fn(), dialog: null }) }))

import { NotesProposalsReview, formatProposalDay, useNotesProposals, type NotesProposalsFound } from './notes-proposals-panel'
import type { NotesProposal } from '@/lib/ai/notes-proposals'

afterEach(() => vi.unstubAllGlobals())

const FOUND: NotesProposalsFound = {
    proposals: [
        { kind: 'reminder', id: 'reminder-1', title: 'Chase the brokerage 1099-B', date: '2026-11-16', quote: 'I need to chase the brokerage 1099-B, still missing' },
        {
            kind: 'dueDate', id: 'dueDate-2', deliverableId: 'del-6', docId: 'NPT-6', deliverableName: 'Estimated Payments Schedule',
            currentDate: '2026-12-15', newDate: '2026-11-30', quote: 'Wants the estimated payments schedule moved up, needs it before 1 Dec',
        },
        { kind: 'deliverable', id: 'deliverable-3', name: 'Rental Property Depreciation Review', dueDate: null, quote: 'Asked if we can also look at the rental property depreciation; new piece of work' },
    ],
    skipped: [{ quote: 'Next check-in after Thanksgiving', reason: 'has no date' }],
    dropped: 1,
}

const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name })

describe('NotesProposalsReview', () => {
    it('reads as the mock: count, kinds, the change, its quote, the skipped line', () => {
        render(<NotesProposalsReview found={FOUND} apply={vi.fn()} onDismiss={vi.fn()} />)
        expect(screen.getByRole('heading').textContent).toMatch(/found 3 actions$/)
        expect(screen.getByText('Nothing changes until you apply it')).toBeTruthy()
        expect(screen.getByText('Reminder for you')).toBeTruthy()
        expect(screen.getByText('NPT-6 · Estimated Payments Schedule')).toBeTruthy()
        expect(screen.getByText('“I need to chase the brokerage 1099-B, still missing”')).toBeTruthy()
        expect(screen.getByText('“Next check-in after Thanksgiving” has no date, so it isn\'t proposed.')).toBeTruthy()
        expect(screen.getByText(/1 more didn't match the notes or the Board/)).toBeTruthy()
    })

    it('selects reminders and due dates, never a new deliverable', () => {
        render(<NotesProposalsReview found={FOUND} apply={vi.fn()} onDismiss={vi.fn()} />)
        expect(checkbox(/reminder for you/i).getAttribute('data-state')).toBe('checked')
        expect(checkbox(/due date/i).getAttribute('data-state')).toBe('checked')
        const deliverable = checkbox(/new deliverable/i)
        expect(deliverable.getAttribute('data-state')).toBe('unchecked')
        expect(deliverable.hasAttribute('disabled')).toBe(true)
        expect(screen.getByRole('button', { name: 'Apply 2 selected' })).toBeTruthy()
    })

    it('"Apply 2 selected" applies the reminder and the due date, one at a time, and not the deliverable', async () => {
        const apply = vi.fn(async (_p: NotesProposal) => ({ ok: true as const }))
        render(<NotesProposalsReview found={FOUND} apply={apply} onDismiss={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Apply 2 selected' }))
        await waitFor(() => expect(screen.getByText('Due date moved')).toBeTruthy())
        expect(apply.mock.calls.map(([p]) => p.kind)).toEqual(['reminder', 'dueDate'])
        expect(screen.getByText('Reminder added')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Apply 0 selected' }).hasAttribute('disabled')).toBe(true)
    })

    it('an unchecked row is left out', async () => {
        const apply = vi.fn(async (_p: NotesProposal) => ({ ok: true as const }))
        render(<NotesProposalsReview found={FOUND} apply={apply} onDismiss={vi.fn()} />)
        fireEvent.click(checkbox(/due date/i))
        fireEvent.click(screen.getByRole('button', { name: 'Apply 1 selected' }))
        await waitFor(() => expect(screen.getByText('Reminder added')).toBeTruthy())
        expect(apply).toHaveBeenCalledTimes(1)
    })

    it('a failed apply says why, on its own row', async () => {
        const apply = vi.fn(async () => ({ ok: false as const, error: 'Only a Lead can change due dates.' }))
        render(<NotesProposalsReview found={{ ...FOUND, proposals: [FOUND.proposals[1]] }} apply={apply} onDismiss={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
        expect((await screen.findByRole('alert')).textContent).toBe("Couldn't move the due date. Only a Lead can change due dates.")
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })

    it('a closed due-date question leaves the row as it was', async () => {
        const apply = vi.fn(async () => ({ ok: false as const, cancelled: true as const }))
        render(<NotesProposalsReview found={{ ...FOUND, proposals: [FOUND.proposals[1]] }} apply={apply} onDismiss={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
        await waitFor(() => expect(apply).toHaveBeenCalled())
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy()
    })

    it('a new deliverable opens its creation when the page can, and never through apply', () => {
        const apply = vi.fn()
        const openDeliverable = vi.fn()
        render(<NotesProposalsReview found={FOUND} apply={apply} openDeliverable={openDeliverable} onDismiss={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        expect(openDeliverable).toHaveBeenCalledWith(FOUND.proposals[2])
        expect(apply).not.toHaveBeenCalled()
    })

    it('read only: nothing can be applied', () => {
        render(<NotesProposalsReview found={FOUND} apply={vi.fn()} onDismiss={vi.fn()} readOnly />)
        expect(screen.getByRole('button', { name: 'Apply 2 selected' }).hasAttribute('disabled')).toBe(true)
        for (const b of screen.getAllByRole('button', { name: 'Apply' })) expect(b.hasAttribute('disabled')).toBe(true)
    })

    it('Dismiss all hands back', () => {
        const onDismiss = vi.fn()
        render(<NotesProposalsReview found={FOUND} apply={vi.fn()} onDismiss={onDismiss} />)
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }))
        expect(onDismiss).toHaveBeenCalled()
    })
})

describe('useNotesProposals', () => {
    it('a request that never left says to check the connection', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const { result } = renderHook(() => useNotesProposals('p1'))
        await act(async () => { await result.current.find('notes') })
        expect(result.current.error).toBe("Couldn't reach Brio. Check your connection and try again.")
    })

    it('a refused request shows the route\'s words', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "You have used this month's 500 AI credits." }) })))
        const { result } = renderHook(() => useNotesProposals('p1'))
        await act(async () => { await result.current.find('notes') })
        expect(result.current.error).toBe("You have used this month's 500 AI credits.")
    })

    it('sends the notes as they are in the field, and the browser\'s day', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { ...FOUND, engagement: { id: 'p1', name: 'E', firmId: 'f1', ctaUrl: null } } }) }))
        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useNotesProposals('p1'))
        await act(async () => { await result.current.find('Unsaved notes') })
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('/api/projects/p1/ai-notes-proposals')
        expect(JSON.parse(init.body as string)).toEqual({ notes: 'Unsaved notes', today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
        expect(result.current.found?.proposals).toHaveLength(3)
    })
})

describe('formatProposalDay', () => {
    it('writes days as the app does, the year only when it is not this one', () => {
        const now = new Date('2026-11-12T12:00:00Z')
        expect(formatProposalDay('2026-11-16', { weekday: true, now })).toBe('Mon, Nov 16')
        expect(formatProposalDay('2027-01-04', { now })).toBe('Jan 4, 2027')
    })
})
