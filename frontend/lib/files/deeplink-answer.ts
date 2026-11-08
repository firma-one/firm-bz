/**
 * What the Files list does with the answer to a link from a notification or an email (resolve-deeplink
 * or file-info): remember it for the visit, and what to say when it found nothing. Only the server
 * saying "not found" or "no access" (404, 403) is "no access"; a 500 or a dropped connection is a
 * failure to try again, and is never remembered as no access (P1-43). A 401 is the session still
 * arriving: nothing is said yet.
 *
 * `status` is the answer's HTTP status, 0 when the request never got there.
 */
export function deeplinkAnswer(status: number | undefined, found: boolean): { remember: boolean; say: 'no_access' | 'try_again' | null } {
    const definite = found || status === 200 || status === 403 || status === 404
    if (found) return { remember: true, say: null }
    if (status === 401 || status === undefined) return { remember: false, say: null }
    return { remember: definite, say: definite ? 'no_access' : 'try_again' }
}
