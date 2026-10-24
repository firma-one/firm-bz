/**
 * Helpers for opening a document through a per-person grant (sharing/regrant/route.ts).
 *
 * Why the route checks first (2026-10-23): neither provider expires the grant itself.
 * - Google Drive: a Google-account holder's permission stands until removed. A visitor (no
 *   Google account) verifies with a PIN and gets 7 days, then re-verifies from the original
 *   sharing email; the permission isn't removed.
 * - SharePoint/OneDrive: a driveItem:invite permission has no expiry by default. A guest's
 *   email-code session lasts 24 hours; a tenant admin can turn on guest expiry, which removes it.
 * So the route reuses a permission that still stands, and grants again only when it's gone.
 */

/** Lower-cased domain of an email address, or null. */
export function emailDomain(email: string | null | undefined): string | null {
    const at = email?.lastIndexOf('@') ?? -1
    if (!email || at < 0) return null
    return email.slice(at + 1).trim().toLowerCase() || null
}

/** Whether two emails share a domain, e.g. a recipient and the connected storage account. */
export function isSameEmailDomain(a: string | null | undefined, b: string | null | undefined): boolean {
    const da = emailDomain(a)
    return !!da && da === emailDomain(b)
}

/** The connected account's email, from the connector record (settings.accountEmail, else an email-shaped externalAccountId). */
export function connectorAccountEmail(connector: { settings?: unknown; externalAccountId?: string | null } | null): string | null {
    const fromSettings = (connector?.settings as { accountEmail?: string } | null | undefined)?.accountEmail?.trim()
    if (fromSettings) return fromSettings
    const external = connector?.externalAccountId?.trim()
    return external && external.includes('@') ? external : null
}

const GOOGLE_CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * Whether `email` is known to be a Google account, so Drive can share with it silently and the
 * document can open straight away (no email, no PIN). Known when the person signs in to Firma
 * with Google under that email, it's a Gmail address, or it's on the same domain as the
 * connected Google account (a Google Workspace domain). Unknown isn't "no": it just means the
 * first share goes out by email, as before.
 */
export function isKnownGoogleAccount(
    email: string,
    identities: Array<{ provider?: string; identity_data?: { email?: string } | null }> | null | undefined,
    googleConnectorAccountEmail: string | null
): boolean {
    const lower = email.trim().toLowerCase()
    if (identities?.some((i) => i.provider === 'google' && i.identity_data?.email?.trim().toLowerCase() === lower)) return true
    const domain = emailDomain(lower)
    if (domain && GOOGLE_CONSUMER_DOMAINS.has(domain)) return true
    return isSameEmailDomain(lower, googleConnectorAccountEmail)
}

/**
 * A Google Docs/Drive link that asks Google for the account it was shared with (`authuser`
 * accepts an email), so someone signed in to several Google accounts doesn't land on "You need
 * access" under the wrong one.
 */
export function withGoogleAccountHint(url: string, email: string): string {
    try {
        const u = new URL(url)
        u.searchParams.set('authuser', email)
        return u.toString()
    } catch {
        return url
    }
}

/** Per-step timings for a request, logged once at the end so a slow open shows which step it was. */
export function createStepTimer(now: () => number = Date.now) {
    const startedAt = now()
    let last = startedAt
    const steps: Record<string, number> = {}
    return {
        step(name: string) {
            const t = now()
            steps[name] = (steps[name] ?? 0) + (t - last)
            last = t
        },
        summary() {
            return { totalMs: now() - startedAt, steps: { ...steps } }
        },
    }
}
