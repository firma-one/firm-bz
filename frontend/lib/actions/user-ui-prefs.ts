'use server'

import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { UI_SHELL_COOKIE, UI_SHELL_COOKIE_MAX_AGE, normalizeUiShell, type UiShell } from '@/lib/ui-shell'

/**
 * Switches the caller between the legacy UI (`v1`) and the new UI (`v2`).
 *
 * Merges into `uiPrefs` in a single statement, so a concurrent write of another UI preference is
 * never clobbered by a read-modify-write. Also refreshes the mirror cookie so the next page load
 * paints in the right shell without waiting for the client to re-sync.
 */
export async function setUiShell(shell: UiShell): Promise<{ ok: boolean }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { ok: false }

        const value = normalizeUiShell(shell)
        await prisma.$executeRaw`
            INSERT INTO platform.user_personalizations ("userId", "uiPrefs", "createdAt", "updatedAt")
            VALUES (${user.id}::uuid, jsonb_build_object('shell', ${value}::text), now(), now())
            ON CONFLICT ("userId") DO UPDATE
            SET "uiPrefs" = COALESCE(platform.user_personalizations."uiPrefs", '{}'::jsonb)
                            || jsonb_build_object('shell', ${value}::text),
                "updatedAt" = now()
        `

        const cookieStore = await cookies()
        cookieStore.set(UI_SHELL_COOKIE, value, {
            path: '/',
            maxAge: UI_SHELL_COOKIE_MAX_AGE,
            sameSite: 'lax',
            // Read by the root layout's pre-paint script, so it must stay script-readable.
            httpOnly: false,
        })
        return { ok: true }
    } catch (e) {
        logger.error('setUiShell failed', e as Error, 'UiPrefs')
        return { ok: false }
    }
}

/** Remembers whether the New UI sidebar is collapsed. Same atomic merge as setUiShell. */
export async function setSidebarCollapsed(collapsed: boolean): Promise<{ ok: boolean }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { ok: false }

        const value = collapsed === true
        await prisma.$executeRaw`
            INSERT INTO platform.user_personalizations ("userId", "uiPrefs", "createdAt", "updatedAt")
            VALUES (${user.id}::uuid, jsonb_build_object('sidebarCollapsed', ${value}::boolean), now(), now())
            ON CONFLICT ("userId") DO UPDATE
            SET "uiPrefs" = COALESCE(platform.user_personalizations."uiPrefs", '{}'::jsonb)
                            || jsonb_build_object('sidebarCollapsed', ${value}::boolean),
                "updatedAt" = now()
        `
        return { ok: true }
    } catch (e) {
        logger.error('setSidebarCollapsed failed', e as Error, 'UiPrefs')
        return { ok: false }
    }
}
