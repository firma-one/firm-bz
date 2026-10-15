'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { getUserNotificationPrefs, isValidTimezone } from '@/lib/notification-prefs'

/*
 * Only the session-scoped action lives here — every export of a 'use server' file is callable from
 * the browser. The userId-taking helpers (getUserNotificationPrefs, claimDailyDigest, …) are in
 * lib/notification-prefs.ts (server-only).
 */

export type { UserNotificationPrefs } from '@/lib/notification-prefs'

/**
 * Stores the caller's browser timezone. No-op when unchanged, so the once-per-session
 * client ping is cheap. Never throws — a missing timezone only costs digest accuracy.
 */
export async function setUserTimezone(timezone: string): Promise<{ ok: boolean }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { ok: false }
        if (!(await isValidTimezone(timezone))) return { ok: false }

        const current = await getUserNotificationPrefs(user.id)
        if (current.timezone === timezone) return { ok: true }

        await prisma.userPersonalization.upsert({
            where: { userId: user.id },
            create: { userId: user.id, notificationPrefs: { ...current, timezone } as any },
            update: { notificationPrefs: { ...current, timezone } as any },
        })
        return { ok: true }
    } catch (e) {
        logger.error('setUserTimezone failed', e as Error, 'Notifications')
        return { ok: false }
    }
}
