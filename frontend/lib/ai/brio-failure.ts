import { ASSISTANT } from './assistant'

/**
 * Brio's own words for a failure, shared by the routes that answer them and the panels that show
 * them, so a model error reads the same everywhere and never as "Internal server error" or the
 * browser's "network error".
 *
 * Safe to import from client components: no SDK, no key.
 */

/** The model failed before or during an answer. */
export const BRIO_ANSWER_FAILED = `${ASSISTANT.name} couldn't finish this answer. Try again.`

/** Shown under a partial answer whose stream broke off. */
export const BRIO_ANSWER_CUT_OFF = `Cut off · ${BRIO_ANSWER_FAILED}`

/** The engagement summary could not be written. */
export const BRIO_SUMMARY_FAILED = `${ASSISTANT.name} couldn't write a summary. Try again.`

/** The firm brief could not be written. */
export const BRIO_BRIEF_FAILED = `${ASSISTANT.name} couldn't write a new brief. Try again.`

/** A draft (status update, reply, nudge) could not be written. Nothing was sent. */
export const BRIO_DRAFT_FAILED = `${ASSISTANT.name} couldn't write a draft. Try again.`

/** Your brief on Home could not be written. */
export const BRIO_DAY_FAILED = `${ASSISTANT.name} couldn't write your brief. Try again.`

/** No actions could be read from the notes. Nothing was changed. */
export const BRIO_PROPOSALS_FAILED = `${ASSISTANT.name} couldn't read actions from these notes. Nothing was changed.`

/** The RAID check could not read the conversation. Nothing was added to the log. */
export const BRIO_RAID_FAILED = `${ASSISTANT.name} couldn't read the new messages and memos for the RAID log. Nothing was added.`

/** Brio took longer than the surface allows. */
export const BRIO_TOO_SLOW = `${ASSISTANT.name} took too long. Try again.`

/** The data Brio writes from could not be read. */
export const BRIO_DATA_UNREADABLE = `${ASSISTANT.name} couldn't read the data it works from. Try again.`

/** The request never reached the server (fetch threw), so nothing on the server ran. */
export const BRIO_UNREACHABLE = `Couldn't reach ${ASSISTANT.name}. Nothing was changed.`

/** A request to Brio never left the browser; nothing to undo, so trying again is the advice. */
export const BRIO_UNREACHABLE_RETRY = `Couldn't reach ${ASSISTANT.name}. Check your connection and try again.`

/**
 * The words for a Brio panel's failed request: what the server said, or, when the request never got
 * there (fetch throws a TypeError), that Brio couldn't be reached.
 */
export function brioFailureReason(e: unknown, fallback: string): string {
    if (e instanceof TypeError) return BRIO_UNREACHABLE
    return e instanceof Error && e.message ? e.message : fallback
}
