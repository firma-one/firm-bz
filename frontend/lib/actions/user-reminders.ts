'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import {
    loadReminderItems as loadItems,
    saveReminderItems as saveItems,
    withReminderLock,
} from '@/lib/reminders/reminder-store'
import { computeDueReminders, upsertFollowUpReminder } from '@/lib/reminders/reminder-service'
import { asResult, type ActionResult } from '@/lib/actions/action-result'
import { signedOut } from '@/lib/actions/action-reasons'

/*
 * Session-scoped reminder actions only. Every export here can be called from the browser as a
 * server action, so each one derives the user from the Supabase session and none accepts a userId.
 * Helpers that act on an explicit userId live in lib/reminders/reminder-service.ts (server-only).
 */

import type { ReminderWithContext } from '@/lib/reminders/reminder-types'
export type { ReminderItem, ReminderWithContext } from '@/lib/reminders/reminder-types'


// ─── Date field clearer map ──────────────────────────────────────────────────

/**
 * Done takes a reminder out of your own list only (2026-10-23). It used to clear the date the
 * reminder watches as well (DATE_FIELD_CLEARERS below), so marking "Engagement due" done erased the
 * engagement's due date for everyone. Kept behind this switch until the change is signed off.
 */
const DONE_KEEPS_ENTITY_DATES = true

const DATE_FIELD_CLEARERS: Record<string, (entityValue: string) => Promise<void>> = {
    // KEEP: client follow-up dates are paused, not retired — hidden from the UI on 2026-10-17 and to be revived. Don't remove this as unused.
    'platform.clients.followUpDate': async (id) => {
        await (prisma as any).client.update({ where: { id }, data: { followUpDate: null } })
    },
    'platform.clients.expectedCloseDate': async (id) => {
        await (prisma as any).client.update({ where: { id }, data: { expectedCloseDate: null } })
    },
    'platform.engagements.dueDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { dueDate: null } })
    },
    'platform.engagements.kickoffDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { kickoffDate: null } })
    },
    'platform.engagements.followUpDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { followUpDate: null } })
    },
    'platform.firm_invitations.expireAt': async (id) => {
        // Invitations are not cleared — just remove the reminder when done
    },
}

// loadItems / saveItems / withReminderLock live in lib/reminders/reminder-store.ts so route
// handlers that write other users' reminders share the same per-user lock.

// ─── Public server actions ───────────────────────────────────────────────────

export async function getUserReminders(): Promise<ReminderWithContext[]> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return []
    return computeDueReminders(user.id)
}

/**
 * Every one of the signed-in user's reminders, however far out — the New UI Inbox's Reminders view.
 * getUserReminders keeps its 30-day window for the legacy panel and the digest. The Inbox calls this
 * from the browser, so a failed load answers `{ ok: false }` (EM-1), never a throw it can't read.
 */
export async function getAllUserReminders(): Promise<ActionResult<ReminderWithContext[]>> {
    return asResult('getAllUserReminders', async () => {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) throw signedOut()
        return computeDueReminders(user.id, { horizonDays: null })
    })
}

/**
 * In-app counterpart to the daily digest push: on the first app load of the user's local
 * day, reports whether they have unseen due/overdue reminders so the panel can surface
 * itself once. Shares claimDailyDigest() with the cron, so a user who signs in before
 * their local 09:00 gets this instead of a push — never both.
 *
 * Returns notify:false when the day is already claimed or nothing is due.
 */
export async function checkDailyReminderDigest(): Promise<{ notify: boolean; count: number; overdue: number }> {
    const empty = { notify: false, count: 0, overdue: 0 }
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return empty

        const { getUserNotificationPrefs, localDateFor, claimDailyDigest } =
            await import('@/lib/notification-prefs')
        const prefs = await getUserNotificationPrefs(user.id)
        const localDate = await localDateFor(prefs.timezone)
        if (prefs.remindersDigest.lastNotifiedDate === localDate) return empty

        const items = (await computeDueReminders(user.id)).filter(
            (r) => !r.hiddenAt && (r.delta === null || r.delta <= 0)
        )
        if (items.length === 0) return empty

        // Claim last — never burn the stamp on a day with nothing to show.
        if (!(await claimDailyDigest(user.id, localDate))) return empty

        return {
            notify: true,
            count: items.length,
            overdue: items.filter((r) => r.delta !== null && r.delta < 0).length,
        }
    } catch (e) {
        logger.error('checkDailyReminderDigest failed', e as Error, 'Reminders')
        return empty
    }
}

