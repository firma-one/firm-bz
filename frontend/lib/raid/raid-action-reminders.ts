import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { removeRemindersByEntity, upsertFollowUpReminder } from '@/lib/reminders/reminder-service'
import { shortDay } from './raid-shared'

/**
 * An Action in the RAID log is a reminder for its owner (.claude/plans/raid-actions-memo-minutes.md): while
 * it's open and has both an owner and a due date, it sits in the owner's reminders, so it shows on their
 * Home (Needs you, the Agenda) and in their Inbox, with the email and push a reminder gets. The log is the
 * record; the reminder follows it:
 *
 *  - a new owner takes it over, and the old owner's goes;
 *  - closing the Action, or clearing its owner or date, removes it; reopening puts it back;
 *  - Done on the reminder, in the Inbox or on Home, closes the Action (closeActionFromReminder).
 *
 * Its words and place come from the entry itself (the resolver in lib/reminders/entity-registry.ts), so a
 * renamed Action reads right without rewriting anyone's reminders.
 */

export const RAID_ACTION_ENTITY_KEY = 'platform.engagement_raid_items'
/** The reminder watches the Action's due date: clearing it removes the reminder (upsertFollowUpReminder). */
export const RAID_ACTION_DATE_KEY = 'platform.engagement_raid_items.dueDate'
/** The reminder's action: not "Review…", so Home lists it by its date (lib/home/needs-you-rules.ts). */
export const RAID_ACTION_REMINDER = 'Action'

/** What the sync needs of an entry, before and after a change. */
export interface ActionReminderState {
    id: string
    type: string
    status: string
    ownerUserId: string | null
    dueDate: Date | string | null
    title: string
    firmId: string
    engagementId: string
}

function dayOf(value: Date | string | null): string | null {
    if (!value) return null
    return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

/** An open Action with an owner and a due date: the only kind that has a reminder. */
function remindable(state: ActionReminderState | null): state is ActionReminderState & { ownerUserId: string } {
    return !!state && state.type === 'ACTION' && state.status === 'OPEN' && !!state.ownerUserId && !!dayOf(state.dueDate)
}

/** The engagement's RAID tab, where the reminder opens. */
export async function raidTabPathFor(engagementId: string): Promise<string | null> {
    const e = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } } },
    })
    const groupSlug = e?.client?.firm?.group?.slug
    const firmSlug = e?.client?.firm?.slug
    const clientSlug = e?.client?.slug
    return groupSlug && firmSlug && clientSlug && e?.slug ? engagementPath(groupSlug, firmSlug, clientSlug, e.slug, { tab: 'raid' }) : null
}

/**
 * Brings the owner's reminder in line with the entry, after any write to it. `before` is the entry as it
 * was (null for a new one), `after` as it is now (null when it's gone). Never fails the write it follows:
 * the log is saved either way, and a reminder that didn't follow is logged.
 */
export async function syncActionReminder(before: ActionReminderState | null, after: ActionReminderState | null): Promise<void> {
    try {
        const had = remindable(before) ? before.ownerUserId : null
        const next = remindable(after) ? after : null
        const id = (after ?? before)?.id
        if (!id) return
        if (had && had !== next?.ownerUserId) await removeRemindersByEntity(had, RAID_ACTION_ENTITY_KEY, id)
        if (!next) return
        await upsertFollowUpReminder({
            userId: next.ownerUserId,
            entityKey: RAID_ACTION_ENTITY_KEY,
            entityValue: next.id,
            action: RAID_ACTION_REMINDER,
            dateKey: RAID_ACTION_DATE_KEY,
            dateValue: dayOf(next.dueDate),
            entityName: next.title,
            firmId: next.firmId,
            ctaUrl: await raidTabPathFor(next.engagementId),
        })
    } catch (error) {
        logger.error('RAID action: the reminder did not follow the entry', error as Error, 'RAID', { itemId: (after ?? before)?.id })
    }
}

/**
 * Done on an Action's reminder closes the Action (Deepak, 2026-11-15). Only the owner's own reminder does,
 * and only while it's open. Called inside the reminder lock (lib/actions/user-reminders.ts), so it touches
 * the entry alone: the reminder is being removed by the caller already.
 */
export async function closeActionFromReminder(userId: string, itemId: string, now: Date = new Date()): Promise<void> {
    const item = await prisma.engagementRaidItem.findUnique({
        where: { id: itemId },
        select: { id: true, type: true, status: true, ownerUserId: true },
    })
    if (!item || item.type !== 'ACTION' || item.status !== 'OPEN' || item.ownerUserId !== userId) return
    await prisma.engagementRaidItem.update({
        where: { id: item.id },
        data: { status: 'CLOSED', closedAt: now, closedBy: userId, closedReason: `Done · ${shortDay(now)}`, updatedBy: userId },
    })
}
