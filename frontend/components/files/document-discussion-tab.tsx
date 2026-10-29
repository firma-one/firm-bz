"use client"

import { useEffect, useState } from "react"
import { MessagesSquare } from "lucide-react"
import { DocumentDocCommentsPane, type TaggableDocument } from "@/components/projects/document-doc-comments-pane"
import { DeliverableIcon } from "@/components/ui/deliverable-icon"

/**
 * A document's Discussions tab in the Details pane. Discussion happens on the deliverable, with its
 * documents tagged by "#" (Deepak, 2026-10-29) — so this opens the deliverable's thread, showing
 * the comments that tag this file first, with a new comment starting with its tag. Internal notes
 * are written there too (lib/comments/internal-notes.ts). A file outside any deliverable has no
 * thread of its own.
 */

interface DeliverableRef {
    id: string
    docId: string | null
    name: string
}

type Subtask = { documentId: string; docId: string | null; fileName: string; mimeType?: string | null; breadcrumb?: string[] }

export function DocumentDiscussionTab({ projectId, documentId, docId, orgSlug, isExternalUser }: {
    projectId: string
    /** The document's own row id or provider id. */
    documentId: string
    /** Its tag ("QSR-16"); without one it can't be tagged yet. */
    docId?: string | null
    orgSlug?: string
    isExternalUser?: boolean
}) {
    const [deliverable, setDeliverable] = useState<DeliverableRef | null | undefined>(undefined)
    const [taggable, setTaggable] = useState<TaggableDocument[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/deliverable`)
            const found: DeliverableRef | null = res.ok ? ((await res.json()).deliverable ?? null) : null
            if (cancelled) return
            setDeliverable(found)
            // The "#" menu lists the deliverable's documents. Only the firm's view loads it: the list
            // isn't narrowed to what a client may see.
            if (found && !isExternalUser) {
                const sub = await fetch(`/api/projects/${projectId}/documents/${found.id}/subtasks`)
                if (!sub.ok || cancelled) return
                const subtasks: Subtask[] = (await sub.json()).subtasks ?? []
                if (!cancelled) {
                    setTaggable(subtasks.map((t) => ({ documentId: t.documentId, docId: t.docId, fileName: t.fileName, mimeType: t.mimeType, breadcrumb: t.breadcrumb })))
                }
            }
        })().catch(() => { if (!cancelled) setDeliverable(null) })
        return () => { cancelled = true }
    }, [projectId, documentId, isExternalUser])

    if (deliverable === undefined) {
        return <div className="m-4 h-16 animate-pulse rounded-card bg-surface-muted" />
    }

    if (deliverable === null) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <MessagesSquare className="h-5 w-5 text-fg-subtle" />
                <p className="text-xs text-fg-muted">
                    Discussions happen on deliverables, and this file isn&apos;t in one.
                    {docId ? <> Tag it as <span className="font-medium text-fg">#{docId}</span> in a deliverable&apos;s thread to discuss it there.</> : null}
                </p>
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3 text-caption text-fg-muted">
                <DeliverableIcon hint />
                <span className="shrink-0">In</span>
                <span className="truncate font-medium text-fg" title={deliverable.name}>
                    {deliverable.docId ? `${deliverable.docId} · ` : ''}{deliverable.name}
                </span>
            </div>
            <div className="min-h-0 flex-1">
                <DocumentDocCommentsPane
                    engagementId={projectId}
                    documentId={deliverable.id}
                    documentName={deliverable.name}
                    orgSlug={orgSlug}
                    taggableDocuments={taggable}
                    initialDraft={docId ? `#${docId} ` : undefined}
                    focusDocId={docId ?? undefined}
                />
            </div>
        </div>
    )
}
