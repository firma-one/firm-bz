import 'server-only'

import { isAgentUserIdAsync } from '@/lib/ai/agent-email'
import { createClient } from '@/utils/supabase/server'
import { safeInngestSend } from '@/lib/inngest/client'
import { getFirmReminderConfig } from '@/lib/firm-reminder-config'
import { logger } from '@/lib/logger'
import { resolveEntity } from '@/lib/reminders/entity-registry'
import {
    loadReminderItems as loadItems,
    saveReminderItems as saveItems,
    withReminderLock,
} from '@/lib/reminders/reminder-store'
import type { ReminderItem, ReminderWithContext } from '@/lib/reminders/reminder-types'

/**
 * Reminder operations that act on an explicit userId — computing someone's due list, writing a
 * reminder for another member, removing reminders across users.
 *
 * Kept out of lib/actions/user-reminders.ts on purpose: that file is 'use server', and every
 * function it exports can become a client-callable server action, so a userId parameter there
 * would let any signed-in user read or change another user's reminders. Callers here are route
 * handlers, crons and other server actions that have already decided whose reminders to touch.
 * The session-scoped actions (getUserReminders, markReminderDone, …) stay in user-reminders.ts.
 */

function computeLabel(delta: number): { label: string; labelStyle: ReminderWithContext['labelStyle'] } {
    switch (delta) {
        case 2:  return { label: 'Due in 2 days', labelStyle: 'slate' }
        case 1:  return { label: 'Due tomorrow',  labelStyle: 'slate' }
        case 0:  return { label: 'Due today',     labelStyle: 'amber' }
        case -1: return { label: '1 day overdue', labelStyle: 'orange' }
        case -2: return { label: '2 days overdue', labelStyle: 'red' }
        default: return { label: delta > 0 ? `Due in ${delta} days` : `${Math.abs(delta)} days overdue`, labelStyle: delta > 0 ? 'slate' : 'red' }
    }
}

/**
 * Resolves a user's reminders into the same shape the topbar panel renders: everything
 * overdue plus the next 30 days, date-less items always included, entity names/CTAs
 * resolved (falling back to the cached copy when the entity is gone).
 *
 * Shared deliberately with the daily digest cron so the notification a user receives can
 * never disagree with the panel they open. Takes an explicit userId because the cron has
 * no session; getUserReminders() is the session-scoped wrapper.
 */
export async function computeDueReminders(
    userId: string,
    opts: {
        /** Upcoming reminders further out than this are left out. `null` = no limit (the Inbox's
         *  Upcoming list). Default 30, which the panel, the digest and the badges rely on. */
        horizonDays?: number | null
    } = {}
): Promise<ReminderWithContext[]> {
    const items = await loadItems(userId)
    const horizonDays = opts.horizonDays === undefined ? 30 : opts.horizonDays

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const horizon = horizonDays === null ? null : new Date(today)
    if (horizon) { horizon.setDate(today.getDate() + (horizonDays as number)); horizon.setHours(23, 59, 59, 999) }

    const validItems = items.filter((item) => item.entityKey && item.entityValue && item.action)

    const inWindow = validItems.filter((item) => {
        if (!item.dateValue) return true // date-less: always show
        if (!horizon) return true
        const d = new Date(item.dateValue)
        return d <= horizon // all overdue + upcoming within the horizon
    })

    const resolved = await Promise.all(
        inWindow.map(async (item): Promise<ReminderWithContext | null> => {
            const ctx = await resolveEntity(item.entityKey, item.entityValue)?.catch(() => null) ?? null

            // Fall back to cached name/ctaUrl when entity has been deleted
            const entityName = (ctx?.name || item.entityName) ?? ''
            const ctaUrl = ctx?.ctaUrl ?? item.ctaUrl ?? null

            // Drop the reminder only if we have no name at all (no cache either)
            if (!entityName) return null

            let delta: number | null = null
            let label = ''
            let labelStyle: ReminderWithContext['labelStyle'] = 'slate'

            if (item.dateValue) {
                const d = new Date(item.dateValue); d.setHours(0, 0, 0, 0)
                delta = Math.round((d.getTime() - today.getTime()) / 86400000)
                const computed = computeLabel(delta)
                label = computed.label
                labelStyle = computed.labelStyle
            }

            return {
                id: item.id,
                entityKey: item.entityKey,
                entityValue: item.entityValue,
                action: item.action,
                dateKey: item.dateKey,
                dateValue: item.dateValue,
                hiddenAt: item.hiddenAt,
                note: item.note ?? null,
                entityName,
                entitySlug: ctx?.slug ?? null,
                firmSlug: ctx?.firmSlug ?? null,
                firmId: ctx?.firmId ?? null,
                ctaUrl,
                delta,
                label,
                labelStyle,
            }
        })
    )

    const results = resolved.filter(Boolean) as ReminderWithContext[]
    // Sort: date-based first (ascending), then date-less
    return results.sort((a, b) => {
        if (!a.dateValue && !b.dateValue) return 0
        if (!a.dateValue) return 1
        if (!b.dateValue) return -1
        return new Date(a.dateValue).getTime() - new Date(b.dateValue).getTime()
    })
}

