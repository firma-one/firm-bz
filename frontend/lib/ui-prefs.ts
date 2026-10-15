import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizeUiShell, type UiShell } from '@/lib/ui-shell'

/**
 * Per-user UI preferences stored in `user_personalizations.uiPrefs`.
 *
 * Deliberately NOT a server action: it takes a userId, and an exported `'use server'` function
 * taking a userId would let any client read any user's preferences. Callers pass the id of the
 * already-authenticated user.
 */

export type UserUiPrefs = {
    shell: UiShell
    /** New UI sidebar hidden on desktop (toggled with `[` or the sidebar button). */
    sidebarCollapsed: boolean
}

const DEFAULTS: UserUiPrefs = { shell: 'v1', sidebarCollapsed: false }

function normalize(raw: unknown): UserUiPrefs {
    const r = (raw ?? {}) as Record<string, unknown>
    return { shell: normalizeUiShell(r.shell), sidebarCollapsed: r.sidebarCollapsed === true }
}

/**
 * Never throws — falls back to the legacy UI. This also covers the window between deploying
 * this code and applying the `uiPrefs` migration, when the column does not exist yet.
 */
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
