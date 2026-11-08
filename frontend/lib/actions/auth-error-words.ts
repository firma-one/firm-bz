/**
 * Our words for a refusal from Supabase Auth. Its own messages ("For security purposes, you can only
 * request this after 52 seconds.", "Email address \"x\" is invalid") are written for developers and
 * change between versions, so they stay in the log and the person reads one of these instead.
 */
export function authErrorWords(
    error: { message?: string; status?: number; code?: string } | null | undefined,
    fallback: string,
): string {
    const code = error?.code ?? ''
    const message = (error?.message ?? '').toLowerCase()
    if (error?.status === 429 || code.includes('rate_limit') || message.includes('rate limit') || message.includes('security purposes')) {
        return 'Too many tries in a short time. Wait a minute, then try again.'
    }
    if (code === 'email_address_invalid' || (message.includes('email') && message.includes('invalid'))) {
        return "That email address doesn't look right. Check it and try again."
    }
    if (code === 'signup_disabled' || code === 'otp_disabled') {
        return "We can't create an account for that address here. Ask whoever invited you."
    }
    if (code === 'email_exists' || message.includes('already been registered') || message.includes('already registered')) {
        return 'An account with this email already exists.'
    }
    return fallback
}
