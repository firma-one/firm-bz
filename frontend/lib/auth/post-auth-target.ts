/**
 * Single source of truth for "where does a user go once they're authenticated?".
 *
 * Shared by every client-side auth entry point (signin's already-signed-in check and its
 * post-OTP navigation; signup's already-logged-in check and its post-signup navigation) so the
 * rules below are enforced in one place rather than restated in each file. The server-side
 * `app/(app)/auth/callback/route.ts` does NOT use this — it resolves the landing path directly
 * via `resolveDefaultFirmLandingPath`, which this helper deliberately defers to `/d` instead.
 *
 * Rules, in order:
 *  1. An explicit `?next=` / `?redirect=` deep link wins — invite links and the like must land
 *     exactly where they point.
 *  2. Legacy `/dash` paths normalise to their `/d` equivalents.
 *  3. A bare `/d` is NOT a destination, it's just "the app". Middleware emits `?redirect=/d`
 *     when it invalidates a session (e.g. a deployment-version mismatch, which fires on every
 *     local dev-server restart), and taking that literally strands a single-firm user on the
 *     group picker. Route it through `?entry=auth` so `app/(app)/d/(landing)/page.tsx` runs
 *     `resolveDefaultFirmLandingPath` and drops the user straight into their firm.
 *  4. Anything unsafe or absent falls back to the same auto-resolving `/d?entry=auth`.
 *
 * Only same-origin relative paths are accepted; a protocol-relative `//evil.com` is rejected
 * so a crafted `?redirect=` can't bounce a freshly-authenticated user off-site.
 */
export const AUTO_RESOLVE_TARGET = '/d?entry=auth'

export function resolvePostAuthTarget(params: URLSearchParams | null | undefined): string {
    const raw = params?.get('redirect') || params?.get('next') || null

    // Must be a relative path; reject protocol-relative ("//host") open-redirects.
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return AUTO_RESOLVE_TARGET

    const normalized =
        raw === '/dash' || raw.startsWith('/dash/')
            ? '/d' + (raw === '/dash' ? '' : raw.slice(5))
            : raw

    // Bare `/d` (however it was spelled) means "no real destination" — auto-resolve instead.
    if (normalized === '/d' || normalized === '/d/') return AUTO_RESOLVE_TARGET

    return normalized
}
