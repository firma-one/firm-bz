'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { computeDueReminders } from '@/lib/reminders/reminder-service'

/**
 * Unread counts for the New UI Inbox badges (.claude/plans/ui-ux-overhaul.md, Phase 4): the
 * sidebar's Inbox item for the current firm and the workspace switcher's other firms.
 *
 * Counted per firm, for the signed-in user only:
 *  - notifications not yet read (the same rule as /api/notifications' unreadCount);
 *  - reminders that need attention now — not hidden, and due today, overdue or undated (review
 *    requests and @mentions). The same set the daily digest counts.
 * Platform-scoped notifications have no firm; they are returned separately and shown on every firm.
 */
export type InboxCounts = { byFirm: Record<string, number>; platform: number }

export async function getInboxCounts(): Promise<InboxCounts> {
    const empty: InboxCounts = { byFirm: {}, platform: 0 }
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return empty

        const [grouped, reminders] = await Promise.all([
            prisma.notification.groupBy({
                by: ['firmId'],
                where: { userId: user.id, readAt: null },
                _count: { _all: true },
            }),
            computeDueReminders(user.id).catch(() => []),
        ])

        const byFirm: Record<string, number> = {}
        let platform = 0
        for (const g of grouped) {
            if (g.firmId) byFirm[g.firmId] = (byFirm[g.firmId] ?? 0) + g._count._all
            else platform += g._count._all
        }
        for (const r of reminders) {
            if (r.hiddenAt || !r.firmId) continue
            if (r.delta === null || r.delta <= 0) byFirm[r.firmId] = (byFirm[r.firmId] ?? 0) + 1
        }
        return { byFirm, platform }
    } catch (e) {
        logger.error('getInboxCounts failed', e as Error, 'Inbox')
        return empty
    }
}
