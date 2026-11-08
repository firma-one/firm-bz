/**
 * The words for a secure open (sharing/regrant) the route refused. The route says why: it answers
 * `{ error, code }` for a refused grant, a PDF copy that couldn't be made, a download block storage
 * refused, SharePoint's external sharing policy or a revoke. That's shown as it is, and a 403 is no
 * longer read as "revoked", since most aren't (P1-42).
 */
export function regrantRefusalReason(status: number, body: { error?: unknown } | null | undefined): string {
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error
    if (status === 401) return 'Your session has ended. Refresh the page and sign in again.'
    if (status === 403) return "You don't have access to this document. Ask the engagement's Lead if you need it."
    if (status === 404) return 'This document is no longer in this engagement. Refresh the list.'
    return "Couldn't open this document. Try again in a moment."
}
