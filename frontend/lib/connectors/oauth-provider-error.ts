/**
 * What Google's or Microsoft's OAuth `error` / `error_description` means, as one of our codes
 * (P2-31). The callbacks used to turn every provider error into `oauth_error`, so "your Microsoft
 * admin needs to approve this app" read as "sign-in was cancelled or denied". The popup libraries
 * (`lib/google-drive-popup-oauth.ts`, `lib/onedrive-popup-oauth.ts`) word each code.
 */

export type OAuthProviderErrorCode =
    | 'consent_declined'
    | 'admin_consent_required'
    | 'admin_policy_blocked'
    | 'oauth_error'

export function oauthProviderErrorCode(error: string | null | undefined, description: string | null | undefined): OAuthProviderErrorCode {
    const e = (error ?? '').toLowerCase()
    const d = (description ?? '').toUpperCase()
    // Microsoft: AADSTS90094/90095 "the grant requires admin permission", AADSTS65001 "has not
    // consented" (an admin must grant tenant-wide consent for our scopes).
    if (d.includes('AADSTS90094') || d.includes('AADSTS90095') || d.includes('AADSTS65001') || e === 'consent_required') {
        return 'admin_consent_required'
    }
    // Microsoft AADSTS65004 "user declined to consent"; Google and Microsoft `access_denied`.
    if (d.includes('AADSTS65004') || e === 'access_denied') return 'consent_declined'
    // Google Workspace admin policy: the app isn't allowed in this organization.
    if (e === 'admin_policy_enforced') return 'admin_policy_blocked'
    return 'oauth_error'
}

/**
 * The provider's sentence, fit to show: the first line, without Microsoft's trace and correlation
 * ids, and short. Null when there's nothing useful.
 */
export function oauthErrorDetail(description: string | null | undefined): string | null {
    if (!description) return null
    let d = description.replace(/\+/g, ' ').trim()
    d = d.split(/\r?\n/)[0] ?? ''
    d = d.replace(/\s*Trace ID:.*$/i, '').replace(/\s*Correlation ID:.*$/i, '').replace(/\s*Timestamp:.*$/i, '')
    d = d.replace(/^AADSTS\d+:\s*/, '').trim()
    if (!d) return null
    return d.length > 200 ? `${d.slice(0, 197)}…` : d
}
