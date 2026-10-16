'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Remembers whether the sidebar is collapsed. Merges into `uiPrefs` in a single statement, so a
 * concurrent write of another UI preference is never clobbered by a read-modify-write.
 */
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
