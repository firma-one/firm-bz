import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { push } = vi.hoisted(() => ({
    push: {
        state: { supportState: 'default', subscribing: false, subscribed: false as boolean | null },
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
    },
}))
vi.mock('@/lib/hooks/use-register-push', () => ({
    useRegisterPush: () => ({ ...push.state, subscribe: push.subscribe, unsubscribe: push.unsubscribe }),
}))

import { PushNotificationToggle } from './push-notification-toggle'
import { ToastProvider } from '@/components/ui/toast'

beforeEach(() => {
    vi.clearAllMocks()
    push.state = { supportState: 'default', subscribing: false, subscribed: false }
})

describe('PushNotificationToggle', () => {
    it('says why turning on failed (OT-1)', async () => {
        push.subscribe.mockResolvedValue({ ok: false, error: 'Your session has ended. Sign in again.' })
        render(<PushNotificationToggle />, { wrapper: ToastProvider })
        fireEvent.click(screen.getByRole('switch', { name: 'Push notifications' }))
        expect(await screen.findByText("Couldn't turn on notifications")).toBeTruthy()
        expect(screen.getByText('Your session has ended. Sign in again.')).toBeTruthy()
    })

    it('says why turning off failed (P2-29)', async () => {
        push.state.subscribed = true
        push.unsubscribe.mockResolvedValue({ ok: false, error: 'The server answered 500. Try again.' })
        render(<PushNotificationToggle />, { wrapper: ToastProvider })
        fireEvent.click(screen.getByRole('switch', { name: 'Push notifications' }))
        expect(await screen.findByText("Couldn't turn off notifications")).toBeTruthy()
    })

    it('says nothing when it worked', async () => {
        push.subscribe.mockResolvedValue({ ok: true })
        render(<PushNotificationToggle />, { wrapper: ToastProvider })
        fireEvent.click(screen.getByRole('switch', { name: 'Push notifications' }))
        await waitFor(() => expect(push.subscribe).toHaveBeenCalled())
        expect(screen.queryByText(/Couldn't turn/)).toBeNull()
    })
})
