import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { actions, inbox, push, search } = vi.hoisted(() => ({
    actions: {
        getAllUserReminders: vi.fn(),
        markReminderDone: vi.fn(async () => {}),
        hideReminder: vi.fn(async () => {}),
    },
    inbox: { getNeedsYou: vi.fn() },
    push: vi.fn(),
    search: { value: '' },
}))
vi.mock('@/lib/actions/user-reminders', () => actions)
vi.mock('@/lib/actions/inbox', () => inbox)
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    usePathname: () => '/d/u/inbox',
    useSearchParams: () => new URLSearchParams(search.value),
}))

import { InboxView } from './inbox-view'

const fetchMock = vi.fn()

const ACME = { id: 'f1', slug: 'acme', name: 'Acme' }
const BETA = { id: 'f2', slug: 'beta', name: 'Beta' }

/** Updates: the notifications. */
const showUpdates = async () => fireEvent.click(await screen.findByRole('tab', { name: /Updates/ }))

beforeEach(() => {
    vi.clearAllMocks()
    search.value = ''
    inbox.getNeedsYou.mockResolvedValue([])
    actions.getAllUserReminders.mockResolvedValue([
        {
            id: 'r1', entityKey: 'platform.doc_comments', entityValue: 'x', action: 'Review comment', dateKey: null, dateValue: null,
            hiddenAt: null, entityName: 'Engagement letter', entitySlug: null, firmSlug: 'acme', firmId: 'f1', ctaUrl: '/d/doc',
            delta: null, label: '', labelStyle: 'slate',
        },
        {
            id: 'r-later', entityKey: 'platform.engagements.id', entityValue: 'e9', action: 'Engagement due', dateKey: 'platform.engagements.dueDate', dateValue: '2027-01-31T11:30:00.000Z',
            hiddenAt: null, entityName: 'Q2 Go-To-Market Positioning', entitySlug: 'q2', firmSlug: 'acme', firmId: 'f1', ctaUrl: '/d/q2',
            delta: 108, label: 'Due in 108 days', labelStyle: 'slate',
        },
        {
            id: 'r-other', entityKey: 'x', entityValue: 'y', action: 'Follow-up', dateKey: null, dateValue: null,
            hiddenAt: null, entityName: 'Other firm thing', entitySlug: null, firmSlug: 'b', firmId: 'f2', ctaUrl: null,
            delta: null, label: '', labelStyle: 'slate',
        },
    ])
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (!init || !init.method) {
            return { ok: true, json: async () => ({ notifications: [
                { id: 'n1', createdAt: new Date().toISOString(), firmId: 'f1', scope: 'FIRM', type: 'DOCUMENT_STAGING_INTAKE', priority: 'INFO', title: 'New upload from Contoso', body: 'Q3 numbers', ctaUrl: '/d/upload', readAt: null },
                { id: 'n2', createdAt: new Date(Date.now() - 60_000).toISOString(), firmId: 'f2', scope: 'FIRM', type: 'COMMENT', priority: 'INFO', title: 'Beta comment', body: null, ctaUrl: null, readAt: null },
                { id: 'n3', createdAt: new Date(Date.now() - 120_000).toISOString(), firmId: null, scope: 'PLATFORM', type: 'ANNOUNCEMENT', priority: 'INFO', title: 'Platform news', body: null, ctaUrl: null, readAt: null },
            ] }) }
        }
        return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
})

