/**
 * Recent questions asked of the engagement chat, persisted per engagement.
 *
 * Mirrors the Doc Search history pattern (`fm_document_search_history_*`): localStorage, capped,
 * every access wrapped so a full or blocked store degrades to "no history" rather than throwing.
 *
 * ## Why questions and not answers
 *
 * Only the questions are kept. Two reasons, and the second is the stronger one:
 *
 * 1. **Privacy.** An answer embeds engagement data — deliverable names, counts, due dates — so
 *    persisting answers would copy client data into browser storage on whatever machine the user
 *    happened to be on. The question is text the user typed themselves.
 * 2. **Correctness.** An answer is true of a moment. "3 deliverables are overdue" is wrong the next
 *    day, and restoring it on reload would present stale figures as current. Re-asking regenerates
 *    against live data, which is the only answer worth showing.
 *
 * No `server-only`: this is browser state and never reaches the server.
 */

export interface ChatHistoryEntry {
    question: string
    /** Epoch millis of the most recent time this question was asked. */
    askedAt: number
}

const KEY = (engagementId: string) => `fm_engagement_chat_history_${engagementId}`

/** Ten matches Doc Search, and is about as many as a one-line recall list can show usefully. */
export const CHAT_HISTORY_MAX = 10

/** Questions longer than this are almost certainly pasted prose, not something to re-ask. */
const MAX_QUESTION_CHARS = 300

export function getChatHistory(engagementId: string): ChatHistoryEntry[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(KEY(engagementId))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        if (!Array.isArray(parsed)) return []
        // Validate each entry: this data survives deploys, so an older or hand-edited shape must
        // not crash the panel it renders in.
        return parsed
            .filter((e): e is ChatHistoryEntry =>
                Boolean(e) && typeof e === 'object'
                && typeof (e as ChatHistoryEntry).question === 'string'
                && (e as ChatHistoryEntry).question.trim().length > 0
                && typeof (e as ChatHistoryEntry).askedAt === 'number')
            .slice(0, CHAT_HISTORY_MAX)
    } catch {
        return []
    }
}

function save(engagementId: string, entries: ChatHistoryEntry[]): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(KEY(engagementId), JSON.stringify(entries.slice(0, CHAT_HISTORY_MAX)))
    } catch {
        // Full, blocked, or private-mode storage. History simply does not persist.
    }
}

/**
 * Records a question and returns the updated list.
 *
 * Re-asking an existing question moves it to the top rather than adding a duplicate — a recall list
 * showing the same question three times is worse than useless, and the common case is a user
 * repeating a question they find valuable.
 */
export function recordChatQuestion(engagementId: string, question: string): ChatHistoryEntry[] {
    const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS)
    if (!trimmed) return getChatHistory(engagementId)

    const prev = getChatHistory(engagementId)
    const deduped = prev.filter((e) => e.question.toLowerCase() !== trimmed.toLowerCase())
    const next = [{ question: trimmed, askedAt: Date.now() }, ...deduped].slice(0, CHAT_HISTORY_MAX)
    save(engagementId, next)
    return next
}

/** Clears the list for one engagement. */
export function clearChatHistory(engagementId: string): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.removeItem(KEY(engagementId))
    } catch {
        // Nothing to do — the caller resets its own state regardless.
    }
}
