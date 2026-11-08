import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/* A reminders list that didn't load says so, never "No reminders" (P2-30). */

const { actions } = vi.hoisted(() => ({
    actions: {
        getUserReminders: vi.fn(),
        checkDailyReminderDigest: vi.fn(async () => ({ notify: false, count: 0, overdue: 0 })),
        markReminderDone: vi.fn(),
        hideReminder: vi.fn(),
        showReminder: vi.fn(),
    },
}))
vi.mock('@/lib/actions/user-reminders', () => actions)
vi.mock('next/navigation', () => ({ usePathname: () => '/d/onboarding' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

import { RemindersPanel } from './reminders-panel'

const REMINDER = {
    id: 'r1', entityKey: 'platform.engagements.id', entityValue: 'e1', action: 'Engagement due', dateKey: null, dateValue: null,
    hiddenAt: null, entityName: 'FY26 Audit', entitySlug: null, firmSlug: 'acme', firmId: 'f1', ctaUrl: '/d/e1', delta: null,
    label: 'Waiting on you', labelStyle: 'slate',
}

beforeEach(() => vi.clearAllMocks())

describe('RemindersPanel', () => {
    it('says the reminders did not load, never "No reminders", and Try again loads them', async () => {
        actions.getUserReminders.mockRejectedValue(new Error('An error occurred in the Server Components render.'))
        render(<RemindersPanel />)
        fireEvent.click(screen.getByRole('button', { name: 'Reminders' }))
        expect(await screen.findByText("Couldn't load your reminders")).toBeTruthy()
        expect(screen.queryByText('No reminders')).toBeNull()
        // A thrown action's words never show: in production they're React's, not ours.
        expect(screen.queryByText(/Server Components/)).toBeNull()

        actions.getUserReminders.mockResolvedValue([REMINDER])
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Engagement due')).toBeTruthy()
        expect(screen.queryByText("Couldn't load your reminders")).toBeNull()
    })
})
