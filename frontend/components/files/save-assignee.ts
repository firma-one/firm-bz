import { failureReason } from '@/lib/files/action-failure'

/**
 * Sets a document's assignee (null unassigns); the Files row and the Details pane both save through here.
 * Never throws: a refusal answers the route's words, a dropped request says it never got there.
 */
export async function saveAssignee(projectId: string, documentId: string, assigneeUserId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const { getSession } = await import('@/lib/supabase')
        const session = await getSession()
        const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/assignee`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({ assigneeUserId }),
        })
        if (res.ok) return { ok: true }
        const err = await res.json().catch(() => ({})) as { error?: unknown }
        return { ok: false, error: typeof err.error === 'string' && err.error ? err.error : `The server answered ${res.status}. Try again.` }
    } catch (e) {
        return { ok: false, error: failureReason(e) }
    }
}
