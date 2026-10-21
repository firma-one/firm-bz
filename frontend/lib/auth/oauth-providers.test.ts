import { describe, it, expect } from 'vitest'
import { enabledOAuthProviders, listWithOr, signInMethodsHint, signUpMethodsHint } from './oauth-providers'

describe('enabledOAuthProviders', () => {
    it('leaves Microsoft out until it is switched on', () => {
        expect(enabledOAuthProviders(false)).toEqual(['google'])
        expect(enabledOAuthProviders(true)).toEqual(['google', 'microsoft'])
    })
})

describe('listWithOr', () => {
    it.each([
        [[], ''],
        [['Google'], 'Google'],
        [['Google', 'Microsoft'], 'Google or Microsoft'],
        [['Google', 'Microsoft', 'Apple'], 'Google, Microsoft or Apple'],
    ])('%j → %s', (items, expected) => {
        expect(listWithOr(items)).toBe(expected)
    })
})

describe('the email step hints', () => {
    it('name every provider that is switched on, so enabling one updates the copy', () => {
        expect(signInMethodsHint(enabledOAuthProviders(false)))
            .toBe('No password needed. Next, get a one-time code by email or continue with Google.')
        expect(signInMethodsHint(enabledOAuthProviders(true)))
            .toBe('No password needed. Next, get a one-time code by email or continue with Google or Microsoft.')
    })

    it('qualify the sign-up offer, which depends on the email', () => {
        expect(signUpMethodsHint(enabledOAuthProviders(false)))
            .toBe('No password needed. Next, get a one-time code by email, or use Google if it’s a Google account.')
        expect(signUpMethodsHint(enabledOAuthProviders(true)))
            .toBe('No password needed. Next, get a one-time code by email, or use Google or Microsoft if it’s one of those accounts.')
    })

    it('mention only the code when no provider is on', () => {
        expect(signInMethodsHint([])).toBe('No password needed. Next, we’ll email you a one-time code.')
        expect(signUpMethodsHint([])).toBe('No password needed. Next, we’ll email you a one-time code.')
    })
})
