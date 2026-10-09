/**
 * The chat thread, kept across page navigation and reload within a session.
 *
 * ## Why sessionStorage and not localStorage
 *
 * An answer embeds client data — deliverable names, counts, due dates — so persisting one writes
 * engagement detail into browser storage on whatever machine the user happens to be at. That is
 * why `chat-history.ts` keeps only the questions.
 *
 * `sessionStorage` is scoped to the tab and dies when it closes, which makes the exposure the same
 * as the thread already on screen: anyone who could read it could read the panel. A shared or
 * borrowed machine does not inherit the conversation, because closing the tab ends it.
 *
 * ## Why threads are per page, not per engagement
 *
 * Overview and Files hold different conversations about the same engagement — one about status,
 * one about naming and folders — and the suggestion chips, context and capabilities differ. Merging
 * them would interleave two subjects and carry Files answers into a panel that cannot act on them.
 *
 * ## Why restored answers are marked rather than hidden
 *
 * An answer is true of a moment. "3 deliverables are overdue" was right when asked and may be
 * wrong an hour later. Dropping answers on reload loses the conversation; restoring them silently
 * presents a stale figure as current. So each turn carries the time it was produced and the UI
 * shows it, which lets the reader judge.
 *
 * No `server-only`: this is browser state and never reaches the server.
 */

export interface StoredMessage {
    role: 'user' | 'assistant'
    content: string
    /** Epoch millis the turn was produced. Drives the relative timestamp on restore. */
    at: number
    answerId?: string
    stopped?: boolean
}

/**
 * One thread per engagement per surface.
 *
 * `surface` is the page: 'overview', 'files'. Adding one needs no change here.
 */
const KEY = (engagementId: string, surface: string) =>
    `fm_chat_thread_${surface}_${engagementId}`

/**
 * How many turns survive a reload.
 *
 * Twenty is about ten exchanges — far more than anyone scrolls back through, and small enough that
 * the stored blob stays well inside the ~5MB sessionStorage budget even with long answers.
 */
export const MAX_STORED_TURNS = 20

/** Longer than this and a single answer is not worth the quota it would take. */
const MAX_CONTENT_CHARS = 8000

export function readThread(engagementId: string, surface: string): StoredMessage[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = sessionStorage.getItem(KEY(engagementId, surface))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        if (!Array.isArray(parsed)) return []
        // Validated per entry: this survives a deploy, so an older or hand-edited shape must not
        // crash the panel it renders in.
        return parsed
            .filter((m): m is StoredMessage => {
                if (!m || typeof m !== 'object') return false
                const { role, content, at } = m as StoredMessage
                return (role === 'user' || role === 'assistant')
                    && typeof content === 'string' && typeof at === 'number'
            })
            .slice(-MAX_STORED_TURNS)
    } catch {
        return []
    }
}

export function writeThread(
    engagementId: string,
    surface: string,
    messages: StoredMessage[],
): void {
    if (typeof window === 'undefined') return
    try {
        // Only settled turns. A message still streaming would be stored half-written and restored
        // as a truncated answer with no sign that it was cut off.
        const settled = messages
            .filter((m) => m.content.trim().length > 0)
            .slice(-MAX_STORED_TURNS)
            .map((m) => ({
                ...m,
                content: m.content.length > MAX_CONTENT_CHARS
                    ? `${m.content.slice(0, MAX_CONTENT_CHARS)}…`
                    : m.content,
            }))
        if (settled.length === 0) {
            sessionStorage.removeItem(KEY(engagementId, surface))
            return
        }
        sessionStorage.setItem(KEY(engagementId, surface), JSON.stringify(settled))
    } catch {
        // Full, blocked, or private-mode storage. The thread simply does not survive reload, which
        // is the behaviour before this existed.
    }
}

export function clearThread(engagementId: string, surface: string): void {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem(KEY(engagementId, surface))
    } catch {
        // Nothing to do: a thread that cannot be cleared also could not have been written.
    }
}
