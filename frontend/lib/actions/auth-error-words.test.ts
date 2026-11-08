import { describe, expect, it } from 'vitest'
import { authErrorWords } from './auth-error-words'

describe("Supabase Auth's refusals in our words (P2-47)", () => {
    const fallback = "We couldn't send your code. Try again in a moment."

    it('says to wait on a rate limit, whichever way Supabase words it', () => {
        expect(authErrorWords({ status: 429, message: 'For security purposes, you can only request this after 52 seconds.' }, fallback))
            .toBe('Too many tries in a short time. Wait a minute, then try again.')
        expect(authErrorWords({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' }, fallback))
            .toBe('Too many tries in a short time. Wait a minute, then try again.')
    })

    it('says the address looks wrong', () => {
        expect(authErrorWords({ code: 'email_address_invalid', message: 'Email address "x@" is invalid' }, fallback))
            .toBe("That email address doesn't look right. Check it and try again.")
    })

    it('never passes Supabase\'s own words through', () => {
        expect(authErrorWords({ message: 'AuthApiError: unexpected_failure at gotrue/v2.170' }, fallback)).toBe(fallback)
        expect(authErrorWords(null, fallback)).toBe(fallback)
    })
})
