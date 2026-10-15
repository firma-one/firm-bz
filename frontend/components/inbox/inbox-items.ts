import type { ReminderWithContext } from "@/lib/actions/user-reminders"

/** Dispatched on window after any Inbox change, so the shell refreshes its badges. */
export const INBOX_CHANGED_EVENT = "firma:inbox-changed"

/**
 * The New UI Inbox's one item shape, merged from two sources (.claude/plans/ui-ux-overhaul.md,
 * Phase 4): the caller's notifications for this firm (plus platform-wide ones) and their own
 * reminders in this firm (review requests, @mentions, due dates).
 */

export type ApiNotification = {
    id: string
    createdAt: string
    scope: string
    type: string
    priority: string
    title: string
    body: string | null
    ctaUrl: string | null
    readAt: string | null
}

export type InboxItem = {
    key: string
    source: "notification" | "reminder"
    sourceId: string
    title: string
    body: string | null
    /** Reminder action ("Review comment", "Follow-up") or the notification's type, humanized. */
    label: string
    href: string | null
    /** Notification: when it arrived. Reminder: its due date, if any. */
    at: string | null
    unread: boolean
    overdue: boolean
    /** Reminder due-date label from the reminder engine ("Due today", "3 days overdue"). */
    dueLabel: string | null
}

function humanizeType(type: string): string {
    return type
        .toLowerCase()
        .split("_")
        .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" ")
}

export function reminderToItem(r: ReminderWithContext): InboxItem {
    return {
        key: `r:${r.id}`,
        source: "reminder",
        sourceId: r.id,
        title: r.entityName,
        body: r.note ?? null,
        label: r.action,
        href: r.ctaUrl,
        at: r.dateValue,
        // A reminder "needs you" when it is due today, overdue, or undated (review requests).
        unread: r.delta === null || r.delta <= 0,
        overdue: r.delta !== null && r.delta < 0,
        dueLabel: r.dateValue ? r.label : null,
    }
}

export function notificationToItem(n: ApiNotification): InboxItem {
    return {
        key: `n:${n.id}`,
        source: "notification",
        sourceId: n.id,
        title: n.title,
        body: n.body,
        label: humanizeType(n.type),
        href: n.ctaUrl,
        at: n.createdAt,
        unread: n.readAt === null,
        overdue: false,
        dueLabel: null,
    }
}

/**
 * To do: this firm's visible reminders, overdue first then soonest, undated (review requests) after.
 * Notifications: newest first.
 */
export function buildInbox(
    firmId: string,
    reminders: ReminderWithContext[],
    notifications: ApiNotification[]
): { todo: InboxItem[]; notifications: InboxItem[] } {
    const todo = reminders
        .filter((r) => !r.hiddenAt && r.firmId === firmId)
        .sort((a, b) => {
            if (a.delta === null && b.delta === null) return 0
            if (a.delta === null) return 1
            if (b.delta === null) return -1
            return a.delta - b.delta
        })
        .map(reminderToItem)
    const notes = [...notifications]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(notificationToItem)
    return { todo, notifications: notes }
}
