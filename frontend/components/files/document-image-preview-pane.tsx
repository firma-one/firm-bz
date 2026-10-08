'use client'

import { useMemo, useState } from 'react'
import { ZoomIn, ZoomOut, Undo2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { documentName } from '@/lib/preview-kinds'

const ZOOM_MIN = 25
const ZOOM_MAX = 400
const ZOOM_DEFAULT = 100
const ZOOM_PRESETS_STEP = 25

interface DocumentImagePreviewPaneProps {
    document: any
    projectId?: string
}

/**
 * Images, drawn with <img> rather than an iframe pointed at the preview route.
 *
 * That distinction is a security boundary, not a styling choice. SVG is script-bearing
 * markup; served as a document from our own origin it executes there, with the viewer's
 * session. An <img> never runs script in an SVG, so routing every image through this pane
 * closes that off. The route also sends a locked-down CSP for SVG in case the URL is
 * opened directly.
 */
export function DocumentImagePreviewPane({ document, projectId }: DocumentImagePreviewPaneProps) {
    const [zoom, setZoom] = useState(ZOOM_DEFAULT)

    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

    const src = useMemo(() => {
        if (!effectiveProjectId || !documentId) return null
        return `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview?native=1`
    }, [effectiveProjectId, documentId])

    if (!src) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                Preview not available.
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white border-b border-[#e5e7eb] shrink-0">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PRESETS_STEP))}
                            disabled={zoom <= ZOOM_MIN}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Zoom out</TooltipContent>
                </Tooltip>

                <span className="min-w-[2.75rem] h-6 px-1.5 inline-flex items-center justify-center text-[10px] font-mono text-slate-600 tabular-nums">
                    {zoom}%
                </span>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PRESETS_STEP))}
                            disabled={zoom >= ZOOM_MAX}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Zoom in</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setZoom(ZOOM_DEFAULT)}
                            disabled={zoom === ZOOM_DEFAULT}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Reset zoom"
                        >
                            <Undo2 className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Reset zoom</TooltipContent>
                </Tooltip>
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-[#f3f4f6] flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={documentName(document) || 'Preview'}
                    style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? '100%' : 'none' }}
                    className="object-contain"
                />
            </div>
        </div>
    )
}
