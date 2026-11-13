import type { EngagementRole } from '@prisma/client'

/**
 * Internal notes in a discussion (2026-10-29, .claude/plans/engagement-assets-details.md): a comment
 * the firm writes for itself, in the same thread as its replies to the client. One flag on the
 * comment (`DocCommentMessage.isInternal`), and three rules every reader of comments follows:
 *
 * 1. An external collaborator or viewer never sees one — not its text, not that it exists (counts,
 *    previews, unread dots, reactions, reminders).
 * 2. It never notifies or reminds a client.
 * 3. It is not a reply to the client: "awaiting a reply" is decided by the shared comments only.
 *
 * Only the firm's own roles write them.
 */

const EXTERNAL_ROLES: ReadonlySet<string> = new Set(['eng_ext_collaborator', 'eng_viewer'])

function isExternal(role: EngagementRole | string | null | undefined): boolean {
    return !!role && EXTERNAL_ROLES.has(role)
}

/** Spread into a docCommentMessage `where`: the comments this engagement role may see. */
export function visibleCommentsWhere(role: EngagementRole | string | null | undefined): { isInternal?: false } {
    return isExternal(role) ? { isInternal: false } : {}
}

/** Spread into a docCommentMessage `where`: the conversation with the client, which decides who is awaiting a reply. */
export const SHARED_COMMENTS = { isInternal: false } as const

/** Who may write an internal note: the firm's own roles, never a client. */
export function canWriteInternalNote(role: EngagementRole | string | null | undefined): boolean {
    return !!role && !isExternal(role)
}

/** Whether an internal note may remind or notify this member: never a client. */
export function canBeRemindedOfInternalNote(role: EngagementRole | string | null | undefined): boolean {
    return canWriteInternalNote(role)
}

/**
 * Whether a discussion awaits the firm's reply: its latest shared comment (rule 3, internal notes
 * don't count) is by a Limited Access contributor or a Reviewer. The rule behind the Discussions
 * page's "Awaiting reply" and the insights' unanswered threads, as a function for the places that
 * hold the comments themselves: the comments pane and Brio's reply drafts.
 *
 * `comments` oldest first. `roleOf` is the author's engagement role; someone no longer on the
 * engagement has none and awaits nothing. A resolved discussion awaits no one either: callers that
 * know it's resolved check that too.
 */
export function awaitsFirmReply(
    comments: readonly { isInternal?: boolean | null; authorUserId: string | null }[],
    roleOf: (userId: string) => EngagementRole | string | null | undefined,
): boolean {
    for (let i = comments.length - 1; i >= 0; i--) {
        const c = comments[i]
        if (c.isInternal) continue
        return !!c.authorUserId && isExternal(roleOf(c.authorUserId))
    }
    return false
}
