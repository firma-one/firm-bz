import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/*
 * What the prefill must and must not do. The session is never kept — signing in still takes a
 * fresh code — so these cover only which address the field starts with.
 */

const getSession = vi.fn(async () => ({ data: { session: null } }))

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ signInWithGoogle: vi.fn(), signInWithMicrosoft: vi.fn() }),
}))
vi.mock('@/lib/auth-service', () => ({ AuthService: { verifyOTP: vi.fn() } }))
vi.mock('@/app/actions/send-otp', () => ({ checkEmailExists: vi.fn(), sendOTPWithTurnstile: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ sendEvent: vi.fn(), ANALYTICS_EVENTS: { LOGIN: 'login' } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { useSignInFlow, SIGNIN_EMAIL_KEY } from './use-sign-in-flow'

beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/signin')
})

describe('sign-in email prefill', () => {
    it('starts empty when nothing has been remembered', async () => {
        const { result } = renderHook(() => useSignInFlow())
        await waitFor(() => expect(result.current.email).toBe(''))
        expect(result.current.prefilledFromMemory).toBe(false)
    })

    it('prefills the address last signed in with, and says where it came from', async () => {
        localStorage.setItem(SIGNIN_EMAIL_KEY, 'deepak@firmaone.com')
        const { result } = renderHook(() => useSignInFlow())
        await waitFor(() => expect(result.current.email).toBe('deepak@firmaone.com'))
        expect(result.current.prefilledFromMemory).toBe(true)
    })

    it('lets the viewer drop it, leaving nothing behind to prefill again', async () => {
        localStorage.setItem(SIGNIN_EMAIL_KEY, 'deepak@firmaone.com')
        const { result } = renderHook(() => useSignInFlow())
        await waitFor(() => expect(result.current.email).toBe('deepak@firmaone.com'))

        act(() => result.current.clearRememberedEmail())

        expect(result.current.email).toBe('')
        expect(result.current.prefilledFromMemory).toBe(false)
        expect(localStorage.getItem(SIGNIN_EMAIL_KEY)).toBeNull()
    })

    it('drops the "remembered" note once the viewer types something else', async () => {
        localStorage.setItem(SIGNIN_EMAIL_KEY, 'deepak@firmaone.com')
        const { result } = renderHook(() => useSignInFlow())
        await waitFor(() => expect(result.current.prefilledFromMemory).toBe(true))

        act(() => result.current.setEmail('someone@else.test'))

        await waitFor(() => expect(result.current.prefilledFromMemory).toBe(false))
    })

    it('stores nothing while an address is merely being typed', async () => {
        const { result } = renderHook(() => useSignInFlow())
        act(() => result.current.setEmail('deep'))
        await waitFor(() => expect(result.current.email).toBe('deep'))
        // Only a verified sign-in writes the key, so a prefill is never a half-typed address.
        expect(localStorage.getItem(SIGNIN_EMAIL_KEY)).toBeNull()
        expect(sessionStorage.length).toBe(0)
    })

    it('lets an invite link override the remembered address, without storing it', async () => {
        localStorage.setItem(SIGNIN_EMAIL_KEY, 'old@firmaone.com')
        window.history.replaceState(null, '', '/signin#email=invited%40client.test')
        const { result } = renderHook(() => useSignInFlow())
        await waitFor(() => expect(result.current.email).toBe('invited@client.test'))
        expect(result.current.prefilledFromMemory).toBe(false)
        // The invitee has not signed in yet, so the remembered address is left as it was.
        expect(localStorage.getItem(SIGNIN_EMAIL_KEY)).toBe('old@firmaone.com')
    })
})
