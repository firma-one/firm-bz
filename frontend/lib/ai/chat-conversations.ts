/**
 * Named Brio conversations, kept in the browser across sessions.
 *
 * Supersedes the pair this replaces: `chat-thread-store` held ONE thread per scope in
 * sessionStorage, and `chat-history` held a list of bare questions in localStorage. The two never
 * lined up — within a session the answer to a listed question was usually still on screen, and
 * across sessions it was gone forever, so clicking a "recent question" had to re-ask it and spend
 * a credit to reproduce something the user had already read.
 *
 * Here a history entry IS a conversation: titled, durable, and opened rather than re-run.
 *
 * ## Why localStorage, and what that costs
 *
 * An answer embeds engagement data — deliverable names, counts, due dates — so this writes client
 * detail to disk on whatever machine the user is at, which `chat-thread-store` deliberately did
 * not do. That is a product decision taken knowingly: a named conversation list that empties when
 * the tab closes is not a conversation list. Three things bound the exposure:
 *
 * 1. It never leaves the browser. No `server-only` because it never reaches a server at all.
 * 2. It is capped (`MAX_CONVERSATIONS`) and aged out (`MAX_AGE_DAYS`), so a stale answer about a
 *    long-finished engagement cannot sit there indefinitely.
 * 3. Clearing is one action, and the data-rights export/delete flow is unaffected because none of
 *    this is ours to hold — it is the user's own browser storage.
 *
 * Note the privacy policy must not say conversations live in the browser "for the session".
 *
 * ## Why answers are stamped, not hidden
 *
 * An answer is true of a moment. "3 deliverables are overdue" was right when asked and may be
 * wrong an hour later, let alone a week. Every turn carries the time it was produced and the UI
 * shows it, which lets the reader judge rather than being handed a stale figure as current. The
 * age cap exists because that judgement gets harder the older the answer is.
 */

export interface StoredMessage {
    role: 'user' | 'assistant'
    content: string
    /** Epoch millis the turn was produced. Drives the relative timestamp on restore. */
    at: number
    answerId?: string
    stopped?: boolean
}

export interface Conversation {
    id: string
    /** Derived from the first question — see `deriveTitle`. */
    title: string
    messages: StoredMessage[]
    /** Epoch millis of the first message. */
    createdAt: number
    /** Epoch millis of the most recent message. Drives ordering and ageing. */
    updatedAt: number
    /** Pinned conversations are exempt from both the count cap and the age cap. */
    pinned?: boolean
}

/** One list per engagement per surface, matching how threads were already keyed. */
const KEY = (engagementId: string, surface: string) =>
    `fm_chat_conversations_${surface}_${engagementId}`

/**
 * How many conversations survive.
 *
 * Twenty threads of twenty turns is comfortably inside the ~5MB localStorage budget even with
 * long answers, and is far more than anyone scrolls. Pinned ones do not count against it.
 */
export const MAX_CONVERSATIONS = 20

/**
 * How stale a restorable conversation may get.
 *
 * Thirty days bounds the worst case: an answer describing an engagement as it was last month,
 * reopened as though current. Pinned conversations are exempt — pinning is an explicit decision
 * to keep something, and silently deleting it would be the failure pinning exists to prevent.
 */
export const MAX_AGE_DAYS = 30
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000

/** Matches the old thread store: about ten exchanges. */
export const MAX_STORED_TURNS = 20

/** Longer than this and a single answer is not worth the quota it would take. */
const MAX_CONTENT_CHARS = 8000

/** Long enough to tell two conversations apart, short enough for a 17rem pane. */
export const MAX_TITLE_CHARS = 50

/**
 * Names a conversation from its first question.
 *
 * The user's own words, truncated — not a model-generated summary. It is free, instant and
 * deterministic, it cannot fail or need an error path, and it is recognisable precisely because
 * the user wrote it. Spending a credit and a round trip to turn "Which documents still need a due
 * date?" into "Deliverable due dates" buys tidiness and loses recognition.
 */
