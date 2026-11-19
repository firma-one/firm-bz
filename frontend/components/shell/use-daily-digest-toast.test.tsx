import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const { push, addToast, digest } = vi.hoisted(() => ({ push: vi.fn(), addToast: vi.fn(), digest: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/lib/actions/user-reminders', () => ({ checkDailyReminderDigest: digest }))

import { useDailyDigestToast } from './use-daily-digest-toast'

function Host() {
    useDailyDigestToast()
    return null
}

beforeEach(() => { push.mockReset(); addToast.mockReset(); digest.mockReset() })

describe('useDailyDigestToast', () => {
    it('the day’s reminders: one toast with a button that opens the Inbox', async () => {
        digest.mockResolvedValue({ notify: true, count: 3, overdue: 2 })
        render(<Host />)
        await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1))
        const toast = addToast.mock.calls[0][0]
        expect(toast).toMatchObject({ type: 'warning', title: '3 reminders need you today', message: '2 overdue.' })
        expect(toast.action.label).toBe('Open Inbox')
        toast.action.onClick()
        expect(push).toHaveBeenCalledWith('/d/u/inbox')
    })

    it('nothing overdue: an info toast, still with the way to the Inbox', async () => {
        digest.mockResolvedValue({ notify: true, count: 1, overdue: 0 })
        render(<Host />)
        await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1))
        expect(addToast.mock.calls[0][0]).toMatchObject({ type: 'info', title: '1 reminder needs you today', action: { label: 'Open Inbox' } })
    })

    it('already told today: no toast', async () => {
        digest.mockResolvedValue({ notify: false, count: 3, overdue: 2 })
        render(<Host />)
        await Promise.resolve()
        expect(addToast).not.toHaveBeenCalled()
    })
})