/**
 * Lightweight existence check for "does the current user have a reminder for entity X" —
 * returns a Set of `${entityKey}:${entityValue}` keys for active (non-hidden) reminders.
 * Skips resolveEntity/30-day windowing since callers only need a boolean, not display data.
 */
export async function getReminderKeysForUser(userId: string): Promise<Set<string>> {
    const items = await loadItems(userId)
    const keys = new Set<string>()
    for (const item of items) {
        if (!item.entityKey || !item.entityValue || item.hiddenAt) continue
        keys.add(`${item.entityKey}:${item.entityValue}`)
    }
    return keys
}

/** Upsert a reminder linked to a DB date field. Called from client.ts when followUpDate changes. */
export async function upsertFollowUpReminder(params: {
    userId: string
    entityKey: string
    entityValue: string
    action: string
    dateKey: string | null
    dateValue: string | null
    entityName: string
    firmId: string
    ctaUrl: string | null
    note?: string | null
}): Promise<void> {
    // Agents are firm members, so "remind every lead" lists include Brio — and writing a reminder
    // for it would create a UserPersonalization row that nothing ever reads or clears. Guarded in
    // the shared helper rather than at each caller: there are many, and a new one would otherwise
    // have to remember.
    if (await isAgentUserIdAsync(params.userId)) return

    // Serialised per user: updateProject fires due/kickoff/follow-up upserts for one
    // save, and without this they race on the shared reminders JSON array and drop
    // each other's writes.
    return withReminderLock(params.userId, async () => {
        const items = await loadItems(params.userId)

        const existing = items.find(
            (r) => r.entityKey === params.entityKey &&
                   r.entityValue === params.entityValue &&
                   r.dateKey === params.dateKey
        )

        if (!params.dateValue && params.dateKey !== null) {
            // Date was cleared — remove the reminder node and cancel Inngest
            if (existing) {
                await safeInngestSend('reminder.email.cancelled', { reminderId: existing.id })
                await safeInngestSend('reminder.recurring.cancelled', { reminderId: existing.id })
                const next = items.filter((r) => r.id !== existing.id)
                await saveItems(params.userId, next)
            }
            return
        }

        if (existing) {
            // Update dateValue (and note if provided)
            const wasScheduled = existing.dateValue !== params.dateValue
            const next = items.map((r) =>
                r.id === existing.id
                    ? { ...r, dateValue: params.dateValue, ...(params.note !== undefined && { note: params.note }) }
                    : r
            )
            await saveItems(params.userId, next)
            if (wasScheduled) {
                await safeInngestSend('reminder.email.cancelled', { reminderId: existing.id })
                await safeInngestSend('reminder.recurring.cancelled', { reminderId: existing.id })
                await scheduleReminderEmail(existing.id, params)
                await scheduleRecurringReminder(existing.id, params)
            }
        } else {
            // Create new reminder item
            const id = generateId()
            const newItem: ReminderItem = {
                id,
                entityKey: params.entityKey,
                entityValue: params.entityValue,
                action: params.action,
                dateKey: params.dateKey,
                dateValue: params.dateValue,
                hiddenAt: null,
                createdAt: new Date().toISOString(),
                note: params.note ?? null,
                entityName: params.entityName,
                ctaUrl: params.ctaUrl,
            }
            await saveItems(params.userId, [...items, newItem])
            await scheduleReminderEmail(id, params)
            await scheduleRecurringReminder(id, params)
            await sendImmediateReminderEmail(params)
        }
    })
}

async function scheduleReminderEmail(
    reminderId: string,
    params: { entityKey: string; entityValue: string; action: string; dateKey: string | null; dateValue: string | null; entityName: string; firmId: string; ctaUrl: string | null; userId: string }
): Promise<void> {
    if (!params.dateValue) return
    const fireAt = new Date(params.dateValue)
    if (fireAt <= new Date()) return // past dates — don't schedule
    fireAt.setUTCHours(9, 0, 0, 0)

    await safeInngestSend('reminder.email.scheduled', {
        reminderId,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        entityName: params.entityName,
        action: params.action,
        userId: params.userId,
        firmId: params.firmId,
        dateKey: params.dateKey,
        fireAt: fireAt.toISOString(),
        ctaUrl: params.ctaUrl,
    })
}

