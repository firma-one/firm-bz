import { describe, it, expect } from 'vitest'
import {
    connectorAccountEmail,
    createStepTimer,
    emailDomain,
    isKnownGoogleAccount,
    isSameEmailDomain,
    withGoogleAccountHint,
} from './secure-open-grant'

describe('secure-open-grant', () => {
    it('emailDomain / isSameEmailDomain compare domains case-insensitively', () => {
        expect(emailDomain('Sam@FirmaOne.com')).toBe('firmaone.com')
        expect(emailDomain('not-an-email')).toBeNull()
        expect(isSameEmailDomain('sam@firmaone.com', 'DEEPAK@firmaone.COM')).toBe(true)
        expect(isSameEmailDomain('sam@client.com', 'deepak@firmaone.com')).toBe(false)
        expect(isSameEmailDomain('sam@client.com', null)).toBe(false)
    })

    it('connectorAccountEmail prefers settings.accountEmail, else an email-shaped external id', () => {
        expect(connectorAccountEmail({ settings: { accountEmail: ' a@b.com ' } })).toBe('a@b.com')
        expect(connectorAccountEmail({ settings: {}, externalAccountId: 'c@d.com' })).toBe('c@d.com')
        expect(connectorAccountEmail({ settings: {}, externalAccountId: '1234567' })).toBeNull()
    })

    it('isKnownGoogleAccount: Google sign-in under that email, Gmail, or the Workspace domain', () => {
        expect(isKnownGoogleAccount('sam@client.com', [{ provider: 'google', identity_data: { email: 'Sam@client.com' } }], null)).toBe(true)
        expect(isKnownGoogleAccount('sam@client.com', [{ provider: 'google', identity_data: { email: 'other@gmail.com' } }], null)).toBe(false)
        expect(isKnownGoogleAccount('sam@gmail.com', [], null)).toBe(true)
        expect(isKnownGoogleAccount('sam@firmaone.com', [], 'deepak@firmaone.com')).toBe(true)
        expect(isKnownGoogleAccount('sam@client.com', [{ provider: 'email', identity_data: { email: 'sam@client.com' } }], 'deepak@firmaone.com')).toBe(false)
    })

    it('withGoogleAccountHint sets authuser, keeping the rest of the link', () => {
        expect(withGoogleAccountHint('https://docs.google.com/document/d/x/edit?usp=drivesdk', 'sam@gmail.com'))
            .toBe('https://docs.google.com/document/d/x/edit?usp=drivesdk&authuser=sam%40gmail.com')
        expect(withGoogleAccountHint('not a url', 'sam@gmail.com')).toBe('not a url')
    })

    it('createStepTimer adds up time per step', () => {
        let t = 0
        const timer = createStepTimer(() => t)
        t = 10; timer.step('a')
        t = 25; timer.step('b')
        t = 30; timer.step('a')
        expect(timer.summary()).toEqual({ totalMs: 30, steps: { a: 15, b: 15 } })
    })
})
