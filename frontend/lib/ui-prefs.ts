import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Per-user UI preferences stored in `user_personalizations.uiPrefs`.
 *
 * Deliberately NOT a server action: it takes a userId, and an exported `'use server'` function
 * taking a userId would let any client read any user's preferences. Callers pass the id of the
 * already-authenticated user.
 *
 * Rows may still carry a `shell` key from the retired "New UI" switch; it is ignored.
 */

export type UserUiPrefs = {
    /** Sidebar hidden on desktop (toggled with `[` or the sidebar button). */
    sidebarCollapsed: boolean
}

const DEFAULTS: UserUiPrefs = { sidebarCollapsed: false }

function normalize(raw: unknown): UserUiPrefs {
    const r = (raw ?? {}) as Record<string, unknown>
    return { sidebarCollapsed: r.sidebarCollapsed === true }
}

/** Never throws — falls back to the defaults. */
export async function getUserUiPrefs(userId: string): Promise<UserUiPrefs> {
    try {
        const row = await prisma.userPersonalization.findUnique({
            where: { userId },
            select: { uiPrefs: true },
        })
        return normalize(row?.uiPrefs)
    } catch (e) {
        logger.error('getUserUiPrefs failed', e as Error, 'UiPrefs')
        return DEFAULTS
    }
}