async function scheduleRecurringReminder(
    reminderId: string,
    params: { entityKey: string; entityValue: string; action: string; dateKey: string | null; dateValue: string | null; entityName: string; firmId: string; ctaUrl: string | null; userId: string }
): Promise<void> {
    const config = await getFirmReminderConfig(params.firmId)
    if (!config.recurring.enabled) return

    const now = new Date()
    let nextFireAt: Date

    if (params.dateValue) {
        const dueDate = new Date(params.dateValue)
        const startDate = new Date(dueDate)
        startDate.setDate(startDate.getDate() - config.recurring.startDaysBeforeDue)
        // Start from max(today, dueDate - startDaysBeforeDue)
        nextFireAt = startDate > now ? startDate : now
        // Don't schedule if already past due date
        if (nextFireAt >= dueDate) return
    } else {
        // Date-less reminder — start recurring from now
        nextFireAt = now
    }

    nextFireAt.setUTCHours(9, 0, 0, 0)
    // If that time is already past today, advance to tomorrow
    if (nextFireAt <= now) {
        nextFireAt.setDate(nextFireAt.getDate() + 1)
    }

    await safeInngestSend('reminder.recurring.scheduled', {
        reminderId,
        userId: params.userId,
        firmId: params.firmId,
        entityName: params.entityName,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        action: params.action,
        ctaUrl: params.ctaUrl,
        dueDate: params.dateValue ?? null,
        frequencyDays: config.recurring.frequencyDays,
        startDaysBeforeDue: config.recurring.startDaysBeforeDue,
        nextFireAt: nextFireAt.toISOString(),
    })
}

async function sendImmediateReminderEmail(
    params: { entityName: string; firmId: string; ctaUrl: string | null; userId: string; action: string }
): Promise<void> {
    const config = await getFirmReminderConfig(params.firmId)

    // Push on create only when the reminder is for SOMEONE ELSE — being assigned a review
    // is worth an interruption. Pushing to the person who just set the date is not: they
    // performed the action a second ago, so it reports their own work back at them. The
    // "it's due" pushes still fire later from the scheduled Inngest paths either way.
    //
    // Independent of the immediateOnCreate email toggle; gated by the reminders row in the
    // Event Notifications grid instead.
    try {
        const supabase = await createClient()
        const { data: { user: actor } } = await supabase.auth.getUser()
        if (actor?.id !== params.userId) {
            const { sendReminderPush } = await import('@/lib/reminders/reminder-push')
            await sendReminderPush({
                userId: params.userId,
                firmId: params.firmId,
                title: `${params.action}: ${params.entityName}`,
                body: 'Assigned to you',
                ctaUrl: params.ctaUrl,
            })
        }
    } catch {
        // No session (cron/webhook context) — skip the create push rather than guess.
    }

    if (!config.immediateOnCreate) return

    try {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const { sendEmail } = await import('@/lib/email')
        const { renderReminderEmail } = await import('@/lib/email-templates/reminder')
        const admin = createAdminClient()
        const { data } = await admin.auth.admin.getUserById(params.userId)
        const email = data?.user?.email
        if (!email) return

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const ctaUrl = params.ctaUrl ? `${appUrl}${params.ctaUrl}` : null
        const { subject, html } = renderReminderEmail({
            entityName: params.entityName,
            action: params.action,
            ctaUrl,
            ctaLabel: 'View →',
            kind: 'created',
        })
        await sendEmail(email, subject, html)
    } catch (e) {
        logger.error('sendImmediateReminderEmail failed', e as Error, 'Reminders', { userId: params.userId })
    }
}

function generateId(): string {
    // Simple ID: timestamp + random suffix
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Remove all reminders matching a given entityKey+entityValue from a specific user's account.
 * Used when an invitation is accepted to clean up the invitor's "Invitation expiring" reminder.
 */
export async function removeRemindersByEntity(userId: string, entityKey: string, entityValue: string): Promise<void> {
    return withReminderLock(userId, async () => {
        const items = await loadItems(userId)
        const toRemove = items.filter((r) => r.entityKey === entityKey && r.entityValue === entityValue)
        if (toRemove.length === 0) return

        for (const item of toRemove) {
            await safeInngestSend('reminder.email.cancelled', { reminderId: item.id })
            await safeInngestSend('reminder.recurring.cancelled', { reminderId: item.id })
        }
        await saveItems(userId, items.filter((r) => r.entityKey !== entityKey || r.entityValue !== entityValue))
    })
}

/**
 * Remove all reminders matching entityKey+entityValue across a set of users.
 * Used when an entity is deleted (engagement, document) to clean up all members' reminders.
 * Cancels any scheduled Inngest email/recurring jobs for each removed reminder.
 */
export async function removeRemindersByEntityForUsers(
    userIds: string[],
    entityKey: string,
    entityValue: string,
): Promise<void> {
    await Promise.allSettled(
        userIds.map((uid) => removeRemindersByEntity(uid, entityKey, entityValue))
    )
}
