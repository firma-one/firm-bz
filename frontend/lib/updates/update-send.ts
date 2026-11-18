/**
 * Emailing the engagement's published update (.claude/plans/publish-and-send-update.md): the shapes
 * the send route answers and the words the Overview says about a send. No server-only imports, so the
 * browser's recipient field and the route check addresses the same way.
 */

/**
 * Someone on the engagement the update can go to. `role` is the role's display name. `email` lets a
 * typed address be matched to the person (a Lead sees members' addresses on the Members tab too).
 */
export interface UpdateRecipient {
    userId: string
    name: string
    role: string
    email: string
}

/** GET /api/projects/[id]/send-update: who's filled in, and who got the last one. */
export interface UpdateRecipientsInfo {
    recipients: UpdateRecipient[]
    lastSent: { sentAt: string; to: string[] } | null
    /** The sender, always copied (Cc), not removable. */
    cc?: { name: string; email: string } | null
}

/** What a send did: how many it reached, of how many, and who it couldn't (by name or address). */
export interface UpdateSendOutcome {
    sent: number
    total: number
    failed: string[]
    /** Whether the sender's own copy went. */
    copied?: boolean
}

/** Addresses typed in beside the engagement's people, per send. */
export const MAX_UPDATE_EMAILS = 20
/** The sender's note above the update. */
export const MAX_UPDATE_NOTE = 2000

const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]{2,}$/

/** A typed address, trimmed and lower case, or null when it isn't one. */
export function normalizeEmail(raw: string): string | null {
    const email = raw.trim().replace(/^mailto:/i, '').toLowerCase()
    return email.length <= 254 && EMAIL.test(email) ? email : null
}

function listOf(items: string[]): string {
    if (items.length <= 1) return items[0] ?? ''
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The toast for a send. Nothing sent is an error; some sent is a warning that names who wasn't. */
export function updateSendText(outcome: UpdateSendOutcome, published = false): { type: 'success' | 'warning' | 'error'; title: string; message: string } {
    const { sent, total, failed } = outcome
    const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
    const copy = outcome.copied === false ? " Your copy didn't go through." : outcome.copied ? ' You got a copy.' : ''
    if (sent >= total && total > 0) {
        return { type: 'success', title: published ? 'Published and emailed' : 'Update sent', message: `Emailed to ${people(total)}.${copy}` }
    }
    const who = failed.length ? listOf(failed.slice(0, 4)) + (failed.length > 4 ? ` and ${failed.length - 4} more` : '') : ''
    if (sent === 0) {
        return {
            type: 'error',
            title: published ? 'Published, but not emailed' : 'Update not sent',
            message: who ? `Couldn't reach ${who}.` : "Couldn't reach anyone.",
        }
    }
    return { type: 'warning', title: published ? 'Published, emailed to some' : 'Sent to some', message: `Sent to ${sent} of ${total}. Couldn't reach ${who || `${total - sent} of them`}.` }
}
