/** Sets a document's assignee (null unassigns); the Files row and the Details pane both save through here. */
export async function saveAssignee(projectId: string, documentId: string, assigneeUserId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
    const { getSession } = await import('@/lib/supabase')
    const session = await getSession()
    const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/assignee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ assigneeUserId }),
    })
    if (res.ok) return { ok: true }
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.error ?? 'Please try again.' }
}
