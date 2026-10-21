/**
 * The OAuth providers people can sign in or sign up with, as one list. The sign-in and sign-up cards
 * draw their buttons from it and write their hints from it, so turning a provider on (Microsoft, once
 * its publisher verification is resolved) updates both without anyone remembering to edit the copy.
 */
import type { OAuthProvider } from '@/lib/email-utils'

/** Every provider, in the order the cards show them. */
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'microsoft']

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
    google: 'Google',
    microsoft: 'Microsoft',
}

/**
 * The providers switched on. Microsoft is off until `MICROSOFT_SIGNIN_ENABLED` is set; the pages read
 * that on the server and pass it down, since the cards are client components.
 */
export function enabledOAuthProviders(microsoftSignInEnabled: boolean): OAuthProvider[] {
    return OAUTH_PROVIDERS.filter((p) => p !== 'microsoft' || microsoftSignInEnabled)
}

/** "Google", "Google or Microsoft", "Google, Microsoft or Apple". */
export function listWithOr(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? ''
    return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/** The sign-in email step's hint: every way in comes after it, so it names them all. */
export function signInMethodsHint(providers: readonly OAuthProvider[]): string {
    if (providers.length === 0) return 'No password needed. Next, we’ll email you a one-time code.'
    const names = listWithOr(providers.map((p) => OAUTH_PROVIDER_LABEL[p]))
    return `No password needed. Next, get a one-time code by email or continue with ${names}.`
}

/**
 * The sign-up email step's hint. Sign-up offers a provider only for an email that looks like one of
 * its accounts (`getApplicableOAuthProviders`), so the hint says so.
 */
export function signUpMethodsHint(providers: readonly OAuthProvider[]): string {
    if (providers.length === 0) return 'No password needed. Next, we’ll email you a one-time code.'
    const labels = providers.map((p) => OAUTH_PROVIDER_LABEL[p])
    const which = labels.length === 1 ? `a ${labels[0]} account` : 'one of those accounts'
    return `No password needed. Next, get a one-time code by email, or use ${listWithOr(labels)} if it’s ${which}.`
}
