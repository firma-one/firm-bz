/**
 * Reminder shapes, shared by the server-only reminder service (lib/reminders/reminder-service.ts),
 * the session-scoped actions (lib/actions/user-reminders.ts) and client components.
 * Types only — safe to import anywhere.
 */

// ─── Stored shape ────────────────────────────────────────────────────────────

export type ReminderItem = {
    id: string               // nanoid
    entityKey: string        // "platform.clients.id"
    entityValue: string      // actual entity primary key
    action: string           // "Follow-up"
    dateKey: string | null   // "platform.clients.followUpDate" | null
    dateValue: string | null // ISO date | null
    hiddenAt: string | null  // null = visible
    createdAt: string        // ISO date
    note?: string | null     // optional user note
    entityName?: string      // cached fallback — used when entity is deleted
    ctaUrl?: string | null   // cached fallback — used when entity is deleted
}

// ─── Context shape returned to UI ────────────────────────────────────────────

export type ReminderWithContext = {
    id: string
    entityKey: string
    entityValue: string
    action: string
    dateKey: string | null
    dateValue: string | null
    hiddenAt: string | null
    note?: string | null     // optional user note
    // resolved
    entityName: string
    entitySlug: string | null
    firmSlug: string | null
    firmId: string | null
    ctaUrl: string | null
    /** Where it sits, for the Inbox's place chips: its client, and its engagement unless it is one. */
    clientName?: string | null
    engagementName?: string | null
    // computed (null when dateValue is null)
    delta: number | null
    label: string
    labelStyle: 'slate' | 'amber' | 'orange' | 'red'
}
