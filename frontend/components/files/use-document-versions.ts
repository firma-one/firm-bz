"use client"

import { useEffect, useState } from "react"
import type { DriveRevision } from "@/lib/types"

export interface DocumentVersions {
    revisions: DriveRevision[]
    loading: boolean
    error: string | null
    /** The document's storage has no version list wired yet (OneDrive today), as opposed to none. */
    unsupported: boolean
}

/**
 * A document's versions, from its engagement's versions route — shared by the Version history and
 * Activity stream panes. The sign-in cookie authenticates the request; the route checks membership
 * and takes the storage connection from the document.
 */
export function useDocumentVersions(documentId: string | undefined, projectId: string | undefined): DocumentVersions {
    const [state, setState] = useState<DocumentVersions>({ revisions: [], loading: true, error: null, unsupported: false })

    useEffect(() => {
        if (!documentId || !projectId) {
            setState({ revisions: [], loading: false, error: 'Not available here', unsupported: false })
            return
        }
        let cancelled = false
        setState((s) => ({ ...s, loading: true, error: null }))
        fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/versions`)
            .then(async (res) => {
                if (cancelled) return
                if (!res.ok) {
                    setState({ revisions: [], loading: false, error: 'Failed to load', unsupported: false })
                    return
                }
                const data = await res.json()
                if (cancelled) return
                setState({ revisions: data.revisions || [], loading: false, error: null, unsupported: data.unsupported === true })
            })
            .catch(() => {
                if (!cancelled) setState({ revisions: [], loading: false, error: 'Failed to load', unsupported: false })
            })
        return () => { cancelled = true }
    }, [documentId, projectId])

    return state
}
