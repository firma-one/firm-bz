'use client'

import { useCallback, useEffect, useState } from 'react'
import { previewKind, documentName, type PreviewKind } from '@/lib/preview-kinds'
import { DocumentPdfPreviewPane } from '@/components/files/document-pdf-preview-pane'
import { DocumentSheetPreviewPane } from '@/components/files/document-sheet-preview-pane'
import { DocumentTextPreviewPane } from '@/components/files/document-text-preview-pane'
import { DocumentMediaPreviewPane } from '@/components/files/document-media-preview-pane'
import { DocumentArchivePreviewPane } from '@/components/files/document-archive-preview-pane'
import { DocumentImagePreviewPane } from '@/components/files/document-image-preview-pane'

interface DocumentPreviewPaneProps {
    document: any
    projectId?: string
}

/**
 * Entry point for document preview: picks a renderer and owns the fallback between them.
 *
 * Each specialised pane is best-effort. If it cannot fetch or parse the file it calls back
 * here, and the PDF pane takes over with exactly the conversion path that shipped before —
 * so the worst case for any file is the behavior it had previously.
 */
export function DocumentPreviewPane({ document, projectId }: DocumentPreviewPaneProps) {
    const [failed, setFailed] = useState(false)
    /** The reader asked for the other view of this document. Reversible, unlike a failure. */
    const [alternate, setAlternate] = useState(false)

    const kind: PreviewKind = previewKind(document?.mimeType, documentName(document))

    // A different document deserves its own attempt, and a choice made about one file
    // should not silently carry to the next.
    useEffect(() => {
        setFailed(false)
        setAlternate(false)
    }, [document?.id])

    const handleFallback = useCallback((reason: string) => {
        console.info(`[preview] ${documentName(document) || document?.id}: falling back to the converted view — ${reason}`)
        setFailed(true)
    }, [document, document?.id])

    if (!failed && !alternate) {
        switch (kind) {
            case 'sheet':
            case 'csv':
                return (
                    <DocumentSheetPreviewPane
                        document={document}
                        projectId={projectId}
                        onFallback={handleFallback}
                        // Only a real spreadsheet has a printed form worth offering; a
                        // delimited file converts to the same unreadable page the grid
                        // exists to replace.
                        onViewPrinted={kind === 'sheet' ? () => setAlternate(true) : undefined}
                    />
                )
            case 'text':
            case 'markdown':
            case 'html':
                return (
                    <DocumentTextPreviewPane
                        document={document}
                        projectId={projectId}
                        kind={kind}
                        onFallback={handleFallback}
                    />
                )
            case 'zip':
                return (
                    <DocumentArchivePreviewPane
                        document={document}
                        projectId={projectId}
                        onFallback={handleFallback}
                    />
                )
            case 'video':
            case 'audio':
                return <DocumentMediaPreviewPane document={document} projectId={projectId} kind={kind} />
            case 'image':
                return <DocumentImagePreviewPane document={document} projectId={projectId} />
            default:
                break
        }
    }

    // Offered only for a spreadsheet the reader chose to see as a printed page. A Google
    // Doc gets no alternate view: it already converts to PDF exactly as a .docx does, and
    // every other rendering of it would have fewer capabilities, not more.
    const alternateView = kind === 'sheet' && !failed && alternate
        ? { label: 'Switch to Sheet View', onSelect: () => setAlternate(false) }
        : undefined

    return (
        <DocumentPdfPreviewPane
            document={document}
            projectId={projectId}
            alternateView={alternateView}
        />
    )
}
