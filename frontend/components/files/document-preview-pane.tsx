'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAnySpreadsheetMime } from '@/lib/spreadsheet-mimes'
import { DocumentPdfPreviewPane } from '@/components/files/document-pdf-preview-pane'
import { DocumentSheetPreviewPane } from '@/components/files/document-sheet-preview-pane'

interface DocumentPreviewPaneProps {
    document: any
    projectId?: string
}

/**
 * Entry point for document preview: picks a renderer and owns the fallback between them.
 *
 * Spreadsheets render as a grid, because converting one to PDF produces a printed page of
 * something that has no pages — a sheet with no print setup becomes a single sheet-sized
 * page that is unreadable at any zoom. Everything else goes through pdf.js.
 *
 * The grid is best-effort. If the workbook cannot be fetched natively or cannot be parsed,
 * this falls back to the PDF pane, which still converts exactly as it did before — so the
 * worst case for a spreadsheet is the behaviour that shipped previously.
 */
export function DocumentPreviewPane({ document, projectId }: DocumentPreviewPaneProps) {
    const [sheetFailed, setSheetFailed] = useState(false)
    /** The user asked for page layout. Distinct from `sheetFailed`: this one is reversible,
     *  so the grid stays one click away. */
    const [printedRequested, setPrintedRequested] = useState(false)

    const isSpreadsheet = isAnySpreadsheetMime(document?.mimeType)

    // A different document deserves its own attempt; one unparseable workbook must not
    // condemn the next file opened into the same pane, and a choice made about one file
    // should not silently apply to the next.
    useEffect(() => {
        setSheetFailed(false)
        setPrintedRequested(false)
    }, [document?.id])

    const handleFallback = useCallback((reason: string) => {
        console.info(`[preview] rendering ${document?.fileName ?? document?.id} as PDF: ${reason}`)
        setSheetFailed(true)
    }, [document?.fileName, document?.id])

    if (isSpreadsheet && !sheetFailed && !printedRequested) {
        return (
            <DocumentSheetPreviewPane
                document={document}
                projectId={projectId}
                onFallback={handleFallback}
                onViewPrinted={() => setPrintedRequested(true)}
            />
        )
    }

    // The control is handed to the renderer rather than drawn here, so it sits in the
    // toolbar row with everything else. The PDF pane forwards it to the iframe pane it
    // falls back to, so it survives that hand-off — losing it there was the original bug.
    const canReturnToSheet = isSpreadsheet && !sheetFailed && printedRequested

    return (
        <DocumentPdfPreviewPane
            document={document}
            projectId={projectId}
            onBackToSheet={canReturnToSheet ? () => setPrintedRequested(false) : undefined}
        />
    )
}
