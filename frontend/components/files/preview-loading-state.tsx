'use client'

import { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { DocumentIcon } from '@/components/ui/document-icon'
import { formatFileSize, getFileTypeLabel } from '@/lib/utils'

/**
 * Shared loading overlay for both preview panes — the pdf.js pane
 * (document-pdf-preview-pane) and the iframe fallback pane (document-blob-preview-pane).
 *
 * It lives here rather than in either pane because which one is on screen depends on
 * whether the bytes turn out to be a PDF, which is not known until they arrive. An Office
 * document converts server-side to PDF and therefore renders in the pdf.js pane, so a
 * loading state implemented in only one of them is invisible for the slow cases that
 * actually need it.
 */

/**
 * Staged captions for a slow load, each shown once the preview has been running that long.
 *
 * The client cannot observe which server-side phase is running, so these are timed guesses
 * and each is worded to stay true whichever phase we are in — in particular, nothing claims
 * a retry until enough time has passed that the first conversion must already have failed.
 *
 * Calibrated against: an Office document converts in roughly 5-10s. If the provider rejects
 * that conversion, the server trims the workbook and converts again (spreadsheet-print-trim.ts),
 * costing a download, an upload and a second conversion.
 */
const LOADING_STAGES: ReadonlyArray<{ afterMs: number; message: string }> = [
    { afterMs: 3_000, message: 'Converting this file for preview…' },
    { afterMs: 10_000, message: 'Larger or more detailed files take a little longer to convert.' },
    { afterMs: 20_000, message: 'Still working — trying a simplified layout for this file.' },
]

interface PreviewLoadingStateProps {
    /** The file being previewed; name/mimeType/size are read for the metadata chip. */
    document: { name?: string; mimeType?: string; size?: string | number } | null | undefined
}

export function PreviewLoadingState({ document }: PreviewLoadingStateProps) {
    // Index into LOADING_STAGES; -1 until the first stage is due.
    const [stage, setStage] = useState(-1)

    useEffect(() => {
        const timers = LOADING_STAGES.map((s, i) => setTimeout(() => setStage(i), s.afterMs))
        return () => timers.forEach(clearTimeout)
    }, [])

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f3f4f6] z-10 px-6 text-center">
            <LoadingSpinner size="md" />

            {/* Name, type and size of the file being converted. All of it is already on the
                document record, so it renders from the first frame and costs no extra
                request — the point being to show *which* file is being worked on rather
                than a bare spinner. Sheet and page counts are deliberately absent: neither
                is indexed, and reading them would mean downloading the file just to label it. */}
            {document?.name && (
                <div className="flex items-center gap-2 max-w-xs">
                    <DocumentIcon mimeType={document.mimeType} size={20} />
                    <div className="min-w-0 text-left">
                        <p className="text-xs font-medium text-slate-600 truncate">{document.name}</p>
                        <p className="text-[11px] text-slate-400">
                            {getFileTypeLabel(document.mimeType ?? '')}
                            {document.size ? ` · ${formatFileSize(document.size)}` : ''}
                        </p>
                    </div>
                </div>
            )}

            {stage >= 0 && (
                <p
                    key={stage}
                    aria-live="polite"
                    className="text-xs text-slate-500 max-w-xs leading-relaxed animate-in fade-in duration-500"
                >
                    {LOADING_STAGES[stage].message}
                </p>
            )}
        </div>
    )
}
