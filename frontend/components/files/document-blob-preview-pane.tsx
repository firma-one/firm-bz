'use client'

import { useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

const ZOOM_STEP = 15
const ZOOM_MIN  = 50
const ZOOM_MAX  = 200
const ZOOM_DEFAULT = 100

interface DocumentBlobPreviewPaneProps {
  document: any
  projectId?: string
}

export function DocumentBlobPreviewPane({ document, projectId }: DocumentBlobPreviewPaneProps) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  // pendingZoom tracks the zoom level being loaded; null means initial load
  const [pendingZoom, setPendingZoom] = useState<number | null>(null)
  // initialLoaded tracks first-ever load (shows full spinner, not transition)
  const [initialLoaded, setInitialLoaded] = useState(false)

  const zoomIn    = useCallback(() => setZoom(z => { const n = Math.min(ZOOM_MAX, z + ZOOM_STEP); setPendingZoom(n); return n }), [])
  const zoomOut   = useCallback(() => setZoom(z => { const n = Math.max(ZOOM_MIN, z - ZOOM_STEP); setPendingZoom(n); return n }), [])
  const zoomReset = useCallback(() => { setPendingZoom(ZOOM_DEFAULT); setZoom(ZOOM_DEFAULT) }, [])

  const effectiveProjectId = projectId ?? document.projectId

  if (!effectiveProjectId || !document.id) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
        Preview not available.
      </div>
    )
  }

  const baseUrl    = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(document.id)}/preview`
  const activeZoom = pendingZoom ?? zoom
  const previewUrl = `${baseUrl}#toolbar=0&zoom=${activeZoom}`

  const handleLoad = () => {
    setInitialLoaded(true)
    setPendingZoom(null)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Zoom toolbar */}
      <div className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white border-b border-[#e5e7eb] shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom out</TooltipContent>
        </Tooltip>

        <button
          type="button"
          onClick={zoomReset}
          className="min-w-[2.75rem] h-6 px-1.5 rounded text-[10px] font-mono text-slate-600 hover:text-slate-800 hover:bg-slate-100 tabular-nums"
          aria-label="Reset zoom"
        >
          {zoom}%
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={zoomIn}
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
              onClick={zoomReset}
              disabled={zoom === ZOOM_DEFAULT}
              className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Reset zoom</TooltipContent>
        </Tooltip>
      </div>

      {/* iframe area */}
      <div className="flex-1 min-h-0 relative bg-[#f3f4f6]">
        {/* Initial load spinner — only shown before first load */}
        {!initialLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f3f4f6] z-10">
            <LoadingSpinner size="md" />
          </div>
        )}

        {/* The iframe reloads when zoom changes (key prop).
            It starts transparent and fades in on load, so the previous render
            remains visible underneath during the reload — eliminating the blank flash. */}
        <iframe
          key={previewUrl}
          src={previewUrl}
          onLoad={handleLoad}
          className="absolute inset-0 w-full h-full border-0 transition-opacity duration-300"
          style={{ opacity: initialLoaded && pendingZoom !== null ? 0 : 1 }}
          title="Preview"
          allow="fullscreen"
        />
      </div>
    </div>
  )
}
