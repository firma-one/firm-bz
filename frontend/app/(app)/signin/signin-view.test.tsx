import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef } from 'react'

/** P1-21: Turnstile that keeps failing stops after a few tries and says what to do. */

vi.mock('@marsidev/react-turnstile', () => ({
    Turnstile: forwardRef(function FakeTurnstile(props: { onError?: () => void }, _ref) {
        return (
            <button type="button" onClick={() => props.onError?.()}>
                fail check
            </button>
        )
    }),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ signInWithGoogle: vi.fn(), signInWithMicrosoft: vi.fn() }) }))
vi.mock('@/lib/auth-service', () => ({ AuthService: { verifyOTP: vi.fn() } }))
vi.mock('@/app/actions/send-otp', () => ({ checkEmailExists: vi.fn(), sendOTPWithTurnstile: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ sendEvent: vi.fn(), ANALYTICS_EVENTS: { LOGIN: 'login' } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/marketing/v2/auth/auth-shell', () => ({ AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { SigninView } from './signin-view'
import { TURNSTILE_BLOCKED } from './auth-failure-words'

describe('SigninView Turnstile', () => {
    it('stops retrying after three failures and says what to do', async () => {
        window.history.replaceState(null, '', '/signin#email=a%40b.test')
        render(<SigninView />)
        fireEvent.click(await screen.findByRole('button', { name: /Continue/ }))
        fireEvent.click(screen.getByText('fail check'))
        fireEvent.click(screen.getByText('fail check'))
        expect(screen.getByText(/Trying again/)).toBeTruthy()
        fireEvent.click(screen.getByText('fail check'))
        expect(screen.getByText(TURNSTILE_BLOCKED)).toBeTruthy()
        expect(screen.queryByText('fail check')).toBeNull()
    })
})
