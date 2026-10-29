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
