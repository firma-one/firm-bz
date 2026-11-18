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

/**
 * Vercel caps one request to a server function at 4.5 MB, and the Overview report PDF travels inside
 * one, written as base64 text, which is a third bigger than the file. Kept a little under the cap
 * for the rest of the request. Checked in the browser before sending, so a PDF that wouldn't fit
 * says so plainly instead of failing as "The server answered 413". Larger reports wait on the
 * storage upload (.claude/plans/publish-and-send-update.md).
 */
export const MAX_ATTACHMENT_REQUEST_BYTES = 4_400_000
/** The largest PDF that fits, once written as base64 (about 3.3 MB). */
export const MAX_REPORT_PDF_BYTES = Math.floor((MAX_ATTACHMENT_REQUEST_BYTES * 3) / 4)

/** A file's size the way macOS and Windows show it: "4.1 MB". */
export function megabytes(bytes: number): string {
    return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** The PDF's size from its base64 text. */
export function base64Bytes(base64: string): number {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    return Math.floor((base64.length * 3) / 4) - padding
}

/** Whether a PDF written as base64 is too large to send. */
export function reportPdfTooLarge(base64: string): boolean {
    return base64.length > MAX_ATTACHMENT_REQUEST_BYTES
}

/** What to say when it is: its size, the limit, and what to do next (`next`; empty says nothing more). */
export function reportPdfTooLargeText(base64OrBytes: string | number, next = 'Send it without the PDF.'): string {
    const bytes = typeof base64OrBytes === 'string' ? base64Bytes(base64OrBytes) : base64OrBytes
    const said = `The Overview report is too large to attach (${megabytes(bytes)}; the limit is ${megabytes(MAX_REPORT_PDF_BYTES)}).`
    return next ? `${said} ${next}` : said
}

/** The report PDF's file name, the same in the email and on the form: "Q2_Go-To-Market_Positioning_Overview.pdf". */
export function reportPdfFileName(engagementName: string): string {
    return `${engagementName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Overview.pdf`
}
