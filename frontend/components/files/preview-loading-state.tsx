'use client'

import { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { DocumentIcon } from '@/components/ui/document-icon'
import { formatFileSize, getFileTypeLabel } from '@/lib/utils'
import { previewKind, documentName } from '@/lib/preview-kinds'

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
const CONVERTING_STAGES: ReadonlyArray<{ afterMs: number; message: string }> = [
    { afterMs: 3_000, message: 'Converting this file for preview…' },
    { afterMs: 10_000, message: 'Larger or more detailed files take a little longer to convert.' },
    { afterMs: 20_000, message: 'Still working — trying a simplified layout for this file.' },
]

/**
 * A PDF, an image, or anything else rendered from its original bytes is never converted —
 * the wait is the download. Telling the reader their 15 MB PDF is being "converted" is
 * simply untrue, and it misattributes the delay to the server when it is the transfer.
 */
const DOWNLOADING_STAGES: ReadonlyArray<{ afterMs: number; message: string }> = [
    { afterMs: 3_000, message: 'Downloading this file…' },
    { afterMs: 10_000, message: 'Larger files take a little longer to transfer.' },
    { afterMs: 20_000, message: 'Still downloading — this is a large file.' },
]

/** Only these convert server-side; everything else is served as stored. */
function isConverted(document: any): boolean {
    return previewKind(document?.mimeType, documentName(document)) === 'office'
}

interface PreviewLoadingStateProps {
    /** The file being previewed; name/mimeType/size are read for the metadata chip. */
    document: { name?: string; mimeType?: string; size?: string | number } | null | undefined
}

export function PreviewLoadingState({ document }: PreviewLoadingStateProps) {
    // Index into the chosen stage list; -1 until the first stage is due.
    const [stage, setStage] = useState(-1)
    const stages = isConverted(document) ? CONVERTING_STAGES : DOWNLOADING_STAGES

    useEffect(() => {
        const timers = stages.map((s, i) => setTimeout(() => setStage(i), s.afterMs))
        return () => timers.forEach(clearTimeout)
        // The list is derived from the document, which does not change while one preview is
        // loading; re-running on identity alone would restart every timer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document?.mimeType])

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
                    {stages[stage].message}
                </p>
            )}
        </div>
    )
}
