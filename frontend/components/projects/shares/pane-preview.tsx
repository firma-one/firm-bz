'use client'

import { useSyncExternalStore } from 'react'
import { ScanEye } from 'lucide-react'
import { DocumentPreviewPane } from '@/components/files/document-preview-pane'
import { PreviewLocationStrip } from '@/components/files/preview-location-strip'
import type { PaneSize, useRightPane } from '@/lib/right-pane-context'

/** A document shown in the Board's right pane, with what its location strip says. */
export type PanePreviewDocument = {
    documentId: string
    externalId?: string | null
    fileName: string
    mimeType?: string | null
    folderPath: string[]
    /** In an approved deliverable, which is read here rather than opened. */
    approved: boolean
}

export const APPROVED_OPEN_OFF_REASON = 'Approved deliverables open in preview only'

type PaneControls = Pick<ReturnType<typeof useRightPane>, 'setTitle' | 'setHeaderSubtitle' | 'setHeaderIcon' | 'setIconTooltip' | 'setPaneSize'>

export interface PanePreview {
    get: () => PanePreviewDocument | null
    subscribe: (listener: () => void) => () => void
    /** Shows a document over the details. `sizeNow` is the pane's size to come back to. */
    open: (doc: PanePreviewDocument, sizeNow: PaneSize) => void
    /** Back to the details, at the size they were. False when no preview was open. */
    close: () => boolean
}

/**
 * The preview open over a deliverable's details. Held outside the panel so the Board's pane wiring (the
 * close guard, the header) and the panel share one answer to "is a preview open?".
 *
 * Closing restores the pane's size as well as its header: a preview is often enlarged just to read it.
 */
export function createPanePreview(pane: PaneControls, showDetailsHeader: () => void): PanePreview {
    let current: PanePreviewDocument | null = null
    let returnSize: PaneSize = 'medium'
    const listeners = new Set<() => void>()
    const changed = () => listeners.forEach((listener) => listener())

    return {
        get: () => current,
        subscribe: (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        open: (doc, sizeNow) => {
            if (!current) returnSize = sizeNow
            current = doc
            pane.setTitle(doc.fileName)
            pane.setHeaderSubtitle('')
            pane.setHeaderIcon(<ScanEye className="h-4 w-4" />)
            pane.setIconTooltip('Preview')
            changed()
        },
        close: () => {
            if (!current) return false
            current = null
            showDetailsHeader()
            pane.setPaneSize(returnSize)
            changed()
            return true
        },
    }
}

const NO_SUBSCRIPTION = () => () => {}
const NO_PREVIEW = () => null

export function usePanePreview(preview: PanePreview | undefined): PanePreviewDocument | null {
    return useSyncExternalStore(preview?.subscribe ?? NO_SUBSCRIPTION, preview?.get ?? NO_PREVIEW, NO_PREVIEW)
}

/** A document's preview with its location strip. */
export function LocatedDocumentPreview({ doc, projectId, filesBase, openLabel, onOpen }: {
    doc: PanePreviewDocument
    projectId: string
    /** The engagement's Files page, for the Open in Files deep link. */
    filesBase?: string
    openLabel: string
    onOpen?: (doc: PanePreviewDocument) => void
}) {
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <PreviewLocationStrip
                folderPath={doc.folderPath}
                filesUrl={filesBase ? `${filesBase}#doc-file:${doc.documentId}` : null}
                openLabel={openLabel}
                onOpen={onOpen ? () => onOpen(doc) : undefined}
                openOffReason={doc.approved ? APPROVED_OPEN_OFF_REASON : null}
            />
            <div className="flex min-h-0 flex-1 flex-col">
                <DocumentPreviewPane document={{ id: doc.documentId, name: doc.fileName }} projectId={projectId} />
            </div>
        </div>
    )
}
