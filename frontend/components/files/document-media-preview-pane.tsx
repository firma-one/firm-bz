'use client'

import { useMemo } from 'react'
import { documentName, type PreviewKind } from '@/lib/preview-kinds'
import { PreviewUnavailable, useMediaFailure } from '@/components/files/preview-unavailable'

interface DocumentMediaPreviewPaneProps {
    document: any
    projectId?: string
    kind: Extract<PreviewKind, 'video' | 'audio'>
}

/**
 * Video and audio, played from the provider's own bytes.
 *
 * The element is pointed straight at the preview route rather than at a blob, so playback
 * starts on the first chunk and seeking issues byte-range requests the route forwards
 * upstream. Buffering the whole file first — as a blob would — makes anything long
 * unwatchable.
 */
export function DocumentMediaPreviewPane({ document, projectId, kind }: DocumentMediaPreviewPaneProps) {
    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

    const src = useMemo(() => {
        if (!effectiveProjectId || !documentId) return null
        return `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview?native=1`
    }, [effectiveProjectId, documentId])
    // A refused file used to leave a black pane with dead controls (P1-40).
    const media = useMediaFailure(src)

    if (!src) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                Preview not available.
            </div>
        )
    }

    if (media.failed) return <PreviewUnavailable reason={media.reason} onReload={media.reload} dark />

    if (kind === 'audio') {
        return (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 bg-[#f3f4f6] p-6">
                <p className="text-xs text-slate-500 text-center break-words max-w-full">
                    {documentName(document) || 'Audio'}
                </p>
                <audio key={media.attempt} src={src} controls controlsList="nodownload" onError={media.fail} className="w-full max-w-md" />
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
            <video
                key={media.attempt}
                src={src}
                onError={media.fail}
                controls
                controlsList="nodownload"
                playsInline
                className="max-w-full max-h-full"
            />
        </div>
    )
}
