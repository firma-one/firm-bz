import { describe, it, expect } from 'vitest'
import { authCallbackErrorMessage, authRequestFailure, SERVER_UNREACHABLE, turnstileErrorStep } from './auth-failure-words'

describe('sign-in failure words', () => {
    it('gives Turnstile a limit (P1-21)', () => {
        expect(turnstileErrorStep(1)).toBe('retry')
        expect(turnstileErrorStep(2)).toBe('retry_with_notice')
        expect(turnstileErrorStep(3)).toBe('stop')
        expect(turnstileErrorStep(9)).toBe('stop')
    })

    it('words a rejected request (P1-20)', () => {
        expect(authRequestFailure(new TypeError('Failed to fetch'))).toBe(SERVER_UNREACHABLE)
        expect(authRequestFailure(new Error('boom'))).toBe('Something went wrong on our side. Try again.')
    })

    it('reads auth_code_error, with the provider sentence when there is one (P1-19)', () => {
        expect(authCallbackErrorMessage('auth_code_error', null)).toMatch(/^Google or Microsoft sign-in didn't finish/)
        expect(authCallbackErrorMessage('auth_code_error', 'Email link is invalid or has expired')).toBe(
            "Google or Microsoft sign-in didn't finish · Email link is invalid or has expired. Please try again."
        )
        expect(authCallbackErrorMessage('other', null)).toBeNull()
    })
})
