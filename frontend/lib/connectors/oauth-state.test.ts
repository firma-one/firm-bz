import { describe, it, expect, beforeAll, vi } from 'vitest'
import { signOAuthState, verifyOAuthState, peekOAuthState, safeNextPath } from './oauth-state'

/** Signed OAuth state for the storage connect flows (.claude/plans/access-gates.md, P0 #4). */

beforeAll(() => { process.env.OAUTH_STATE_SECRET = 'unit-test-secret' })

describe('OAuth state', () => {
    it('round-trips a signed state', () => {
        const s = signOAuthState({ userId: 'u1', organizationId: 'f1' })
        expect(verifyOAuthState(s)).toMatchObject({ userId: 'u1', organizationId: 'f1' })
    })

    it('rejects the old unsigned base64 format, a tampered payload and a wrong secret', () => {
        expect(verifyOAuthState(Buffer.from(JSON.stringify({ userId: 'u1' })).toString('base64'))).toBeNull()
        const [payload, sig] = signOAuthState({ userId: 'u1' }).split('.')
        const swapped = Buffer.from(JSON.stringify({ userId: 'attacker', iat: Date.now() })).toString('base64url')
        expect(verifyOAuthState(`${swapped}.${sig}`)).toBeNull()
        const signed = `${payload}.${sig}`
        process.env.OAUTH_STATE_SECRET = 'rotated'
        expect(verifyOAuthState(signed)).toBeNull()
        process.env.OAUTH_STATE_SECRET = 'unit-test-secret'
    })

    it('expires after 30 minutes', () => {
        vi.useFakeTimers()
        const s = signOAuthState({ userId: 'u1' })
        vi.advanceTimersByTime(31 * 60 * 1000)
        expect(verifyOAuthState(s)).toBeNull()
        vi.useRealTimers()
    })

    it('can be peeked for popup fields without trusting it', () => {
        expect(peekOAuthState(signOAuthState({ flow: 'popup', nonce: 'n1' }))).toMatchObject({ flow: 'popup', nonce: 'n1' })
        expect(peekOAuthState('garbage')).toEqual({})
    })

    it('only allows same-origin next paths', () => {
        expect(safeNextPath('/d/f/acme/connectors', '/d')).toBe('/d/f/acme/connectors')
        expect(safeNextPath('//evil.example', '/d')).toBe('/d')
        expect(safeNextPath('/\\evil.example', '/d')).toBe('/d')
        expect(safeNextPath('https://evil.example', '/d')).toBe('/d')
    })
})