describe('InboxView', () => {
    it('shows only the given firms\' items, plus platform-wide notifications', async () => {
        render(<InboxView firms={[ACME]} />)
        expect(await screen.findAllByText('Engagement letter')).toBeTruthy()
        expect(screen.queryByText('Other firm thing')).toBeNull()
        await showUpdates()
        expect(screen.getAllByText('New upload from Contoso').length).toBeGreaterThan(0) // the row, and the selected detail
        expect(screen.getByText('Platform news')).toBeTruthy()
        expect(screen.queryByText('Other firm thing')).toBeNull()
        expect(screen.queryByText('Beta comment')).toBeNull()
        expect(fetchMock.mock.calls[0][0]).toBe('/api/notifications?firms=all')
    })

    it('names each item\'s firm when several firms share the list', async () => {
        render(<InboxView firms={[ACME, BETA]} />)
        expect(await screen.findByText('Other firm thing')).toBeTruthy()
        expect(screen.getByText('Beta · Follow-up')).toBeTruthy()
        await showUpdates()
        expect(screen.getByText('Beta comment')).toBeTruthy()
    })

    it('filters to the firm in ?firm=, dropping the firm labels', async () => {
        search.value = 'firm=acme'
        render(<InboxView firms={[ACME, BETA]} />)
        expect(await screen.findAllByText('Engagement letter')).toBeTruthy()
        expect(screen.queryByText('Other firm thing')).toBeNull()
        expect(screen.queryByText(/^Acme · /)).toBeNull()
        await showUpdates()
        expect(screen.queryByText('Beta comment')).toBeNull()
        expect(screen.getByText('Platform news')).toBeTruthy()
    })

    it('marks all read across firms, or only the picked firm\'s', async () => {
        const { unmount } = render(<InboxView firms={[ACME, BETA]} />)
        await showUpdates()
        fireEvent.click(await screen.findByText('Mark all read'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firms=all', expect.objectContaining({ method: 'PATCH' }))
        )
        unmount()

        search.value = 'firm=beta'
        render(<InboxView firms={[ACME, BETA]} />)
        await showUpdates()
        fireEvent.click(await screen.findByText('Mark all read'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firmId=f2', expect.objectContaining({ method: 'PATCH' }))
        )
    })

    it('marks a reminder done with e and moves to the next item', async () => {
        render(<InboxView firms={[ACME]} />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' }) // first item selected
        fireEvent.keyDown(window, { key: 'e' })
        await waitFor(() => expect(actions.markReminderDone).toHaveBeenCalledWith('r1'))
        await waitFor(() => expect(screen.queryAllByText('Engagement letter')).toHaveLength(0))
    })

    it('marks a notification read when selected and dismisses it through the API', async () => {
        search.value = 'tab=updates'
        render(<InboxView firms={[ACME]} />)
        // Wait for the first item's auto-selection, so it can't land after the click below.
        await screen.findByRole('heading', { level: 2, name: 'New upload from Contoso' })
        fireEvent.click(screen.getByText('Platform news'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ids: ['n3'] }) }))
        )
        fireEvent.click(screen.getAllByText('New upload from Contoso')[0])
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ids: ['n1'] }) }))
        )
        fireEvent.click(screen.getByText('Dismiss'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firms=all', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ ids: ['n1'] }) }))
        )
    })

    it('leaves G-then-H to the shell instead of hiding the reminder', async () => {
        render(<InboxView firms={[ACME]} />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 'h' })
        expect(actions.hideReminder).not.toHaveBeenCalled()
        fireEvent.keyDown(window, { key: 'h' })
        await waitFor(() => expect(actions.hideReminder).toHaveBeenCalledWith('r1'))
    })

    it('lists what needs you, then reminders months away under Upcoming; notifications only under Updates', async () => {
        render(<InboxView firms={[ACME]} />)
        expect(await screen.findByText('Q2 Go-To-Market Positioning')).toBeTruthy()
        expect(screen.getByText(/Waiting on you/)).toBeTruthy()
        expect(screen.getByText(/Upcoming/)).toBeTruthy()
        expect(screen.queryByText('New upload from Contoso')).toBeNull()
        // The tab counts what is waiting on you: the review request, not the deadline months out.
        expect(screen.getByRole('tab', { name: /Needs you/ }).textContent).toBe('Needs you1')
        await showUpdates()
        expect(screen.queryByText('Q2 Go-To-Market Positioning')).toBeNull()
        expect(screen.getAllByText('New upload from Contoso').length).toBeGreaterThan(0)
    })

    it('leads with work waiting on you, opened by its own action and never dismissed', async () => {
        inbox.getNeedsYou.mockResolvedValue([
            { id: 'comment:d1', kind: 'client_comment', firmId: 'f1', title: 'Draft memo', context: 'Contoso · Audit', href: '/d/comment', actionLabel: 'Reply', at: new Date().toISOString() },
            { id: 'review:d2', kind: 'deliverable_review', firmId: 'f2', title: 'Other firm review', context: 'Beta', href: '/d/x', actionLabel: 'Review', at: null },
        ])
        render(<InboxView firms={[ACME]} />)
        await screen.findByRole('heading', { level: 2, name: 'Draft memo' }) // first, and selected
        expect(screen.queryByText('Other firm review')).toBeNull()
        expect(screen.queryByText('Dismiss')).toBeNull()
        expect(screen.getByText(/dealt with/)).toBeTruthy()
        fireEvent.keyDown(window, { key: 'e' })
        expect(actions.markReminderDone).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: /Reply/ }))
        expect(push).toHaveBeenCalledWith('/d/comment')
    })

    it('opens the selected item with Enter', async () => {
        render(<InboxView firms={[ACME]} />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(push).toHaveBeenCalledWith('/d/doc')
    })
})
