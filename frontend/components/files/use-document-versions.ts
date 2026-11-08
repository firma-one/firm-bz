"use client"

import { useCallback, useEffect, useState } from "react"
import type { DriveRevision } from "@/lib/types"
import { failureFrom, failureReason } from "@/lib/files/action-failure"

export interface DocumentVersions {
    revisions: DriveRevision[]
    loading: boolean
    /** Why the list didn't load: the storage's words (P2-02), shown with Retry. */
    error: string | null
    /** The document's storage has no version list wired yet (OneDrive today), as opposed to none. */
    unsupported: boolean
    /** Loads the list again. */
    reload: () => void
}

/**
 * A document's versions, from its engagement's versions route — shared by the Version history and
 * Activity stream panes. The sign-in cookie authenticates the request; the route checks membership
 * and takes the storage connection from the document.
 */
export function useDocumentVersions(documentId: string | undefined, projectId: string | undefined): DocumentVersions {
    const [state, setState] = useState<Omit<DocumentVersions, 'reload'>>({ revisions: [], loading: true, error: null, unsupported: false })
    const [loads, setLoads] = useState(0)

    useEffect(() => {
        if (!documentId || !projectId) {
            setState({ revisions: [], loading: false, error: 'Not available here', unsupported: false })
            return
        }
        let cancelled = false
        setState((s) => ({ ...s, loading: true, error: null }))
        fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/versions`)
            .then(async (res) => {
                if (!res.ok) throw await failureFrom(res)
                const data = await res.json()
                if (cancelled) return
                setState({ revisions: data.revisions || [], loading: false, error: null, unsupported: data.unsupported === true })
            })
            .catch((e) => {
                if (!cancelled) setState({ revisions: [], loading: false, error: failureReason(e), unsupported: false })
            })
        return () => { cancelled = true }
    }, [documentId, projectId, loads])

    const reload = useCallback(() => setLoads((n) => n + 1), [])
    return { ...state, reload }
}
