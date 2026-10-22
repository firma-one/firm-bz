import type { ReminderWithContext } from "@/lib/actions/user-reminders"
import type { StatusStage } from "@/lib/ui/status"

/** Dispatched on window after any Inbox change, so the shell refreshes its badges. */
export const INBOX_CHANGED_EVENT = "firma:inbox-changed"

/**
 * The New UI Inbox's one item shape, merged from two sources (.claude/plans/ui-ux-overhaul.md,
 * Phase 4): the caller's notifications (plus platform-wide ones) and their own reminders (review
 * requests, @mentions, due dates), in the firms the Inbox shows — every firm the caller may open,
 * or one (.claude/plans/cross-firm-home-inbox.md).
 */

export type ApiNotification = {
    id: string
    createdAt: string
    /** Null for platform-wide notifications, which show in every firm. */
    firmId?: string | null
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
    /** The firm it belongs to, for the firm label; null for platform-wide notifications. */
    firmId: string | null
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
    /** The stage a notification reports, drawn as its StatusIcon beside the label (null for the rest). */
    stage?: StatusStage | null
    /** What it's about, for its leading icon; null falls back to a generic reminder or notification icon. */
    entity: InboxEntity | null
}

export type InboxEntity = "firm" | "client" | "engagement" | "deliverable" | "document" | "comment" | "invitation" | "member" | "storage"

/**
 * A reminder's subject from its entity key, "platform.<table>[.<column>]" (the keys
 * lib/reminders/entity-registry.ts resolves). An engagement's shares are its deliverables.
 */
export function reminderEntity(entityKey: string, action: string): InboxEntity | null {
    const [, table, column] = entityKey.split(".")
    switch (table) {
        case "firms": return "firm"
        case "clients": return "client"
        case "engagements": return column === "shares" ? (/comment/i.test(action) ? "comment" : "deliverable") : "engagement"
        case "documents": return "document"
        case "doc_comments": return "comment"
        case "engagement_invitations":
        case "client_invitations":
        case "firm_invitations": return "invitation"
        case "connectors": return "storage"
        default: return null
    }
}

/** A notification's subject from its type (lib/notify-event.ts and the Inngest reminders). */
const NOTIFICATION_ENTITY: Record<string, InboxEntity> = {
    DOCUMENT_STAGING_INTAKE: "document",
    DOCUMENT_ACCEPTED_BY_CLIENT: "document",
    DOCUMENT_REJECTED: "document",
    DOCUMENT_STATUS_CHANGED: "document",
    DOCUMENT_DUE_DATE_SET: "document",
    DELIVERABLE_DUE_REMINDER: "deliverable",
    DELIVERABLE_OVERDUE: "deliverable",
    EXTERNAL_CLIENT_COMMENT: "comment",
    ENGAGEMENT_INVITE_ACCEPTED: "member",
    PROJECT_DUE_DATE_SET: "engagement",
    CLIENT_FOLLOWUP_DUE: "client",
}

/**
 * Notifications that report a state change, in the status language: an upload waiting for review,
 * a document the client accepted, an invitation accepted, a document sent back.
 */
const NOTIFICATION_STAGE: Record<string, StatusStage> = {
    DOCUMENT_STAGING_INTAKE: "waiting",
    DOCUMENT_ACCEPTED_BY_CLIENT: "done",
    ENGAGEMENT_INVITE_ACCEPTED: "done",
    DOCUMENT_REJECTED: "problem",
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
        firmId: r.firmId ?? null,
        title: r.entityName,
        body: r.note ?? null,
        label: r.action,
        href: r.ctaUrl,
        at: r.dateValue,
        // A reminder "needs you" when it is due today, overdue, or undated (review requests).
        unread: r.delta === null || r.delta <= 0,
        overdue: r.delta !== null && r.delta < 0,
        dueLabel: r.dateValue ? r.label : null,
        entity: reminderEntity(r.entityKey, r.action),
    }
}

export function notificationToItem(n: ApiNotification): InboxItem {
    return {
        key: `n:${n.id}`,
        source: "notification",
        sourceId: n.id,
        firmId: n.firmId ?? null,
        title: n.title,
        body: n.body,
        label: humanizeType(n.type),
        href: n.ctaUrl,
        at: n.createdAt,
        unread: n.readAt === null,
        overdue: false,
        dueLabel: null,
        stage: NOTIFICATION_STAGE[n.type] ?? null,
        entity: NOTIFICATION_ENTITY[n.type] ?? null,
    }
}

export type ReminderGroups = {
    /** Past their date. */
    overdue: InboxItem[]
    /** Due today. */
    today: InboxItem[]
    /** Review requests and @mentions — no date, but waiting on you. */
    undated: InboxItem[]
    /** Dated in the future, however far out. */
    upcoming: InboxItem[]
}

/** Reminders in the given firm(s), in groups that need you first; within a group, soonest first. */
export function groupReminders(firms: string | ReadonlySet<string>, reminders: ReminderWithContext[]): ReminderGroups {
    const inScope = (firmId: string | null | undefined) => !!firmId && (typeof firms === "string" ? firmId === firms : firms.has(firmId))
    const visible = reminders
        .filter((r) => !r.hiddenAt && inScope(r.firmId))
        .sort((a, b) => (a.delta ?? Infinity) - (b.delta ?? Infinity))
    const groups: ReminderGroups = { overdue: [], today: [], undated: [], upcoming: [] }
    for (const r of visible) {
        const item = reminderToItem(r)
        if (r.delta === null) groups.undated.push(item)
        else if (r.delta < 0) groups.overdue.push(item)
        else if (r.delta === 0) groups.today.push(item)
        else groups.upcoming.push(item)
    }
    return groups
}

/** Notifications for the Inbox: newest first. */
export function sortNotifications(notifications: ApiNotification[]): InboxItem[] {
    return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(notificationToItem)
}