/** The signed-in user, or the words for a session that has ended. */
async function sessionUserId(): Promise<string> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()
    return user.id
}

async function markReminderDoneOrThrow(reminderId: string): Promise<void> {
    const userId = await sessionUserId()
    return withReminderLock(userId, async () => {
        const items = await loadItems(userId)
        const item = items.find((r) => r.id === reminderId)
        if (!item) return

        // Clear the date column in the DB (off: see DONE_KEEPS_ENTITY_DATES)
        if (!DONE_KEEPS_ENTITY_DATES && item.dateKey && DATE_FIELD_CLEARERS[item.dateKey]) {
            await DATE_FIELD_CLEARERS[item.dateKey](item.entityValue).catch(() => {})
        }

        // Cancel Inngest jobs
        await safeInngestSend('reminder.email.cancelled', { reminderId })
        await safeInngestSend('reminder.recurring.cancelled', { reminderId })

        // Remove node from array
        await saveItems(userId, items.filter((r) => r.id !== reminderId))
    })
}

async function setReminderHidden(reminderId: string, hidden: boolean): Promise<void> {
    const userId = await sessionUserId()
    return withReminderLock(userId, async () => {
        const items = await loadItems(userId)
        const next = items.map((r) =>
            r.id === reminderId ? { ...r, hiddenAt: hidden ? new Date().toISOString() : null } : r
        )
        await saveItems(userId, next)
    })
}

/**
 * Mark a reminder done: remove the node and cancel Inngest. The date it watches stays (DONE_KEEPS_ENTITY_DATES).
 * Answers why when it can't (P2-30): with no session it used to return as if done, so the Inbox
 * dropped a reminder that stayed; code `unauthorized` when the session has ended.
 */
export async function markReminderDone(reminderId: string): Promise<ActionResult> {
    return asResult('markReminderDone', () => markReminderDoneOrThrow(reminderId))
}

/** Hide a reminder from the panel (sets hiddenAt). Answers why when it can't, rather than pretend. */
export async function hideReminder(reminderId: string): Promise<ActionResult> {
    return asResult('hideReminder', () => setReminderHidden(reminderId, true))
}

/** Unhide a reminder (clears hiddenAt). Answers why when it can't, rather than pretend. */
export async function showReminder(reminderId: string): Promise<ActionResult> {
    return asResult('showReminder', () => setReminderHidden(reminderId, false))
}

/** Mark multiple reminders done at once. Stops at the first that can't be, and says why. */
export async function markAllRemindersDone(reminderIds: string[]): Promise<ActionResult> {
    return asResult('markAllRemindersDone', async () => {
        for (const id of reminderIds) await markReminderDoneOrThrow(id)
    })
}

type ManualReminder = {
    entityKey: string
    entityValue: string
    action: string
    dateValue: string | null
    entityName: string
    firmId: string
    ctaUrl: string | null
    note?: string | null
}

/** Create a manual (ad-hoc) reminder for the currently logged-in user. Called from client UI. */
export async function createManualReminder(params: ManualReminder): Promise<ActionResult> {
    return asResult('createManualReminder', () => createManualReminderOrThrow(params))
}

async function createManualReminderOrThrow(params: ManualReminder): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()

    await upsertFollowUpReminder({
        userId: user.id,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        action: params.action,
        dateKey: null,
        dateValue: params.dateValue,
        entityName: params.entityName,
        firmId: params.firmId,
        ctaUrl: params.ctaUrl,
        note: params.note,
        // A manual reminder is its own thing: a second one on the same engagement is added, not
        // written over the first. Same action again still updates it.
        matchAction: true,
    })
}