export function deriveTitle(firstQuestion: string): string {
    const clean = firstQuestion.trim().replace(/\s+/g, ' ')
    if (!clean) return 'Untitled'
    if (clean.length <= MAX_TITLE_CHARS) return clean
    // Break on a word boundary where there is one near the limit, so a title does not end
    // mid-word when a space was three characters away.
    const cut = clean.slice(0, MAX_TITLE_CHARS)
    const lastSpace = cut.lastIndexOf(' ')
    return `${(lastSpace > MAX_TITLE_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Collision-resistant enough for a per-browser list, with no dependency. */
function newId(): string {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function isStoredMessage(m: unknown): m is StoredMessage {
    if (!m || typeof m !== 'object') return false
    const { role, content, at } = m as StoredMessage
    return (role === 'user' || role === 'assistant')
        && typeof content === 'string' && typeof at === 'number'
}

function isConversation(c: unknown): c is Conversation {
    if (!c || typeof c !== 'object') return false
    const v = c as Conversation
    return typeof v.id === 'string' && v.id.length > 0
        && typeof v.title === 'string'
        && Array.isArray(v.messages)
        && typeof v.createdAt === 'number'
        && typeof v.updatedAt === 'number'
}

/**
 * Reads the list, newest first, with malformed, over-long and aged-out entries dropped.
 *
 * Ageing happens on READ rather than on a timer: there is no process to run one, and a list that
 * only ever shrinks when written would keep showing entries it has already decided are too old.
 */
export function listConversations(engagementId: string, surface: string): Conversation[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(KEY(engagementId, surface))
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        if (!Array.isArray(parsed)) return []
        const cutoff = Date.now() - MAX_AGE_MS
        return parsed
            .filter(isConversation)
            .map((c) => ({ ...c, messages: c.messages.filter(isStoredMessage).slice(-MAX_STORED_TURNS) }))
            .filter((c) => c.messages.length > 0)
            .filter((c) => c.pinned || c.updatedAt >= cutoff)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_CONVERSATIONS + countPinned(parsed))
    } catch {
        return []
    }
}

function countPinned(raw: unknown[]): number {
    return raw.filter((c) => isConversation(c) && c.pinned).length
}

function save(engagementId: string, surface: string, list: Conversation[]): void {
    if (typeof window === 'undefined') return
    try {
        // Pinned first for the cap, so a full list of unpinned conversations can never evict one
        // the user deliberately kept.
        const pinned = list.filter((c) => c.pinned)
        const rest = list.filter((c) => !c.pinned).slice(0, MAX_CONVERSATIONS)
        localStorage.setItem(
            KEY(engagementId, surface),
            JSON.stringify([...pinned, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)),
        )
    } catch {
        // Full, blocked, or private-mode storage. Conversations simply do not persist, which is
        // the behaviour before this existed.
    }
}

function trimMessages(messages: StoredMessage[]): StoredMessage[] {
    // Only settled turns. A message still streaming would be stored half-written and restored as
    // a truncated answer with no sign that it was cut off.
    return messages
        .filter((m) => m.content.trim().length > 0)
        .slice(-MAX_STORED_TURNS)
        .map((m) => ({
            ...m,
            content: m.content.length > MAX_CONTENT_CHARS
                ? `${m.content.slice(0, MAX_CONTENT_CHARS)}…`
                : m.content,
        }))
}

export function getConversation(
    engagementId: string,
    surface: string,
    id: string,
): Conversation | null {
    return listConversations(engagementId, surface).find((c) => c.id === id) ?? null
}

/**
 * Writes a conversation's turns, creating it on first write.
 *
 * Returns the id so a caller that passed `null` learns which conversation it just started.
 * Writing an empty message list deletes it rather than leaving a titled, bodyless entry.
 */
export function saveConversation(
    engagementId: string,
    surface: string,
    id: string | null,
    messages: StoredMessage[],
): string | null {
    const settled = trimMessages(messages)
    const list = listConversations(engagementId, surface)

    if (settled.length === 0) {
        if (id) save(engagementId, surface, list.filter((c) => c.id !== id))
        return null
    }

    const now = Date.now()
    const existing = id ? list.find((c) => c.id === id) : undefined

    if (existing) {
        const updated: Conversation = {
            ...existing,
            messages: settled,
            // The title is set once, from the question that started the conversation. Retitling
            // on every turn would rename a thread under the user as they used it.
            updatedAt: now,
        }
        save(engagementId, surface, [updated, ...list.filter((c) => c.id !== existing.id)])
        return existing.id
    }

    const firstQuestion = settled.find((m) => m.role === 'user')?.content ?? ''
    const created: Conversation = {
        id: id ?? newId(),
        title: deriveTitle(firstQuestion),
        messages: settled,
        createdAt: settled[0]?.at ?? now,
        updatedAt: now,
    }
    save(engagementId, surface, [created, ...list])
    return created.id
}

export function deleteConversation(engagementId: string, surface: string, id: string): Conversation[] {
    const remaining = listConversations(engagementId, surface).filter((c) => c.id !== id)
    save(engagementId, surface, remaining)
    return remaining
}

/**
 * Pins or unpins, which exempts a conversation from both the count cap and the age cap.
 *
 * At the pin cap this is a no-op rather than an eviction: silently dropping something the user
 * deliberately kept is the failure pinning exists to prevent, so the caller disables the control
 * and says which pin to release.
 */
export const MAX_PINNED = 10

export function setConversationPinned(
    engagementId: string,
    surface: string,
    id: string,
    pinned: boolean,
): Conversation[] {
    const list = listConversations(engagementId, surface)
    if (pinned && list.filter((c) => c.pinned).length >= MAX_PINNED) return list
    const next = list.map((c) => (c.id === id ? { ...c, pinned } : c))
    save(engagementId, surface, next)
    return next
}

/** Clears unpinned conversations. Pins are kept — the control that calls this says so. */
export function clearConversations(engagementId: string, surface: string): Conversation[] {
    const kept = listConversations(engagementId, surface).filter((c) => c.pinned)
    save(engagementId, surface, kept)
    return kept
}
