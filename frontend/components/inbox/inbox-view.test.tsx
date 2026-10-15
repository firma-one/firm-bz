import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { actions, push } = vi.hoisted(() => ({
    actions: {
        getAllUserReminders: vi.fn(),
        markReminderDone: vi.fn(async () => {}),
        hideReminder: vi.fn(async () => {}),
    },
    push: vi.fn(),
}))
vi.mock('@/lib/actions/user-reminders', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { InboxView } from './inbox-view'

const fetchMock = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
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
                { id: 'n1', createdAt: new Date().toISOString(), scope: 'FIRM', type: 'DOCUMENT_STAGING_INTAKE', priority: 'INFO', title: 'New upload from Contoso', body: 'Q3 numbers', ctaUrl: '/d/upload', readAt: null },
            ] }) }
        }
        return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
})

describe('InboxView', () => {
    it('shows this firm\'s reminders under To do and its notifications, nothing from other firms', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        expect(await screen.findAllByText('Engagement letter')).toBeTruthy()
        expect(screen.getByText('New upload from Contoso')).toBeTruthy()
        expect(screen.queryByText('Other firm thing')).toBeNull()
        expect(fetchMock.mock.calls[0][0]).toBe('/api/notifications?firmId=f1')
    })

    it('marks a reminder done with e and moves to the next item', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' }) // first item selected
        fireEvent.keyDown(window, { key: 'e' })
        await waitFor(() => expect(actions.markReminderDone).toHaveBeenCalledWith('r1'))
        await waitFor(() => expect(screen.queryAllByText('Engagement letter')).toHaveLength(0))
    })

    it('marks a notification read when selected and dismisses it through the API', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        fireEvent.click(await screen.findByText('New upload from Contoso'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ids: ['n1'] }) }))
        )
        fireEvent.click(screen.getByText('Dismiss'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/notifications?firmId=f1', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ ids: ['n1'] }) }))
        )
    })

    it('leaves G-then-H to the shell instead of hiding the reminder', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 'h' })
        expect(actions.hideReminder).not.toHaveBeenCalled()
        fireEvent.keyDown(window, { key: 'h' })
        await waitFor(() => expect(actions.hideReminder).toHaveBeenCalledWith('r1'))
    })

    it('shows reminders months away under Upcoming, and filters by tab', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        expect(await screen.findByText('Q2 Go-To-Market Positioning')).toBeTruthy()
        expect(screen.getByText(/Upcoming/)).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: /Notifications/ }))
        expect(screen.queryByText('Q2 Go-To-Market Positioning')).toBeNull()
        expect(screen.getAllByText('New upload from Contoso').length).toBeGreaterThan(0)
        fireEvent.click(screen.getByRole('tab', { name: /Reminders/ }))
        expect(screen.getByText('Q2 Go-To-Market Positioning')).toBeTruthy()
        expect(screen.queryByText('New upload from Contoso')).toBeNull()
    })

    it('opens the selected item with Enter', async () => {
        render(<InboxView firmId="f1" firmName="Acme" />)
        await screen.findByRole('heading', { level: 2, name: 'Engagement letter' })
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(push).toHaveBeenCalledWith('/d/doc')
    })
})
