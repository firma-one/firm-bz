/**
 * What to tell someone when a file action failed. The server's answer says why (a StorageFailure's
 * words, lib/connectors/storage-failure.ts); and when the request never got there, that's the reason.
 */

/** The error for an answer that wasn't ok, carrying the server's reason. */
export async function failureFrom(res: Response): Promise<Error> {
    const err = await res.json().catch(() => null) as { error?: string } | null
    return new Error(err?.error || `The server answered ${res.status}. Try again.`)
}

/** The words for a caught error. fetch itself throws a TypeError when the request never got there. */
export function failureReason(e: unknown): string {
    if (e instanceof TypeError) return "Couldn't reach Firma. Check your connection and try again."
    return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.'
}
