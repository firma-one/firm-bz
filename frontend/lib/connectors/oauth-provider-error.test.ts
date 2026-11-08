import { describe, it, expect } from 'vitest'
import { oauthErrorDetail, oauthProviderErrorCode } from './oauth-provider-error'

/** P2-31: the provider's reason survives the callback. */
describe('oauthProviderErrorCode', () => {
    it('reads Microsoft admin consent', () => {
        expect(oauthProviderErrorCode('access_denied', 'AADSTS90094: The grant requires admin permission.')).toBe('admin_consent_required')
        expect(oauthProviderErrorCode('invalid_grant', 'AADSTS65001: The user or administrator has not consented')).toBe('admin_consent_required')
    })

    it('reads a declined consent and a Google admin block', () => {
        expect(oauthProviderErrorCode('access_denied', null)).toBe('consent_declined')
        expect(oauthProviderErrorCode('access_denied', 'AADSTS65004: User declined to consent')).toBe('consent_declined')
        expect(oauthProviderErrorCode('admin_policy_enforced', null)).toBe('admin_policy_blocked')
    })

    it('keeps anything else as oauth_error', () => {
        expect(oauthProviderErrorCode('server_error', 'Something')).toBe('oauth_error')
    })
})

describe('oauthErrorDetail', () => {
    it("keeps Microsoft's sentence without the code, trace and correlation ids", () => {
        expect(
            oauthErrorDetail('AADSTS50020: User account from identity provider does not exist in tenant. Trace ID: abc Correlation ID: def Timestamp: 2026')
        ).toBe('User account from identity provider does not exist in tenant.')
    })

    it('is null for nothing', () => {
        expect(oauthErrorDetail('')).toBeNull()
        expect(oauthErrorDetail(null)).toBeNull()
    })
})
