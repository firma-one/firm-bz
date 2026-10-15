import { prisma } from '@/lib/prisma'
import { isAgentUserIdAsync } from '@/lib/ai/agent-email'
import type { ReminderItem } from '@/lib/reminders/reminder-types'

/**
 * Storage and locking for a user's reminders array (UserPersonalization.reminders).
 *
 * Kept out of lib/actions/user-reminders.ts on purpose: that file is 'use server', so anything it
 * exports can become a client-callable action, and these helpers take an arbitrary userId. Route
 * handlers that write another user's reminders (intake, sharing) import from here instead.
 */

export async function loadReminderItems(userId: string): Promise<ReminderItem[]> {
    const p = await prisma.userPersonalization.findUnique({
        where: { userId },
        select: { reminders: true },
    })
    return Array.isArray(p?.reminders) ? (p!.reminders as ReminderItem[]) : []
}

export async function saveReminderItems(userId: string, items: ReminderItem[]): Promise<void> {
    await prisma.userPersonalization.upsert({
        where: { userId },
        create: { userId, reminders: items as any },
        update: { reminders: items as any },
    })
}

/**
 * Serialises mutations of one user's reminders array within this process.
 *
 * The array lives in a single JSON column, so load → modify → save is a read-modify-write.
 * updateProject fires up to three upserts for one save (due / kickoff / follow-up), and
 * concurrent runs each read the same starting array and write back their own copy —
 * last write wins, and a reminder silently disappears. Its scheduled Inngest job then
 * wakes, cannot find the id, and returns skipped:'done', so no email and no push.
 *
 * Per-user chaining rather than a global lock: two different users never contend.
 * In-process only, which is enough for the concurrency that actually caused this (one
 * request fanning out); withReminderLock also re-reads inside the lock so each mutation
 * sees the previous one's writes.
 */
const reminderLocks = new Map<string, Promise<unknown>>()

export async function withReminderLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = reminderLocks.get(userId) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    // Keep the chain alive even if this link rejects, and drop it once it is the tail.
    reminderLocks.set(userId, run.catch(() => undefined))
    try {
        return await run
    } finally {
        if (reminderLocks.get(userId) === run || reminderLocks.get(userId)) {
            const current = reminderLocks.get(userId)
            void Promise.resolve(current).then(() => {
                if (reminderLocks.get(userId) === current) reminderLocks.delete(userId)
            })
        }
    }
}

/**
 * Appends `item` to a user's reminders unless one with the same id is already there. Runs under
 * withReminderLock and re-reads inside it, so it cannot clobber a concurrent locked mutation.
 * Returns true when the item was added.
 *
 * Skips the Brio agent user, for the same reason upsertFollowUpReminder does: nothing ever reads
 * or clears an agent's reminders.
 */
export async function appendReminderItem(userId: string, item: ReminderItem): Promise<boolean> {
    if (await isAgentUserIdAsync(userId)) return false
    return withReminderLock(userId, async () => {
        const items = await loadReminderItems(userId)
        if (items.some((r) => r.id === item.id)) return false
        await saveReminderItems(userId, [...items, item])
        return true
    })
}
