/**
 * A document's Blocked flag (.claude/plans/deliverable-stages-blocked.md, section 3): what it is
 * waiting on, kept in `settings.blocked`. It doesn't change the document's stage. The firm's own:
 * set and cleared by firm roles, and left out of everything a client is sent.
 */

export type BlockedReason = 'client' | 'team' | 'on_hold'

export const BLOCKED_REASONS: readonly BlockedReason[] = ['client', 'team', 'on_hold']

export const BLOCKED_REASON_LABEL: Record<BlockedReason, string> = {
    client: 'Waiting on client',
    team: 'Waiting on our team',
    on_hold: 'On hold',
}

export interface BlockedFlag {
    reason: BlockedReason
    note?: string
    /** When it was set (ISO). */
    at: string
    /** Who set it (user id). */
    by: string
}

export const BLOCKED_NOTE_MAX = 280

/** The document's Blocked flag, or null when it isn't blocked (or the stored value isn't one). */
export function blockedOf(settings: unknown): BlockedFlag | null {
    if (!settings || typeof settings !== 'object') return null
    const raw = (settings as Record<string, unknown>).blocked as Partial<BlockedFlag> | null | undefined
    if (!raw || typeof raw !== 'object' || !BLOCKED_REASONS.includes(raw.reason as BlockedReason)) return null
    return {
        reason: raw.reason as BlockedReason,
        ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note } : {}),
        at: typeof raw.at === 'string' ? raw.at : '',
        by: typeof raw.by === 'string' ? raw.by : '',
    }
}

/**
 * Settings as a client may see them: without what is the firm's own. That's the Blocked flag, and
 * each approval's Archive copy (the approvals themselves stay: the client was party to them).
 */
export function withoutFirmOnlySettings<T>(settings: T): T {
    if (!settings || typeof settings !== 'object' || (!('blocked' in settings) && !('approvals' in settings))) return settings
    const { blocked: _blocked, ...rest } = settings as Record<string, unknown>
    if (Array.isArray(rest.approvals)) {
        rest.approvals = rest.approvals.map((r) => {
            if (!r || typeof r !== 'object') return r
            const { archived: _archived, ...record } = r as Record<string, unknown>
            return record
        })
    }
    return rest as T
}
