import { logger } from '@/lib/logger'

/**
 * Refresh the Supabase session (JWT claims) and the server-side UserSettingsPlus
 * cache, then hard-navigate to `href` so the next page renders with fresh
 * permissions. Mirrors what a sign-out/sign-in does, without the round-trip.
 * Best-effort: navigation happens even if either refresh fails.
 */
export async function refreshAccessAndNavigate(href: string): Promise<void> {
    try {
        const { supabase } = await import('@/lib/supabase')
        await supabase.auth.refreshSession()
        const { refreshMyUserSettingsPlus } = await import('@/lib/actions/user-settings')
        await refreshMyUserSettingsPlus()
    } catch (err) {
        logger.warn('refreshAccessAndNavigate: refresh failed, navigating anyway', err as Error)
    }
    window.location.href = href
}
