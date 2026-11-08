import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** Saving a name that fails in transit says why and gives the button back; "saving" used to run forever. */

const { updateProfileNames } = vi.hoisted(() => ({ updateProfileNames: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/lib/actions/profile', () => ({ updateProfileNames }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { refreshSession: vi.fn(async () => ({})) } } }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/components/account/data-privacy-card', () => ({ DataPrivacyCard: () => null }))
vi.mock('@/components/account/sessions-card', () => ({ SessionsCard: () => null }))
vi.mock('@/components/notifications/push-notification-toggle', () => ({ PushNotificationToggle: () => null }))
vi.mock('@/components/ui/profile-bubble-popup', () => ({ ProfileBubblePopupContent: () => null }))

import { ProfilePageClient } from './profile-page-client'

describe('ProfilePageClient name save', () => {
    it('a save that never arrives says why and ends', async () => {
        updateProfileNames.mockRejectedValue(new TypeError('Failed to fetch'))
        render(<ProfilePageClient hideChrome displayName="Pat" firstName="Pat" lastName="Lee" email="pat@acme.test" avatarUrl={null} />)
        fireEvent.change(screen.getByLabelText(/First name/i), { target: { value: 'Patricia' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(await screen.findByRole('alert')).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toMatch(/^Couldn't save your name · Couldn't reach/)
        await waitFor(() => expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(false))
    })
})
