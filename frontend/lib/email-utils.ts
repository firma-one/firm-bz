/**
 * Email utility functions for authentication
 */

/**
 * Check if an email is a Google account (Gmail or Googlemail)
 * Note: Cannot reliably detect custom domain Google Workspace accounts
 * without making an API call
 */
export function isGoogleEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase()

    if (!domain) return false

    // Common Google domains
    const googleDomains = ['gmail.com', 'googlemail.com']

    return googleDomains.includes(domain)
}

/**
 * Check if email is likely a Google Workspace account
 * This is a best-effort check and may not be 100% accurate
 */
export function isPotentiallyGoogleWorkspace(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase()

    if (!domain) return false

    // If it's a known Google domain, it's not Workspace
    if (isGoogleEmail(email)) return false

    // Common non-Google domains that are unlikely to be Workspace
    const commonNonGoogleDomains = [
        'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
        'outlook.com', 'hotmail.com', 'live.com',
        'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'protonmail.com', 'proton.me',
        'zoho.com', 'yandex.com', 'mail.com'
    ]

    if (commonNonGoogleDomains.includes(domain)) return false

    // For custom domains, we can't be sure without an API call
    // Return true to show both options (Google OAuth + OTP)
    return true
}

/**
 * Check if an email is a personal Microsoft account (Outlook/Hotmail/Live/MSN)
 * Note: Cannot reliably detect custom domain Microsoft Entra ID accounts
 * without making an API call
 */
export function isMicrosoftEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase()

    if (!domain) return false

    // Common personal Microsoft domains
    const microsoftDomains = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com']

    return microsoftDomains.includes(domain)
}

/**
 * Check if email is likely a Microsoft Entra ID (Azure AD) work/school account
 * This is a best-effort check and may not be 100% accurate
 */
export function isPotentiallyMicrosoftEntra(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase()

    if (!domain) return false

    // If it's a known personal Microsoft domain, it's not Entra ID
    if (isMicrosoftEmail(email)) return false

    // Common non-Microsoft domains that are unlikely to be Entra ID
    const commonNonMicrosoftDomains = [
        'gmail.com', 'googlemail.com',
        'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
        'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'protonmail.com', 'proton.me',
        'zoho.com', 'yandex.com', 'mail.com'
    ]

    if (commonNonMicrosoftDomains.includes(domain)) return false

    // For custom domains, we can't be sure without an API call
    // Return true to show both options (Microsoft OAuth + OTP)
    return true
}

export type OAuthProvider = 'google' | 'microsoft'

/**
 * Which OAuth provider button(s) to offer for a given email during signup.
 * Known consumer domains resolve to exactly one provider; an unrecognized custom domain
 * could belong to either Google Workspace or Microsoft Entra ID, so both are offered —
 * we can't disambiguate without an API call, and offering neither would be worse.
 */
export function getApplicableOAuthProviders(email: string): OAuthProvider[] {
    const providers: OAuthProvider[] = []

    if (isGoogleEmail(email) || isPotentiallyGoogleWorkspace(email)) {
        providers.push('google')
    }
    if (isMicrosoftEmail(email) || isPotentiallyMicrosoftEntra(email)) {
        providers.push('microsoft')
    }

    return providers
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

/**
 * Extract first name from full name
 */
export function extractFirstName(fullName: string): string {
    return fullName.trim().split(/\s+/)[0] || ''
}

/**
 * Extract last name from full name
 */
export function extractLastName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/)
    return parts.slice(1).join(' ') || ''
}

/**
 * Generate default organization name from first name
 */
export function generateDefaultOrgName(firstName: string): string {
    return firstName
}
