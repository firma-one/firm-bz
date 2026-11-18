/**
 * When a save's answer never arrives (the connection dropped: Chrome rejects every request in flight
 * on a network change), the server may still have made the change. Asking again for the document says
 * which, so a change that went through isn't reported as failed, and one that didn't isn't assumed.
 *
 * Answers the document as the server has it now, or null when that can't be read either.
 */
export async function readSavedDocument(projectId: string, documentId: string): Promise<Record<string, unknown> | null> {
    try {
        const { getSession } = await import('@/lib/supabase')
        const session = await getSession()
        const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing`, {
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
            cache: 'no-store',
        })
        if (!res.ok) return null
        const data = await res.json().catch(() => null)
        const sharing = data?.sharing
        return sharing && typeof sharing === 'object' ? (sharing as Record<string, unknown>) : null
    } catch {
        return null
    }
}

/** The day of a stored due date, for comparing a read-back with what was asked for. */
export function sameDueDate(stored: unknown, asked: string | null): boolean {
    if (asked === null) return stored === null || stored === undefined
    if (typeof stored !== 'string') return false
    const a = new Date(stored).getTime()
    const b = new Date(asked).getTime()
    return !Number.isNaN(a) && a === b
}
