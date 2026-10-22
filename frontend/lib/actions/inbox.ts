'use server'

import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { computeDueReminders } from '@/lib/reminders/reminder-service'
import { getHomeFirms } from '@/lib/home/home-firms'
import { getMyWork, type NeedsYouItem } from '@/lib/home/my-work'

/**
 * The Inbox badge and the Inbox's Needs you list (.claude/plans/app-design-refinements.md, section 13).
 *
 * The badge counts only what needs the signed-in user — Home's Needs you (lib/home/my-work.ts), from
 * the same rules, so the badge and Home never disagree: approvals and client comments waiting on a
 * lead, changes requested on what they own, and reminders that are review requests or undated.
 * Notifications are updates — they keep their unread dot in the Inbox but never add to the badge, and
 * deadlines are the Agenda's. Counted per firm the user may open right now (getHomeFirms).
 */
export type InboxCounts = { byFirm: Record<string, number>; platform: number }

/** What is waiting on this user across every firm they may open. Server-only: not exported. */
async function needsYouFor(userId: string): Promise<NeedsYouItem[]> {
    const [{ firms }, reminders] = await Promise.all([
        getHomeFirms(userId),
        computeDueReminders(userId).catch(() => []),
    ])
    const work = await getMyWork({ userId, firms, reminders })
    return work.needsYou
}

export async function getInboxCounts(): Promise<InboxCounts> {
    const empty: InboxCounts = { byFirm: {}, platform: 0 }
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return empty

        const byFirm: Record<string, number> = {}
        for (const item of await needsYouFor(user.id)) {
            if (item.firmId) byFirm[item.firmId] = (byFirm[item.firmId] ?? 0) + 1
        }
        return { byFirm, platform: 0 }
    } catch (e) {
        logger.error('getInboxCounts failed', e as Error, 'Inbox')
        return empty
    }
}

/** The Inbox's Needs you: the signed-in user's, the same items Home lists. */
export async function getNeedsYou(): Promise<NeedsYouItem[]> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return []
        return await needsYouFor(user.id)
    } catch (e) {
        logger.error('getNeedsYou failed', e as Error, 'Inbox')
        return []
    }
}
