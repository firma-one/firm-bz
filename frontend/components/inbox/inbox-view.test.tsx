import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const { actions, inbox, push, search } = vi.hoisted(() => ({
    actions: {
        getAllUserReminders: vi.fn(),
        markReminderDone: vi.fn(async () => {}),
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
import { ToastProvider } from '@/components/ui/toast'

const fetchMock = vi.fn()

const ACME = { id: 'f1', slug: 'acme', name: 'Acme' }
const BETA = { id: 'f2', slug: 'beta', name: 'Beta' }

/** The Inbox inside the app's toast provider, which carries Done's Undo. */
const renderInbox = (firms: { id: string; slug: string; name: string }[]) => render(<InboxView firms={firms} />, { wrapper: ToastProvider })

/** The item's row in the list (the toast names it too, so text alone won't do). */
const row = (title: string) => screen.queryByRole('button', { name: new RegExp(`^${title}`) })

/** The toast's close button: Done goes ahead without waiting out the Undo. */
const closeToast = () => fireEvent.click(within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', { name: 'Dismiss' }))

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
            hiddenAt: null, entityName: 'Q2 Go-To-Market Positioning', entitySlug: 'q2', firmSlug: 'acme', firmId: 'f1', ctaUrl: '/d/q2', clientName: 'DataSentry',
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
        renderInbox([ACME])
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
        renderInbox([ACME, BETA])
        expect(await screen.findByText('Other firm thing')).toBeTruthy()
        expect(screen.getByText('Beta · Follow-up')).toBeTruthy()
        await showUpdates()
        expect(screen.getByText('Beta comment')).toBeTruthy()
    })

    it('filters to the firm in ?firm=, dropping the firm labels', async () => {
        search.value = 'firm=acme'
        renderInbox([ACME, BETA])
        expect(await screen.findAllByText('Engagement letter')).toBeTruthy()
        expect(screen.queryByText('Other firm thing')).toBeNull()
        expect(screen.queryByText(/^Acme · /)).toBeNull()
        await showUpdates()
        expect(screen.queryByText('Beta comment')).toBeNull()
        expect(screen.getByText('Platform news')).toBeTruthy()
    })

    it('marks all read across firms, or only the picked firm\'s', async () => {
        const { unmount } = renderInbox([ACME, BETA])
        await showUpdates()
        fireEvent.click(await screen.findByText('Mark all read'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firms=all', expect.objectContaining({ method: 'PATCH' }))
        )
        unmount()

        search.value = 'firm=beta'
        renderInbox([ACME, BETA])
        await showUpdates()
        fireEvent.click(await screen.findByText('Mark all read'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firmId=f2', expect.objectContaining({ method: 'PATCH' }))
        )
    })

    it('marks a reminder done with e: it leaves the list at once, and is sent once its Undo has passed', async () => {
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' }) // first item selected
        fireEvent.keyDown(window, { key: 'e' })
        expect(row('Engagement letter')).toBeNull()
        expect(screen.getByRole('heading', { level: 2, name: 'Q2 Go-To-Market Positioning' })).toBeTruthy() // the next one
        expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
        expect(actions.markReminderDone).not.toHaveBeenCalled()
        closeToast()
        await waitFor(() => expect(actions.markReminderDone).toHaveBeenCalledWith('r1'))
        expect(row('Engagement letter')).toBeNull()
    })

    it('Undo brings the item back, selected, and sends nothing', async () => {
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(row('Engagement letter')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(screen.getByRole('heading', { level: 2, name: 'Engagement letter' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
        expect(actions.markReminderDone).not.toHaveBeenCalled()
    })

    it('marks a notification read when selected; Dismiss (Done\'s place and key) deletes it through the API', async () => {
        search.value = 'tab=updates'
        renderInbox([ACME])
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
        expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
        expect(screen.getByText('Dismissed')).toBeTruthy()
        closeToast()
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firms=all', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ ids: ['n1'] }) }))
        )
    })

    it('a failed Done brings the item back and says so', async () => {
        actions.markReminderDone.mockRejectedValueOnce(new Error('offline'))
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        closeToast()
        expect(await screen.findByText("Couldn't mark it done")).toBeTruthy()
        expect(row('Engagement letter')).toBeTruthy()
    })

    it('leaves a key straight after G to the shell', async () => {
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 'e' })
        expect(screen.getByRole('heading', { level: 2, name: 'Engagement letter' })).toBeTruthy()
        fireEvent.keyDown(window, { key: 'e' })
        expect(screen.queryByRole('heading', { level: 2, name: 'Engagement letter' })).toBeNull()
    })

    it('reads a dated reminder as its message, with where it sits under the title and an Open named for where it goes', async () => {
        renderInbox([ACME, BETA])
        fireEvent.click(await screen.findByText('Q2 Go-To-Market Positioning'))
        expect(screen.getByRole('heading', { level: 2, name: 'Q2 Go-To-Market Positioning' })).toBeTruthy()
        // Where it sits, as chips: the firm (several share the list), then the client.
        const place = within(screen.getByLabelText('Where it sits'))
        expect(place.getByText('Acme')).toBeTruthy()
        expect(place.getByText('DataSentry')).toBeTruthy()
        expect(screen.getByText('Engagement due')).toBeTruthy()
        expect(screen.getAllByText('Jan 31, 2027').length).toBeGreaterThan(0) // the list row too
        expect(screen.getByText('Due in 108 days')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Go to engagement/ }))
        expect(push).toHaveBeenCalledWith('/d/q2')
    })

    it('lists what needs you, then reminders months away under Upcoming; notifications only under Updates', async () => {
        renderInbox([ACME])
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
            { id: 'comment:d1', kind: 'client_comment', firmId: 'f1', title: 'Draft memo', context: 'Contoso · Audit', clientName: 'Contoso', engagementName: 'Audit', href: '/d/comment', actionLabel: 'Reply', at: new Date().toISOString() },
            { id: 'review:d2', kind: 'deliverable_review', firmId: 'f2', title: 'Other firm review', context: 'Beta', href: '/d/x', actionLabel: 'Review', at: null },
        ])
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Draft memo' }) // first, and selected
        expect(screen.queryByText('Other firm review')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
        expect(within(screen.getByLabelText('Where it sits')).getByText('Audit')).toBeTruthy()
        expect(screen.getByText(/dealt with/)).toBeTruthy()
        fireEvent.keyDown(window, { key: 'e' })
        expect(actions.markReminderDone).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: /Reply/ }))
        expect(push).toHaveBeenCalledWith('/d/comment')
    })

    it('says an update is about a deliverable, draws its names as chips and goes to it', async () => {
        search.value = 'tab=updates'
        fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
            if (init?.method) return { ok: true, json: async () => ({ success: true }) }
            return { ok: true, json: async () => ({ notifications: [
                {
                    id: 'n-due', createdAt: new Date().toISOString(), firmId: 'f1', scope: 'FIRM', type: 'DOCUMENT_DUE_DATE_SET', priority: 'INFO',
                    title: 'Document due date updated', body: '02__GTM Playbook due on 2026-11-30', ctaUrl: '/d/board#doc-file:x', readAt: null,
                    subject: 'deliverable', subjectName: '02__GTM Playbook', clientName: 'DataSentry', engagementName: 'Q2 GTM',
                },
                {
                    id: 'n-joined', createdAt: new Date(Date.now() - 60_000).toISOString(), firmId: 'f1', scope: 'FIRM', type: 'ENGAGEMENT_INVITE_ACCEPTED', priority: 'INFO',
                    title: 'pat@contoso.test joined Q2 GTM', body: null, ctaUrl: '/d/members', readAt: null, subject: 'engagement', clientName: 'DataSentry', engagementName: 'Q2 GTM',
                },
            ] }) }
        })
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Document due date updated' })
        // The file, by name, as a chip in the message; the date as Nov 30, 2026.
        const message = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '02__GTM Playbook due on Nov 30, 2026')
        expect(within(message).getByText('02__GTM Playbook')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Go to deliverable/ }))
        expect(push).toHaveBeenCalledWith('/d/board#doc-file:x')

        fireEvent.click(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'pat@contoso.test joined Q2 GTM'))
        const title = await screen.findByRole('heading', { level: 2, name: 'pat@contoso.test joined Q2 GTM' })
        expect(within(title).getByText('pat@contoso.test')).toBeTruthy() // who joined, as a member chip
        expect(within(title).getByText('Q2 GTM')).toBeTruthy()
    })

    it('opens the selected item with Enter', async () => {
        renderInbox([ACME])
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(push).toHaveBeenCalledWith('/d/doc')
    })
})
